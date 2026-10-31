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
      // 压限器：近处连射时多发枪声尾音叠在一起也不会爆音
      this.comp = this.ctx.createDynamicsCompressor();
      this.comp.threshold.value = -12; this.comp.knee.value = 8; this.comp.ratio.value = 6;
      this.comp.attack.value = 0.002; this.comp.release.value = 0.12;
      this.muffle.connect(this.comp);
      this.comp.connect(this.master);
      this.master.connect(this.ctx.destination);
      // 共享白噪声缓冲（脚步、爆炸、烟雾都从这里取片段，不必每次重新生成）
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.loadSamples();
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
  // 内嵌录音解码（assets_snd.js 里的 base64 WAV）。解码是异步的，没解码好之前用合成音顶上
  loadSamples() {
    this.smp = {};
    this.voices = [];
    if (typeof SND_DATA === "undefined") return;
    for (const key in SND_DATA) {
      try {
        const bin = atob(SND_DATA[key]);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        // 回调写法：老版本 iOS Safari 的 decodeAudioData 不返回 Promise
        this.ctx.decodeAudioData(bytes.buffer, buf => { this.smp[key] = buf; }, () => {});
      } catch (e) {}
    }
  }
  // 播放一段录音：rate 变调，lp 低通截止频率（远处高频衰减得多），返回是否播成功
  playSample(key, vol, pan, rate = 1, lp = 0, delay = 0) {
    const buf = this.smp && this.smp[key];
    if (!buf || vol <= 0.003) return !!buf;
    const now = this.ctx.currentTime;
    // 同时发声上限：手机上几十个声音叠在一起会卡，最老的先掐掉
    this.voices = this.voices.filter(v => v.end > now);
    if (this.voices.length >= 18) { const v = this.voices.shift(); try { v.src.stop(); } catch (e) {} }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    let node = src;
    if (lp && lp < 16000) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = lp; f.Q.value = 0.5;
      src.connect(f); node = f;
    }
    node.connect(g); g.connect(this.out(pan));
    src.start(now + delay);
    this.voices.push({ src, end: now + delay + buf.duration / rate });
    return true;
  }
  // 合成枪声（录音还没解码好时的后备，也用于空手挥拳）
  shotBuffer(isSuppressed) {
    const key = isSuppressed ? "shotBufsS" : "shotBufsL";
    if (!this[key]) {
      const sr = this.ctx.sampleRate, dur = isSuppressed ? 0.065 : 0.13, tau = sr * (isSuppressed ? 0.016 : 0.035);
      this[key] = [];
      for (let v = 0; v < 4; v++) {
        const buf = this.ctx.createBuffer(1, Math.floor(sr * dur), sr);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / tau);
        this[key].push(buf);
      }
      this.shotBufIdx = 0;
    }
    this.shotBufIdx = (this.shotBufIdx + 1) % 4;
    return this[key][this.shotBufIdx];
  }
  synthShot(isSuppressed, weight, volScale, pan) {
    const now = this.ctx.currentTime;
    const dur = isSuppressed ? 0.065 : 0.13;
    const src = this.ctx.createBufferSource();
    src.buffer = this.shotBuffer(isSuppressed);
    const filter = this.ctx.createBiquadFilter();
    filter.type = isSuppressed ? "bandpass" : "lowpass";
    filter.frequency.setValueAtTime(isSuppressed ? 1050 : (1700 / weight), now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime((isSuppressed ? 0.25 : 0.65) * volScale, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.out(pan));
    src.start(now);
  }
  playPunch() { this.init(); this.synthShot(true, 2.0, 1, 0); }
  // 枪声：按枪种用不同的真实录音（5.56 步枪 / 7.62 步枪 / 冲锋枪 / 霰弹 / 连狙 / 栓狙 / 消音），
  // 远处的枪声：音量按距离衰减、高频被空气吃掉（低通），再叠一层远处传来的闷响回声
  playShot(isSuppressed, weight = 1.0, dist = 0, pan = 0, wId = "m416") {
    this.init();
    const maxD = isSuppressed ? 110 : 650;
    if (dist >= maxD) return;
    const prof = SHOT_SOUND_PROFILE[wId] || SHOT_SOUND_PROFILE.m416;
    const rate = (isSuppressed ? prof.sr : prof.r) * (0.97 + Math.random() * 0.06);
    const key = isSuppressed ? "supp" : prof.k;
    // 近处 1 → 远处按“1/距离”衰减（参考距离 18 米），最远处平滑归零
    const fall = 1 / (1 + dist / 18) * (1 - Math.pow(dist / maxD, 2));
    const lp = dist < 15 ? 0 : Math.max(isSuppressed ? 1400 : 900, 16000 * Math.exp(-dist / (isSuppressed ? 40 : 130)));
    const near = isSuppressed ? Math.max(0, 1 - dist / 70) : 1 - smoothstepN(70, 320, dist);
    const vol = (isSuppressed ? 0.5 : 0.62) * prof.g * fall;
    const ok = this.playSample(key, vol * (isSuppressed ? 1 : 0.35 + 0.65 * near), pan, rate, lp);
    if (!ok) { const vs = Math.max(0, 1 - dist / 240); if (vs > 0.02) this.synthShot(isSuppressed, weight, vs, pan); return; }
    // 远处的闷响 / 山谷回声：离得越远越占主导
    if (!isSuppressed && dist > 45) this.playSample("distant", Math.min(0.75, vol * 2.6) * smoothstepN(45, 200, dist), pan, prof.r * 0.95, 0, 0.012);
  }
  // 拉栓 / 泵动：栓狙用枪栓录音，S1897 用泵动录音
  playBoltCycle(wId) {
    this.init();
    const sg = WEAPONS_DATA[wId] && WEAPONS_DATA[wId].type === "SG";
    if (!this.playSample(sg ? "pump" : "bolt", 0.55, 0, sg ? 1.12 : (wId === "awm" ? 1.0 : 1.08))) this.playBoltAction();
  }
  // 子弹打在身边：一部分会弹飞出“啾”的跳弹声
  playRicochet(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 45);
    if (v < 0.02) return;
    if (Math.random() < 0.4 && this.playSample("rico", 0.42 * v, pan, 0.9 + Math.random() * 0.25, 0)) return;
    this.noiseBurst(0.04, "bandpass", 3200, 3, v * 0.16, pan, 0.04);
  }
  // 脚步声：按地面材质（草地/柏油/土路/木地板/石头水泥）合成，带方位
  playFootstep(surface = "grass", vol = 0.15, pan = 0, crawl = false) {
    this.init();
    if (vol <= 0.004) return;
    if (crawl) { this.noiseBurst(0.22, "bandpass", 900, 0.6, vol * 0.8, pan, 0.22); return; }
    if (surface === "water") {
      // 蹚水：低沉的哗啦声 + 水花溅起的嘶声
      this.noiseBurst(0.32, "lowpass", 700, 0.8, vol * 1.5, pan, 0.32, 260);
      this.noiseBurst(0.22, "bandpass", 2600, 0.7, vol * 0.7, pan, 0.22, 1200);
      return;
    }
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
  // 玻璃碎裂：一声脆响 + 几片碎玻璃落地的叮当声
  playGlass(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 120);
    if (v < 0.02) return;
    this.noiseBurst(0.18, "highpass", 3800, 0.7, 0.32 * v, pan, 0.18);
    this.noiseBurst(0.09, "bandpass", 6200, 3, 0.2 * v, pan, 0.09);
    for (let k = 0; k < 4; k++) {
      const t = this.ctx.currentTime + 0.08 + Math.random() * 0.35;
      const o = this.ctx.createOscillator(), g = this.ctx.createGain();
      o.type = "sine"; o.frequency.value = 3200 + Math.random() * 3800;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.06 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g); g.connect(this.out(pan)); o.start(t); o.stop(t + 0.14);
    }
  }
  // 子弹擦着耳边飞过的破空声
  playWhiz(pan) {
    this.init();
    if (this.playSample("whiz", 0.5, pan, 0.92 + Math.random() * 0.16)) return;
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

function smoothstepN(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

// 每把枪用哪段录音（k）、播放速率 r（>1 更尖更脆，<1 更沉）、消音时速率 sr、音量 g
const SHOT_SOUND_PROFILE = {
  m416: { k: "ar556", r: 1.0, sr: 1.0, g: 1 }, aug: { k: "ar556", r: 1.04, sr: 1.04, g: 1 }, scar: { k: "ar556", r: 0.95, sr: 0.97, g: 1 },
  m16a4: { k: "ar556", r: 1.02, sr: 1.0, g: 1 }, m249: { k: "ar556", r: 0.93, sr: 0.95, g: 1.05 },
  beryl: { k: "ar762", r: 1.04, sr: 0.94, g: 1.05 }, akm: { k: "ar762", r: 1.0, sr: 0.92, g: 1.05 }, mk47: { k: "ar762", r: 0.95, sr: 0.9, g: 1.05 },
  dp28: { k: "ar762", r: 0.88, sr: 0.9, g: 1.1 },
  ump45: { k: "smg", r: 0.9, sr: 1.05, g: 0.9 }, vector: { k: "smg", r: 1.1, sr: 1.15, g: 0.85 }, uzi: { k: "smg", r: 1.14, sr: 1.18, g: 0.85 },
  mp5k: { k: "smg", r: 1.0, sr: 1.1, g: 0.88 },
  s1897: { k: "sg", r: 1.0, sr: 1, g: 1.1 }, s686: { k: "sg", r: 0.95, sr: 1, g: 1.15 }, s12k: { k: "sg", r: 1.06, sr: 1, g: 1.05 }, dbs: { k: "sg", r: 1.03, sr: 1, g: 1.05 },
  slr: { k: "dmr", r: 0.96, sr: 0.88, g: 1.1 }, sks: { k: "dmr", r: 1.02, sr: 0.9, g: 1.05 }, mini14: { k: "dmr", r: 1.12, sr: 0.98, g: 1.0 },
  dragunov: { k: "dmr", r: 0.92, sr: 0.86, g: 1.1 }, mk14: { k: "dmr", r: 0.98, sr: 0.88, g: 1.1 },
  kar98k: { k: "sr", r: 1.0, sr: 0.84, g: 1.15 }, m24: { k: "sr", r: 1.05, sr: 0.86, g: 1.1 }, awm: { k: "sr", r: 0.9, sr: 0.8, g: 1.25 },
  amr: { k: "sr", r: 0.76, sr: 0.75, g: 1.35 }
};

// 声源相对镜头的左右方位（-1 左 ~ 1 右），用于脚步/枪声/爆炸定位
function stereoPanFor(x, z) {
  const dx = x - playerRig.position.x, dz = z - playerRig.position.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return 0;
  return Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / len)) * 0.85;
}

// 脚下材质：楼内木地板、屋顶/桥面/遗迹石头、柏油路、土路、草地
function surfaceTypeAt(x, z, feetY) {
  if (waterDepthAt(z, feetY) > 0.02) return "water";
  if (feetY - terrainH(x, z) > 0.1) {
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
  if (!AI_DIFF.steps) return; // 简单难度的 AI 不听脚步
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
