// audio.js：声音雷达标记与全部音效（枪声、脚步声、爆炸等）
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 2. 声纹雷达与音效系统
// ============================================================================
const radarSoundMarkers = [];

function registerRadarSound(type, wx, wz, isSuppressed = false) {
  if (player.phase !== "ground") return;
  const dist = Math.hypot(wx - playerRig.position.x, wz - playerRig.position.z);
  const maxHearDist = type === "shot" ? (isSuppressed ? 85 : 220) : 38;
  if (dist > maxHearDist) return;
  radarSoundMarkers.push({
    type, x: wx, z: wz, born: performance.now(),
    maxAge: type === "shot" ? 1300 : 650
  });
}

class SoundEngine {
  constructor() { this.ctx = null; this.noise = null; this.master = null; this.muffle = null; }
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // 总线：所有音效 → 闷音滤波（震爆弹耳鸣时压低）→ 总音量 → 扬声器
      this.muffle = this.ctx.createBiquadFilter();
      this.muffle.type = "lowpass";
      this.muffle.frequency.value = 20000;
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.muffle.connect(this.master);
      this.master.connect(this.ctx.destination);
      // 共享白噪声缓冲（脚步、爆炸、烟雾都从这里取片段，不必每次重新生成）
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  // 输出端：带左右声道定位（pan: -1 左 ~ 1 右）
  out(pan) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.muffle);
      return p;
    }
    return this.muffle;
  }
  noiseBurst(dur, filterType, freq, q, vol, pan, decay, freqEnd) {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, now);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (decay || dur));
    src.connect(f); f.connect(g); g.connect(this.out(pan));
    src.start(now, Math.random() * 1.5, dur + 0.05);
  }
  playShot(isSuppressed, weight = 1.0, dist = 0, pan = 0) {
    this.init();
    const volScale = Math.max(0, 1 - dist / 240);
    if (volScale <= 0.02) return;
    const now = this.ctx.currentTime;
    const dur = isSuppressed ? 0.065 : 0.13;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * (isSuppressed ? 0.016 : 0.035)));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = isSuppressed ? "bandpass" : "lowpass";
    filter.frequency.setValueAtTime(isSuppressed ? 1050 : (1700 / weight), now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime((isSuppressed ? 0.25 : 0.65) * volScale, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.out(pan));
    src.start(now);
  }
  // 脚步声：按地面材质（草地/柏油/土路/木地板/石头水泥）合成，带方位
  playFootstep(surface = "grass", vol = 0.15, pan = 0, crawl = false) {
    this.init();
    if (vol <= 0.004) return;
    if (crawl) { this.noiseBurst(0.22, "bandpass", 900, 0.6, vol * 0.8, pan, 0.22); return; }
    if (surface === "grass") {
      this.noiseBurst(0.11, "lowpass", 1400, 0.7, vol * 0.9, pan, 0.1);
      this.noiseBurst(0.05, "highpass", 3500, 0.5, vol * 0.25, pan, 0.05);
    } else if (surface === "gravel") {
      this.noiseBurst(0.09, "bandpass", 2400, 0.9, vol, pan, 0.09);
      this.noiseBurst(0.06, "highpass", 4200, 0.6, vol * 0.35, pan, 0.06);
    } else if (surface === "wood") {
      this.noiseBurst(0.07, "bandpass", 520, 2.2, vol * 1.3, pan, 0.07);
      this.thump(105, 0.06, vol * 0.9, pan);
    } else {
      // 柏油 / 水泥 / 石头：清脆的鞋底敲击
      this.noiseBurst(0.05, "bandpass", 1900, 1.4, vol * 1.1, pan, 0.05);
      this.thump(85, 0.05, vol * 0.6, pan);
    }
  }
  thump(freq, dur, vol, pan) {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    osc.connect(g); g.connect(this.out(pan));
    osc.start(now); osc.stop(now + dur + 0.02);
  }
  playLanding(strength) {
    this.init();
    this.thump(70, 0.16, 0.35 * strength + 0.1, 0);
    this.noiseBurst(0.12, "lowpass", 900, 0.7, 0.18 * strength + 0.05, 0, 0.12);
  }
  playExplosion(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 420);
    if (v <= 0.01) return;
    this.noiseBurst(1.6, "lowpass", 1600, 0.8, 0.9 * v, pan, 1.6, 120);
    this.thump(55, 0.7, 0.9 * v, pan);
  }
  // 开门：木门轴吱呀一声；关门：门板撞上门框的闷响
  playDoor(open, dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 45);
    if (v < 0.01) return;
    if (open) {
      this.noiseBurst(0.42, "bandpass", 480, 7, 0.16 * v, pan, 0.42, 1250);
      this.noiseBurst(0.05, "bandpass", 2400, 2, 0.08 * v, pan, 0.05);
    } else {
      this.thump(95, 0.12, 0.28 * v, pan);
      this.noiseBurst(0.1, "lowpass", 900, 0.8, 0.14 * v, pan, 0.1);
    }
  }
  playThrow() { this.init(); this.noiseBurst(0.18, "bandpass", 1300, 0.8, 0.12, 0, 0.18, 500); }
  playPinPull() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(2600, now);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(g); g.connect(this.out(0));
    osc.start(now); osc.stop(now + 0.05);
  }
  // 子弹擦着耳边飞过的破空声
  playWhiz(pan) {
    this.init();
    this.noiseBurst(0.07, "bandpass", 5200, 2.2, 0.22, pan, 0.07, 2600);
    this.noiseBurst(0.03, "highpass", 6500, 0.7, 0.12, pan, 0.03);
  }
  playBounce(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 45) * 0.16;
    if (v > 0.005) this.noiseBurst(0.04, "bandpass", 3200, 3, v, pan, 0.04);
  }
  playSmokeHiss(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 70) * 0.2;
    if (v > 0.005) this.noiseBurst(3.2, "highpass", 2600, 0.6, v, pan, 3.2);
  }
  playIgnite(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 90) * 0.55;
    if (v > 0.005) this.noiseBurst(0.9, "lowpass", 700, 0.9, v, pan, 0.9, 2400);
  }
  // 震爆弹：耳鸣 + 整体声音发闷，持续若干秒后恢复
  stunEars(intensity, seconds) {
    this.init();
    const now = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(now);
    this.muffle.frequency.setValueAtTime(Math.max(250, 2200 * (1 - intensity)), now);
    this.muffle.frequency.exponentialRampToValueAtTime(20000, now + seconds);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 3400;
    g.gain.setValueAtTime(0.12 * intensity, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + seconds);
    osc.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + seconds + 0.05);
  }
  playBoltAction() {
    this.init();
    const now = this.ctx.currentTime;
    [0.14, 0.42].forEach((offset, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(idx === 0 ? 520 : 680, now + offset);
      osc.frequency.exponentialRampToValueAtTime(180, now + offset + 0.09);
      gain.gain.setValueAtTime(0.24, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.09);
      osc.connect(gain); gain.connect(this.muffle);
      osc.start(now + offset); osc.stop(now + offset + 0.09);
    });
  }
  playHit(isHeadshot) {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isHeadshot ? "triangle" : "sine";
    osc.frequency.setValueAtTime(isHeadshot ? 1650 : 380, now);
    if (isHeadshot) osc.frequency.exponentialRampToValueAtTime(2450, now + 0.08);
    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
    osc.connect(gain); gain.connect(this.muffle);
    osc.start(now); osc.stop(now + 0.09);
  }
  playKillConfirm() {
    this.init();
    const now = this.ctx.currentTime;
    [520, 780, 1040].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.3, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.06 + 0.14);
      osc.connect(gain); gain.connect(this.muffle);
      osc.start(now + idx * 0.06); osc.stop(now + idx * 0.06 + 0.14);
    });
  }
}
const sfx = new SoundEngine();

// 声源相对镜头的左右方位（-1 左 ~ 1 右），用于脚步/枪声/爆炸定位
function stereoPanFor(x, z) {
  const dx = x - playerRig.position.x, dz = z - playerRig.position.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return 0;
  return Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / len)) * 0.85;
}

// 脚下材质：楼内木地板、屋顶/桥面/遗迹石头、柏油路、土路、草地
function surfaceTypeAt(x, z, feetY) {
  if (feetY > 0.1) {
    const b = getBuildingContainingPoint(x, z, 0);
    if (b && b.kind !== "ruin" && (b.roofY === null || feetY < b.roofY - 0.3)) return "wood";
    return "stone";
  }
  const ruins = POI_BY_KEY.ruins;
  if (Math.hypot(x - ruins.x, z - ruins.z) < 32) return "stone";
  if (roadEdgeDistance(x, z, 8) < 0) return roadQueryKind === "dirt" ? "gravel" : "asphalt";
  return "grass";
}

// AI 听到玩家脚步：附近（站立跑动 20 米、蹲走 8 米、趴下听不到）且看不见玩家的 AI 会转头望向声音方向，
// 并记下大概位置（据此决定是蹲着阴人还是摸过去）
function notifyBotsOfPlayerStep() {
  const r = player.stance === "stand" ? 20 : (player.stance === "crouch" ? 8 : 0);
  if (r <= 0) return;
  const now = performance.now();
  for (let i = 0; i < aiPlayers.length; i++) {
    const bot = aiPlayers[i];
    if (!bot.alive || bot.phase !== "ground") continue;
    const d = Math.hypot(bot.group.position.x - playerRig.position.x, bot.group.position.z - playerRig.position.z);
    if (d >= r) continue;
    if (now > bot.faceHintUntil) setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 1200);
    if (!bot.lkp || now - bot.lkp.t > 400) botLearnPlayerPos(bot, now, 0.12);
  }
}
