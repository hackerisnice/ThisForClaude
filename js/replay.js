// replay.js：淘汰回放 —— 一直在后台录制最近 16 秒的战场（所有人的位置、动作、子弹轨迹、投掷物、淘汰），
// 阵亡后可以看“自己是怎么被淘汰的”，也能回看自己最近的一次击杀；淘汰瞬间自动慢动作
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const REC_HZ = 20, REC_SECONDS = 16;
const REC_CAP = REC_HZ * REC_SECONDS;
const RB_STRIDE = 25;   // 每个 AI 每帧记录的数值个数
const RP_STRIDE = 15;   // 玩家每帧记录的数值个数
const REC_BOTS = aiPlayers.length;
const STANCE_CODE = { stand: 0, crouch: 1, prone: 2 };
const PHASE_CODE = { plane: 0, sky: 1, chute: 2, ground: 3, dead: 4 };

const replayRec = {
  clock: 0,          // 录像时钟（战场模拟时间，回放播放时暂停）
  nextAt: 0,
  head: 0,           // 下一帧写入位置（环形缓冲）
  count: 0,
  times: new Float64Array(REC_CAP),
  P: new Float32Array(REC_CAP * RP_STRIDE),
  B: new Float32Array(REC_CAP * REC_BOTS * RB_STRIDE),
  T: new Array(REC_CAP).fill(null),   // 每帧飞行中的投掷物：[id, x, y, z, id, x, y, z, ...]
  events: [],
  pending: [],       // 事件发生后还要再录一小段才能生成的片段
  deathClip: null,
  deathPending: false,
  killPending: 0,
  killClips: []
};

// ---------------------------------------------------------------------------
// 录制
// ---------------------------------------------------------------------------
const _rq = new THREE.Vector3();
function writeBotState(bot, A, o) {
  const g = bot.group;
  _rq.set(0, 0, 1).applyQuaternion(g.quaternion);
  A[o] = (g.visible ? 1 : 0) | (bot.chuteMesh.visible ? 2 : 0) | (bot.botGunMesh.visible ? 4 : 0) |
    (bot.vestMesh.visible ? 8 : 0) | (bot.helmetMesh.visible ? 16 : 0) | (bot.packMesh.visible ? 32 : 0) | (bot.scopeMesh.visible ? 64 : 0);
  A[o + 1] = g.position.x; A[o + 2] = g.position.y; A[o + 3] = g.position.z;
  A[o + 4] = Math.atan2(_rq.x, _rq.z);
  A[o + 5] = bot.legLPivot.rotation.x; A[o + 6] = bot.legRPivot.rotation.x;
  A[o + 7] = bot.upper.rotation.x; A[o + 8] = bot.upper.rotation.y; A[o + 9] = bot.upper.position.y;
  A[o + 10] = bot.armLPivot.rotation.x; A[o + 11] = bot.armLPivot.rotation.y; A[o + 12] = bot.armLPivot.rotation.z;
  A[o + 13] = bot.armRPivot.rotation.x; A[o + 14] = bot.armRPivot.rotation.y; A[o + 15] = bot.armRPivot.rotation.z;
  A[o + 16] = bot.botGunMesh.position.x; A[o + 17] = bot.botGunMesh.position.y; A[o + 18] = bot.botGunMesh.position.z;
  A[o + 19] = bot.botGunMesh.rotation.x;
  A[o + 20] = bot.vestLv; A[o + 21] = bot.helmLv; A[o + 22] = bot.bagLv; A[o + 23] = bot.alive ? 1 : 0;
  A[o + 24] = bot.head.rotation.z; // 开镜歪头贴腮
}
function writePlayerState(A, o) {
  A[o] = playerRig.position.x; A[o + 1] = player.feetY; A[o + 2] = playerRig.position.z;
  A[o + 3] = yaw; A[o + 4] = pitch;
  A[o + 5] = STANCE_CODE[player.stance] || 0;
  A[o + 6] = PHASE_CODE[player.phase] === undefined ? 3 : PHASE_CODE[player.phase];
  A[o + 7] = (player.isADS || player.isFiring || player.burstRemaining > 0 || player.aimingThrow) ? 1 : 0;
  A[o + 8] = player.weapons[player.activeSlot] ? 1 : 0;
  A[o + 9] = player.hp;
  A[o + 10] = player.helm ? player.helm.lv : 0; A[o + 11] = player.vest ? player.vest.lv : 0; A[o + 12] = player.bagLv || 0;
  const w = player.weapons[player.activeSlot];
  A[o + 13] = w && w.attachments && w.attachments.scope ? 1 : 0;
  A[o + 14] = player.isADS ? 1 : 0;
}

function replayRecordTick(dt) {
  const R = replayRec;
  R.clock += dt;
  if (R.clock >= R.nextAt) {
    R.nextAt = R.clock + 1 / REC_HZ;
    const i = R.head;
    R.times[i] = R.clock;
    writePlayerState(R.P, i * RP_STRIDE);
    for (let b = 0; b < REC_BOTS; b++) writeBotState(aiPlayers[b], R.B, (i * REC_BOTS + b) * RB_STRIDE);
    if (activeThrows.length) {
      const arr = [];
      activeThrows.forEach(t => arr.push(t.id, t.p.x, t.p.y, t.p.z));
      R.T[i] = arr;
    } else R.T[i] = null;
    R.head = (i + 1) % REC_CAP;
    R.count = Math.min(REC_CAP, R.count + 1);
    // 丢掉录像窗口之外的旧事件
    const cut = R.clock - REC_SECONDS - 1;
    let k = 0;
    while (k < R.events.length && R.events[k].t < cut) k++;
    if (k) R.events.splice(0, k);
  }
  for (let k = R.pending.length - 1; k >= 0; k--) {
    if (R.clock >= R.pending[k].at) { const job = R.pending[k]; R.pending.splice(k, 1); job.make(); }
  }
}

// 把环形缓冲里 [t0, t1] 这段复制成一个独立片段（之后录像继续覆盖也不影响）
function makeReplayClip(t0, t1, meta) {
  const R = replayRec, idx = [];
  for (let k = 0; k < R.count; k++) {
    const i = (R.head - R.count + k + REC_CAP) % REC_CAP;
    if (R.times[i] >= t0 && R.times[i] <= t1) idx.push(i);
  }
  if (idx.length < 4) return null;
  const n = idx.length, bs = REC_BOTS * RB_STRIDE;
  const clip = Object.assign({
    times: new Float64Array(n), P: new Float32Array(n * RP_STRIDE), B: new Float32Array(n * bs), T: new Array(n),
    events: R.events.filter(e => e.t >= t0 - 0.3 && e.t <= t1)
  }, meta);
  idx.forEach((i, j) => {
    clip.times[j] = R.times[i];
    clip.P.set(R.P.subarray(i * RP_STRIDE, (i + 1) * RP_STRIDE), j * RP_STRIDE);
    clip.B.set(R.B.subarray(i * bs, (i + 1) * bs), j * bs);
    clip.T[j] = R.T[i];
  });
  clip.t0 = clip.times[0];
  clip.t1 = clip.times[n - 1];
  return clip;
}

// 事件：开枪（shooter：-1 = 玩家，>=0 = AI 编号）。ends = 每发子弹的终点 [x,y,z,...]，
// impacts = 每发的结果（0 擦身飞过 / 1 打中人 / 2 打在地面墙面），连射每发间隔 gap 秒
function replayShotEvent(shooter, fx, fy, fz, ends, impacts, gap = 0.09) {
  if (replayState.active) return;
  replayRec.events.push({ t: replayRec.clock, type: "shot", s: shooter, fx, fy, fz, ends, impacts, gap });
}
// AI 开枪：子弹从真实枪口出发。打中 → 落在目标身上；没打中 → 从目标身边擦过飞远
// （偏差按距离和是否开镜决定，开镜后的偏差明显更小）
const _rpMz = new THREE.Vector3(), _rpDir = new THREE.Vector3(), _rpPerp = new THREE.Vector3();
function replayBotShot(bot, tx, ty, tz, hit, n = 1) {
  if (replayState.active) return;
  const m = botMuzzlePosition(bot, _rpMz);
  const ends = [], impacts = [];
  for (let k = 0; k < n; k++) {
    const kHit = hit && (k === 0 || Math.random() < 0.35);
    _rpDir.set(tx - m.x, ty - m.y, tz - m.z);
    const d = _rpDir.length() || 1;
    _rpDir.divideScalar(d);
    if (kHit) {
      ends.push(tx + (Math.random() - 0.5) * 0.25, ty + (Math.random() - 0.5) * 0.35, tz + (Math.random() - 0.5) * 0.25);
      impacts.push(1);
      continue;
    }
    // 垂直于弹道方向的随机偏移
    _rpPerp.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5);
    _rpPerp.addScaledVector(_rpDir, -_rpPerp.dot(_rpDir)).normalize();
    const r = 0.45 + Math.random() * (0.3 + d * 0.012 * (1.6 - bot.adsBlend));
    _rpDir.set(tx + _rpPerp.x * r - m.x, ty + _rpPerp.y * r - m.y, tz + _rpPerp.z * r - m.z).normalize();
    let len = d + 45, impact = 0;
    if (_rpDir.y < -0.01) {
      const tg = (m.y - 0.05) / -_rpDir.y; // 打到地上
      if (tg < len) { len = tg; impact = 2; }
    }
    ends.push(m.x + _rpDir.x * len, m.y + _rpDir.y * len, m.z + _rpDir.z * len);
    impacts.push(impact);
  }
  replayShotEvent(bot.id, m.x, m.y, m.z, ends, impacts);
}
function replayFxEvent(kind, x, y, z) {
  if (replayState.active) return;
  replayRec.events.push({ t: replayRec.clock, type: "fx", kind, x, y, z });
}
// AI 被淘汰：记录尸体盒（回放时淘汰前隐藏），玩家击杀则生成一段“我的击杀”片段
function replayOnBotKilled(bot, crate, killerName, weaponName, isHeadshot, byPlayer) {
  if (replayState.active) return;
  const R = replayRec, t = R.clock;
  R.events.push({ t, type: "kill", victim: bot.id, crate });
  if (!byPlayer) return;
  const dist = Math.round(Math.hypot(bot.group.position.x - playerRig.position.x, bot.group.position.z - playerRig.position.z));
  R.killPending++;
  R.pending.push({
    at: t + 1.5,
    make: () => {
      R.killPending--;
      const clip = makeReplayClip(t - 7, t + 1.5, {
        kind: "kill", killT: t, killer: -1, victim: bot.id,
        title: `你 使用 ${weaponName} ${isHeadshot ? "爆头" : ""}淘汰了 ${bot.name}`, sub: `距离 ${dist} 米`
      });
      if (!clip) { refreshReplayButtons(); return; }
      R.killClips.push(clip);
      if (R.killClips.length > 3) R.killClips.shift();
      refreshReplayButtons();
    }
  });
}
function replayOnPlayerDeath(attackerName, wepName) {
  const R = replayRec, t = R.clock;
  const killerBot = aiPlayers.find(b => b.name === attackerName) || null;
  R.events.push({ t, type: "pdeath" });
  let title, sub = "";
  if (killerBot) {
    const dist = Math.round(Math.hypot(killerBot.group.position.x - playerRig.position.x, killerBot.group.position.z - playerRig.position.z));
    title = `${killerBot.name} 使用 ${wepName} 淘汰了你`;
    sub = `距离 ${dist} 米`;
  } else if (wepName === "跌落") title = "你从高处坠落身亡";
  else if (attackerName.indexOf("你") === 0) title = `你被自己的${wepName}淘汰了`;
  else if (attackerName.indexOf("蓝圈") >= 0) title = "你被电网蓝圈淘汰";
  else title = `你被 ${attackerName} 的 ${wepName} 淘汰`;
  R.deathPending = true;
  R.pending.push({
    at: t + 2.0,
    make: () => {
      R.deathPending = false;
      R.deathClip = makeReplayClip(t - 13, t + 2.0, { kind: "death", killT: t, killer: killerBot ? killerBot.id : null, victim: -1, title, sub });
      refreshReplayButtons();
    }
  });
  refreshReplayButtons();
}

// ---------------------------------------------------------------------------
// 结算界面上的回放按钮
// ---------------------------------------------------------------------------
const rpDeathBtn = document.getElementById("btn-replay-death");
const rpKillBtn = document.getElementById("btn-replay-kill");
function refreshReplayButtons() {
  if (document.getElementById("gameover-modal").style.display !== "flex") return;
  const R = replayRec;
  if (R.deathClip || R.deathPending) {
    rpDeathBtn.style.display = "inline-block";
    rpDeathBtn.disabled = !R.deathClip;
    rpDeathBtn.innerText = R.deathClip ? "🎬 观看淘汰回放" : "🎬 回放生成中…";
  } else rpDeathBtn.style.display = "none";
  const pendingKill = R.killPending > 0 && R.killClips.length === 0;
  if (R.killClips.length) {
    rpKillBtn.style.display = "inline-block";
    rpKillBtn.disabled = false;
    rpKillBtn.innerText = "🎯 回放我的最后一杀";
  } else if (pendingKill) {
    rpKillBtn.style.display = "inline-block";
    rpKillBtn.disabled = true;
    rpKillBtn.innerText = "🎯 击杀回放生成中…";
  } else rpKillBtn.style.display = "none";
}
function replayOnGameOver() { refreshReplayButtons(); }
rpDeathBtn.addEventListener("click", () => { if (replayRec.deathClip) startReplay(replayRec.deathClip); });
rpKillBtn.addEventListener("click", () => { const c = replayRec.killClips[replayRec.killClips.length - 1]; if (c) startReplay(c); });

// ---------------------------------------------------------------------------
// 播放
// ---------------------------------------------------------------------------
const replayState = {
  active: false, clip: null, t: 0, paused: false, speed: 1, mode: "killer", modes: [],
  eventCursor: 0, snapCam: true, saved: null, lastShotSound: 0, orbitBase: 0
};
const rpUI = document.getElementById("replay-ui");
const rpPlayBtn = document.getElementById("rp-play");
const rpSpeedBtn = document.getElementById("rp-speed");
const rpCamBtn = document.getElementById("rp-cam");
const rpBar = document.getElementById("rp-bar");
const rpFill = document.getElementById("rp-fill");
const rpKillMark = document.getElementById("rp-kill-mark");
const rpTimeEl = document.getElementById("rp-time");
const rpSlowEl = document.getElementById("replay-slowmo");

// 回放里的“玩家替身”（第一次回放时才创建）
let replayAvatar = null;
function getReplayAvatar() {
  if (!replayAvatar) {
    const m = buildSoldierModel(new THREE.Color(0x2f6fb0));
    m.group.rotation.order = "YXZ";
    m.walkCycle = 0;
    replayAvatar = m;
  }
  return replayAvatar;
}

// 名字标签（不随距离缩小、可透墙看到）
function makeTagTexture(text, color) {
  const c = document.createElement("canvas");
  c.width = 320; c.height = 64;
  const g = c.getContext("2d");
  let fs = 40;
  g.font = `bold ${fs}px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`;
  while (fs > 20 && g.measureText(text).width > 300) { fs -= 2; g.font = `bold ${fs}px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`; }
  const w = Math.min(316, g.measureText(text).width + 24);
  g.fillStyle = "rgba(0, 0, 0, 0.6)";
  g.fillRect(160 - w / 2, 6, w, 52);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.fillStyle = color;
  g.fillText(text, 160, 33);
  return new THREE.CanvasTexture(c);
}
function makeNameTag() {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: makeTagTexture("", "#fff"), depthTest: false, depthWrite: false, transparent: true, sizeAttenuation: false }));
  sp.scale.set(0.4, 0.08, 1);
  sp.renderOrder = 999;
  sp.visible = false;
  scene.add(sp);
  return sp;
}
const rpTagA = makeNameTag(), rpTagB = makeNameTag();
function setTagText(sp, text, color) {
  if (sp.userData.text === text) return;
  sp.userData.text = text;
  sp.material.map.dispose();
  sp.material.map = makeTagTexture(text, color);
}

// 子弹轨迹：一段会飞行的亮线（加色混合，颜色变暗即淡出）
const RP_TRACERS = 64;
const rpTracerGeo = new THREE.BufferGeometry();
rpTracerGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(RP_TRACERS * 6), 3));
rpTracerGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(RP_TRACERS * 6), 3));
const rpTracerLines = new THREE.LineSegments(rpTracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
rpTracerLines.frustumCulled = false;
rpTracerLines.visible = false;
scene.add(rpTracerLines);
let rpTracers = [];
const TRACER_SPEED = 380, TRACER_LEN = 6;

// 回放里的投掷物模型池
const rpThrowMeshes = [];
function rpThrowMesh(k, id) {
  if (!rpThrowMeshes[k]) {
    const m = new THREE.Mesh(throwableGeo(id), lootMergedMat);
    m.userData.id = id;
    scene.add(m);
    rpThrowMeshes[k] = m;
  }
  const m = rpThrowMeshes[k];
  if (m.userData.id !== id) { m.geometry = throwableGeo(id); m.userData.id = id; }
  return m;
}

function lerpAngle(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
// 找到 t 时刻前后两帧与插值比例
function clipFrameAt(clip, t) {
  const T = clip.times, n = T.length;
  if (t <= T[0]) return [0, 0, 0];
  if (t >= T[n - 1]) return [n - 1, n - 1, 0];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (T[mid] <= t) lo = mid; else hi = mid; }
  return [lo, hi, (t - T[lo]) / Math.max(1e-6, T[hi] - T[lo])];
}

function applyBotState(bot, A, oa, B, ob, al) {
  const L = k => A[oa + k] + (B[ob + k] - A[oa + k]) * al;
  const f = A[oa];
  const g = bot.group;
  g.visible = (f & 1) !== 0;
  g.position.set(L(1), L(2), L(3));
  g.rotation.set(0, lerpAngle(A[oa + 4], B[ob + 4], al), 0);
  bot.chuteMesh.visible = (f & 2) !== 0;
  bot.botGunMesh.visible = (f & 4) !== 0;
  bot.legLPivot.rotation.x = L(5); bot.legRPivot.rotation.x = L(6);
  bot.upper.rotation.x = L(7); bot.upper.rotation.y = L(8); bot.upper.position.y = L(9);
  bot.armLPivot.rotation.set(L(10), L(11), L(12));
  bot.armRPivot.rotation.set(L(13), L(14), L(15));
  bot.botGunMesh.position.set(L(16), L(17), L(18));
  bot.botGunMesh.rotation.x = L(19);
  const vest = A[oa + 20], helm = A[oa + 21], bag = A[oa + 22];
  bot.vestMesh.visible = (f & 8) !== 0;
  if (vest > 0) bot.vestMesh.material = BOT_MAT.vest[vest - 1];
  bot.helmetMesh.visible = (f & 16) !== 0;
  if (helm > 0) bot.helmetMesh.material = BOT_MAT.helmet[helm - 1];
  bot.packMesh.visible = (f & 32) !== 0;
  if (bag > 0) bot.packMesh.scale.setScalar(0.75 + bag * 0.15);
  bot.scopeMesh.visible = (f & 64) !== 0;
  bot.head.rotation.z = L(24);
}

// 某个角色（-1 = 玩家）在 t 时刻的位置与朝向（out.x/y/z 为脚底，out.fx/fz 为面朝方向）
const _rpE = { x: 0, y: 0, z: 0, fx: 0, fz: 1, eye: 1.7, pitch: 0 };
function entityAt(clip, id, t, out = _rpE) {
  const [a, b, al] = clipFrameAt(clip, t);
  if (id === -1) {
    const A = clip.P, oa = a * RP_STRIDE, ob = b * RP_STRIDE;
    out.x = A[oa] + (A[ob] - A[oa]) * al; out.y = A[oa + 1] + (A[ob + 1] - A[oa + 1]) * al; out.z = A[oa + 2] + (A[ob + 2] - A[oa + 2]) * al;
    const yw = lerpAngle(A[oa + 3], A[ob + 3], al);
    out.fx = -Math.sin(yw); out.fz = -Math.cos(yw);
    out.pitch = A[oa + 4] + (A[ob + 4] - A[oa + 4]) * al;
    out.eye = [1.7, 1.15, 0.45][A[oa + 5]] || 1.7;
    return out;
  }
  const bs = REC_BOTS * RB_STRIDE, oa = a * bs + id * RB_STRIDE, ob = b * bs + id * RB_STRIDE, A = clip.B;
  out.x = A[oa + 1] + (A[ob + 1] - A[oa + 1]) * al; out.y = A[oa + 2] + (A[ob + 2] - A[oa + 2]) * al; out.z = A[oa + 3] + (A[ob + 3] - A[oa + 3]) * al;
  const yw = lerpAngle(A[oa + 4], A[ob + 4], al);
  out.fx = Math.sin(yw); out.fz = Math.cos(yw);
  out.pitch = 0; out.eye = 1.65;
  return out;
}

function killEventFor(clip, victim) {
  if (!clip.killMap) {
    clip.killMap = new Map();
    clip.events.forEach(e => { if (e.type === "kill") clip.killMap.set(e.victim, e); });
  }
  return clip.killMap.get(victim) || null;
}
function deathTimeOfPlayer(clip) {
  if (clip.playerDeathT === undefined) {
    const e = clip.events.find(ev => ev.type === "pdeath");
    clip.playerDeathT = e ? e.t : (clip.kind === "death" ? clip.killT : Infinity);
  }
  return clip.playerDeathT;
}

// 把 t 时刻的整个战场摆出来
function applyReplayFrame(clip, t) {
  const [a, b, al] = clipFrameAt(clip, t);
  const bs = REC_BOTS * RB_STRIDE;
  for (let i = 0; i < REC_BOTS; i++) {
    const bot = aiPlayers[i];
    bot.detailMeshes.forEach(m => { m.visible = true; });
    applyBotState(bot, clip.B, a * bs + i * RB_STRIDE, clip.B, b * bs + i * RB_STRIDE, al);
    // 被淘汰的那一下：保持最后的姿势向后倒下
    if (!bot.group.visible) {
      const ke = killEventFor(clip, i);
      if (ke && t >= ke.t && t < ke.t + 1.6) {
        const [ka, kb, kal] = clipFrameAt(clip, ke.t - 0.06);
        applyBotState(bot, clip.B, ka * bs + i * RB_STRIDE, clip.B, kb * bs + i * RB_STRIDE, kal);
        bot.group.visible = true;
        bot.group.rotation.x = -1.5 * Math.min(1, (t - ke.t) / 0.55);
      }
    }
  }
  // 尸体盒：淘汰后才出现
  clip.events.forEach(e => { if (e.type === "kill" && e.crate) e.crate.visible = t >= e.t + 0.9; });

  // 玩家替身
  const av = getReplayAvatar();
  const P = clip.P, oa = a * RP_STRIDE, ob = b * RP_STRIDE;
  const L = k => P[oa + k] + (P[ob + k] - P[oa + k]) * al;
  const phase = P[oa + 6], stance = P[oa + 5], aiming = P[oa + 7] > 0, hasGun = P[oa + 8] > 0;
  const yw = lerpAngle(P[oa + 3], P[ob + 3], al), pt = L(4);
  const g = av.group;
  g.visible = phase !== 0 && replayState.mode !== "fp";
  g.position.set(L(0), L(1), L(2));
  g.rotation.set(0, yw + Math.PI, 0);
  av.chuteMesh.visible = phase === 2;
  av.botGunMesh.visible = hasGun && phase >= 3;
  av.scopeMesh.visible = P[oa + 13] > 0;
  av.vestMesh.visible = P[oa + 11] > 0;
  if (P[oa + 11] > 0) av.vestMesh.material = BOT_MAT.vest[P[oa + 11] - 1];
  av.helmetMesh.visible = P[oa + 10] > 0;
  if (P[oa + 10] > 0) av.helmetMesh.material = BOT_MAT.helmet[P[oa + 10] - 1];
  av.pack.visible = P[oa + 12] > 0;
  if (phase === 1 || phase === 2) {
    poseBotInAir(av, phase === 2);
  } else {
    const spd = Math.hypot(P[ob] - P[oa], P[ob + 2] - P[oa + 2]) * REC_HZ;
    av.walkCycle += Math.min(1, spd / 9) * 0.35 * (replayState.paused ? 0 : 1);
    const sw = Math.sin(av.walkCycle) * Math.min(0.6, spd * 0.08);
    av.legLPivot.rotation.x = sw; av.legRPivot.rotation.x = -sw;
    av.upper.rotation.set(aiming ? 0.02 : 0.03 + Math.min(1, spd / 6) * 0.15, 0, 0);
    av.upper.position.y = 0.72;
    const up = aiming ? Math.max(-0.6, Math.min(0.6, pt)) : 0;
    const adsP = aiming && P[oa + 14] > 0; // 玩家开镜：枪抬到眼前、歪头贴腮
    av.armLPivot.rotation.set(aiming ? -1.38 - up - (adsP ? 0.22 : 0) : -0.1 - sw * 0.5, aiming ? (adsP ? 0.7 : 0.62) : 0, aiming ? 0 : -0.06);
    av.armRPivot.rotation.set(aiming ? -1.22 - up - (adsP ? 0.3 : 0) : -0.1 + sw * 0.5, aiming ? (adsP ? -0.36 : -0.22) : 0, aiming ? 0 : 0.06);
    av.botGunMesh.position.set(aiming ? (adsP ? 0.06 : 0.12) : 0.16, aiming ? (adsP ? 0.97 : 0.72) + up * 0.25 : 0.42, aiming ? (adsP ? 0.39 : 0.44) : 0.3);
    av.botGunMesh.rotation.x = aiming ? -up : 0.55;
    av.head.rotation.z = adsP ? 0.16 : 0;
    // 蹲：整个人矮一截、腿向前收；趴：整个人趴平
    if (stance === 1) { g.position.y -= 0.42; av.legLPivot.rotation.x = -1.25; av.legRPivot.rotation.x = -0.35; }
    if (stance === 2) { g.rotation.x = 1.45; g.position.y += 0.25; }
  }
  // 阵亡：向后倒地
  const td = deathTimeOfPlayer(clip);
  if (t >= td) {
    g.rotation.x = -1.5 * Math.min(1, (t - td) / 0.55);
    av.botGunMesh.visible = false;
  }

  // 投掷物
  const Tarr = clip.T[a];
  let used = 0;
  if (Tarr) {
    for (let k = 0; k < Tarr.length; k += 4) {
      const m = rpThrowMesh(used, Tarr[k]);
      m.visible = true;
      m.position.set(Tarr[k + 1], Tarr[k + 2], Tarr[k + 3]);
      m.rotation.x = t * 9; m.rotation.z = t * 5;
      used++;
    }
  }
  for (let k = used; k < rpThrowMeshes.length; k++) rpThrowMeshes[k].visible = false;
}

// 播放事件：子弹轨迹、枪声、爆炸
function triggerReplayEvent(e) {
  if (e.type === "shot") {
    for (let k = 0; k < e.impacts.length; k++) {
      rpTracers.push({ born: e.t + k * e.gap, fx: e.fx, fy: e.fy, fz: e.fz, tx: e.ends[k * 3], ty: e.ends[k * 3 + 1], tz: e.ends[k * 3 + 2], impact: e.impacts[k], done: false, flashed: false });
    }
  } else if (e.type === "fx") {
    const p = new THREE.Vector3(e.x, e.y + 0.4, e.z);
    const d = playerRig.position.distanceTo(p);
    if (e.kind === "frag") {
      sfx.playExplosion(d, 0);
      spawnFx({ pos: p, color: 0xfff2c0, s0: 1.5, s1: 10, a0: 1, a1: 0, life: 0.3, additive: true });
      for (let i = 0; i < 4; i++) spawnFx({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random(), (Math.random() - 0.5) * 1.6)), color: 0xff8a2a, s0: 1.2, s1: 6, a0: 0.95, a1: 0, life: 0.6, additive: true });
      for (let i = 0; i < 7; i++) spawnFx({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3)), color: 0x3d3935, s0: 2, s1: 7, a0: 0.75, a1: 0, life: 2.6, rise: 1.4 });
    } else if (e.kind === "stun") {
      sfx.playExplosion(d * 1.8 + 20, 0);
      spawnFx({ pos: p, color: 0xffffff, s0: 2, s1: 15, a0: 1, a1: 0, life: 0.4, additive: true });
    } else if (e.kind === "smoke") {
      for (let i = 0; i < 12; i++) spawnFx({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 8, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 8)), color: 0xd6d9db, s0: 2, s1: 8, a0: 0.9, a1: 0.5, life: 6 });
    } else if (e.kind === "molotov") {
      sfx.playIgnite(d, 0);
      for (let i = 0; i < 10; i++) spawnFx({ pos: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 6, 0.3, (Math.random() - 0.5) * 6)), color: 0xff8a2a, s0: 1, s1: 2.6, a0: 0.9, a1: 0, life: 3, additive: true, rise: 0.4 });
    }
  }
}

function updateReplayTracers(t) {
  const pos = rpTracerGeo.attributes.position.array, col = rpTracerGeo.attributes.color.array;
  let n = 0;
  const camPos = playerRig.position;
  rpTracers = rpTracers.filter(tr => !tr.done);
  for (const tr of rpTracers) {
    if (t < tr.born) continue;
    const dx = tr.tx - tr.fx, dy = tr.ty - tr.fy, dz = tr.tz - tr.fz;
    const dist = Math.hypot(dx, dy, dz) || 1;
    const s = (t - tr.born) * TRACER_SPEED;
    if (!tr.flashed) {
      tr.flashed = true;
      spawnFx({ pos: new THREE.Vector3(tr.fx, tr.fy, tr.fz), color: 0xffd27a, s0: 0.5, s1: 0.9, a0: 1, a1: 0, life: 0.07, additive: true });
      const now = performance.now();
      if (now - replayState.lastShotSound > 45) {
        replayState.lastShotSound = now;
        sfx.playShot(false, 1.0, camPos.distanceTo(new THREE.Vector3(tr.fx, tr.fy, tr.fz)), 0);
      }
    }
    if (s - TRACER_LEN > dist) {
      tr.done = true;
      // 打中人 → 血雾；打在地面墙面 → 尘土；擦身飞过 → 什么都不留
      if (tr.impact) spawnFx({ pos: new THREE.Vector3(tr.tx, tr.ty, tr.tz), color: tr.impact === 1 ? 0xb00000 : 0x9a8f80, s0: 0.2, s1: tr.impact === 1 ? 0.9 : 0.6, a0: 0.9, a1: 0, life: 0.35 });
      continue;
    }
    if (n >= RP_TRACERS) continue;
    const s0 = Math.max(0, s - TRACER_LEN) / dist, s1 = Math.min(s, dist) / dist;
    pos.set([tr.fx + dx * s0, tr.fy + dy * s0, tr.fz + dz * s0, tr.fx + dx * s1, tr.fy + dy * s1, tr.fz + dz * s1], n * 6);
    col.set([0.35, 0.25, 0.05, 1.0, 0.85, 0.4], n * 6);
    n++;
  }
  for (let k = n; k < RP_TRACERS; k++) col.fill(0, k * 6, k * 6 + 6);
  rpTracerGeo.attributes.position.needsUpdate = true;
  rpTracerGeo.attributes.color.needsUpdate = true;
  rpTracerGeo.setDrawRange(0, Math.max(1, n) * 2);
}

// ---- 镜头 ----
const rpCam = new THREE.Vector3(), rpLook = new THREE.Vector3();
const _rpWant = new THREE.Vector3(), _rpWantLook = new THREE.Vector3();
const _rpA = { x: 0, y: 0, z: 0, fx: 0, fz: 1, eye: 1.7, pitch: 0 }, _rpB = { x: 0, y: 0, z: 0, fx: 0, fz: 1, eye: 1.7, pitch: 0 };
const RP_MODE_LABEL = { killer: "击杀者视角", victim: "被淘汰者视角", me3: "我的第三人称", fp: "我的第一人称", orbit: "环绕镜头" };
function replayModesFor(clip) {
  const m = [];
  if (clip.kind === "death") {
    if (clip.killer !== null) m.push("killer");
    m.push("me3", "fp", "orbit");
  } else {
    m.push("me3", "fp", "victim", "orbit");
  }
  return m;
}
// 镜头被墙挡住时往目标方向拉近
function pullCameraClear(fromX, fromY, fromZ, v) {
  if (losSegmentClear(fromX, fromY, fromZ, v.x, v.y, v.z)) return;
  let lo = 0, hi = 1;
  for (let k = 0; k < 6; k++) {
    const m = (lo + hi) / 2;
    if (losSegmentClear(fromX, fromY, fromZ, fromX + (v.x - fromX) * m, fromY + (v.y - fromY) * m, fromZ + (v.z - fromZ) * m)) lo = m; else hi = m;
  }
  const m = Math.max(0, lo - 0.08);
  v.set(fromX + (v.x - fromX) * m, fromY + (v.y - fromY) * m, fromZ + (v.z - fromZ) * m);
}
// 越肩镜头：站在 who 身后偏右，看向 target（没有目标时看向自己面朝的方向）
function shoulderCam(who, target, out, outLook) {
  let fx = who.fx, fz = who.fz;
  if (target) {
    const dx = target.x - who.x, dz = target.z - who.z, d = Math.hypot(dx, dz);
    if (d > 0.5) { fx = dx / d; fz = dz / d; }
  }
  const rx = -fz, rz = fx;
  out.set(who.x - fx * 3.3 + rx * 0.85, who.y + 2.15, who.z - fz * 3.3 + rz * 0.85);
  pullCameraClear(who.x, who.y + 1.6, who.z, out);
  if (target) outLook.set(target.x, target.y + 1.15, target.z);
  else outLook.set(who.x + fx * 25, who.y + 1.5 + Math.tan(who.pitch || 0) * 25, who.z + fz * 25);
}
function computeReplayCamera(clip, t, dt) {
  const mode = replayState.mode;
  const me = entityAt(clip, -1, t, _rpA);
  const otherId = clip.kind === "death" ? clip.killer : clip.victim;
  // 击杀者一直跟随；被淘汰的 AI 停在倒下的位置
  const other = otherId !== null && otherId !== undefined ? entityAt(clip, otherId, clip.kind === "death" ? t : Math.min(t, clip.killT), _rpB) : null;
  let snap = replayState.snapCam;
  if (mode === "fp") {
    _rpWant.set(me.x, me.y + me.eye, me.z);
    _rpWantLook.set(me.x + me.fx * Math.cos(me.pitch) * 20, me.y + me.eye + Math.sin(me.pitch) * 20, me.z + me.fz * Math.cos(me.pitch) * 20);
    snap = true;
  } else if (mode === "killer" && other) {
    shoulderCam(other, me, _rpWant, _rpWantLook);
  } else if (mode === "victim" && other) {
    shoulderCam(other, me, _rpWant, _rpWantLook);
  } else if (mode === "me3") {
    shoulderCam(me, clip.kind === "kill" ? other : null, _rpWant, _rpWantLook);
  } else {
    // 环绕：围着双方中点慢慢转
    const cx = other ? (me.x + other.x) / 2 : me.x, cz = other ? (me.z + other.z) / 2 : me.z;
    const cy = (other ? (me.y + other.y) / 2 : me.y) + 1.2;
    const span = other ? Math.hypot(me.x - other.x, me.z - other.z) : 0;
    const r = Math.max(9, Math.min(45, span * 0.6 + 8));
    const ang = replayState.orbitBase + (t - clip.t0) * 0.22;
    _rpWant.set(cx + Math.cos(ang) * r, cy + 3 + r * 0.32, cz + Math.sin(ang) * r);
    pullCameraClear(cx, cy, cz, _rpWant);
    _rpWantLook.set(cx, cy, cz);
  }
  // 拖动进度条 / 切换视角 / 目标瞬移（距离突变）时镜头直接切过去，平时平滑跟随
  if (snap || rpCam.distanceTo(_rpWant) > 25) { rpCam.copy(_rpWant); rpLook.copy(_rpWantLook); replayState.snapCam = false; }
  else {
    const k = 1 - Math.exp(-dt * 7);
    rpCam.lerp(_rpWant, k);
    rpLook.lerp(_rpWantLook, k);
  }
  playerRig.position.copy(rpCam);
  const dx = rpLook.x - rpCam.x, dy = rpLook.y - rpCam.y, dz = rpLook.z - rpCam.z;
  yaw = Math.atan2(-dx, -dz);
  pitch = Math.atan2(dy, Math.hypot(dx, dz));
  camera.position.set(0, 0, 0);
  camera.rotation.order = "YXZ";
  camera.rotation.set(pitch, yaw, 0);

  // 名字标签：我 + 对手
  const setTag = (sp, ent, text, color) => {
    if (!ent || mode === "fp" && sp === rpTagA) { sp.visible = false; return; }
    setTagText(sp, text, color);
    sp.position.set(ent.x, ent.y + 2.45, ent.z);
    sp.visible = true;
  };
  setTag(rpTagA, me, "你", "#5dff8a");
  if (other) setTag(rpTagB, other, aiPlayers[otherId].name, clip.kind === "death" ? "#ff5a4a" : "#ffd27d");
  else rpTagB.visible = false;
}

function inSlowMo(clip, t) { return t > clip.killT - 0.8 && t < clip.killT + 0.5; }

function startReplay(clip) {
  if (!clip || replayState.active) return;
  const S = replayState;
  // 保存现场（退出回放时原样恢复，战场继续）
  const live = new Float32Array(REC_BOTS * RB_STRIDE);
  for (let i = 0; i < REC_BOTS; i++) writeBotState(aiPlayers[i], live, i * RB_STRIDE);
  S.saved = {
    live, orders: aiPlayers.map(b => b.group.rotation.order), yaw, pitch, rig: playerRig.position.clone(), fov: camera.fov,
    hidden: []
  };
  aiPlayers.forEach(b => { b.group.rotation.order = "YXZ"; });
  // 现场的烟雾 / 火焰 / 飞行中的投掷物先藏起来
  smokeClouds.forEach(c => c.sprites.forEach(sp => { if (sp.visible) { sp.visible = false; S.saved.hidden.push(sp); } }));
  fireZones.forEach(z => z.flames.forEach(sp => { if (sp.visible) { sp.visible = false; S.saved.hidden.push(sp); } }));
  activeThrows.forEach(t => { if (t.mesh.visible) { t.mesh.visible = false; S.saved.hidden.push(t.mesh); } });
  [throwPreviewLine, throwPreviewRing, throwHandMesh].forEach(m => { if (m.visible) { m.visible = false; S.saved.hidden.push(m); } });
  camera.fov = 70;
  camera.updateProjectionMatrix();
  S.active = true;
  S.clip = clip;
  S.modes = replayModesFor(clip);
  S.mode = S.modes[0];
  S.speed = 1;
  S.paused = false;
  S.orbitBase = Math.random() * Math.PI * 2;
  seekReplay(clip.t0);
  document.getElementById("gameover-modal").style.display = "none";
  document.body.classList.add("replay-mode");
  rpUI.style.display = "flex";
  document.getElementById("replay-title").innerText = clip.title;
  document.getElementById("replay-sub").innerText = clip.sub || "";
  document.getElementById("replay-badge").innerText = clip.kind === "death" ? "🎬 淘汰回放" : "🎯 击杀回放";
  rpKillMark.style.left = `${((clip.killT - clip.t0) / (clip.t1 - clip.t0)) * 100}%`;
  rpTracerLines.visible = true;
  updateReplayButtons();
}

function seekReplay(t) {
  const S = replayState, clip = S.clip;
  S.t = Math.max(clip.t0, Math.min(clip.t1, t));
  S.eventCursor = 0;
  while (S.eventCursor < clip.events.length && clip.events[S.eventCursor].t < S.t) S.eventCursor++;
  rpTracers = [];
  S.snapCam = true;
}

function exitReplay() {
  const S = replayState;
  if (!S.active) return;
  S.active = false;
  const sv = S.saved;
  for (let i = 0; i < REC_BOTS; i++) {
    const b = aiPlayers[i];
    applyBotState(b, sv.live, i * RB_STRIDE, sv.live, i * RB_STRIDE, 0);
    b.group.rotation.order = sv.orders[i];
    b.detailMeshes.forEach(m => { m.visible = b.detailShown; });
  }
  S.clip.events.forEach(e => { if (e.type === "kill" && e.crate) e.crate.visible = true; });
  sv.hidden.forEach(o => { o.visible = true; });
  if (replayAvatar) replayAvatar.group.visible = false;
  rpThrowMeshes.forEach(m => { m.visible = false; });
  rpTagA.visible = rpTagB.visible = false;
  rpTracerLines.visible = false;
  rpTracers = [];
  yaw = sv.yaw; pitch = sv.pitch;
  playerRig.position.copy(sv.rig);
  camera.fov = sv.fov;
  camera.updateProjectionMatrix();
  document.body.classList.remove("replay-mode");
  rpUI.style.display = "none";
  document.getElementById("gameover-modal").style.display = "flex";
  refreshReplayButtons();
}

function updateReplayButtons() {
  const S = replayState;
  rpPlayBtn.innerText = S.paused ? "▶" : "⏸";
  rpSpeedBtn.innerText = S.speed === 1 ? "1x" : "0.5x";
  rpCamBtn.innerText = `🎥 ${RP_MODE_LABEL[S.mode]}`;
}

// 主循环在回放期间每帧调用（战场模拟暂停）
function updateReplayPlayback(dt, now) {
  const S = replayState, clip = S.clip;
  const slow = inSlowMo(clip, S.t);
  if (!S.paused) {
    const prevT = S.t;
    S.t = Math.min(clip.t1, S.t + dt * S.speed * (slow ? 0.3 : 1));
    while (S.eventCursor < clip.events.length && clip.events[S.eventCursor].t <= S.t) {
      const e = clip.events[S.eventCursor++];
      if (e.t >= prevT - 0.05) triggerReplayEvent(e);
    }
    if (S.t >= clip.t1) { S.paused = true; updateReplayButtons(); }
  }
  applyReplayFrame(clip, S.t);
  computeReplayCamera(clip, S.t, dt);
  updateReplayTracers(S.t);
  updateFx(dt, now);
  cullStaticBatches();
  fpGunGroup.visible = false;
  rpSlowEl.style.opacity = slow && !S.paused ? 1 : 0;
  rpFill.style.width = `${((S.t - clip.t0) / (clip.t1 - clip.t0)) * 100}%`;
  rpTimeEl.innerText = `${(S.t - clip.killT).toFixed(1)}s`;
}

// ---- 回放界面按钮 ----
document.getElementById("rp-exit").addEventListener("click", exitReplay);
document.getElementById("rp-restart").addEventListener("click", () => {
  seekReplay(replayState.clip.t0);
  replayState.paused = false;
  updateReplayButtons();
});
rpPlayBtn.addEventListener("click", () => {
  const S = replayState;
  if (S.paused && S.t >= S.clip.t1 - 0.01) seekReplay(S.clip.t0);
  S.paused = !S.paused;
  updateReplayButtons();
});
rpSpeedBtn.addEventListener("click", () => {
  replayState.speed = replayState.speed === 1 ? 0.5 : 1;
  updateReplayButtons();
});
rpCamBtn.addEventListener("click", () => {
  const S = replayState;
  S.mode = S.modes[(S.modes.indexOf(S.mode) + 1) % S.modes.length];
  S.snapCam = true;
  updateReplayButtons();
});
const rpSeekFromEvent = clientX => {
  const r = rpBar.getBoundingClientRect();
  const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
  const clip = replayState.clip;
  seekReplay(clip.t0 + f * (clip.t1 - clip.t0));
};
rpBar.addEventListener("click", e => rpSeekFromEvent(e.clientX));
rpBar.addEventListener("touchstart", e => { e.preventDefault(); rpSeekFromEvent(e.changedTouches[0].clientX); }, { passive: false });
rpBar.addEventListener("touchmove", e => { e.preventDefault(); rpSeekFromEvent(e.changedTouches[0].clientX); }, { passive: false });
window.addEventListener("keydown", e => {
  if (!replayState.active) return;
  if (e.code === "Escape") exitReplay();
  if (e.code === "Space") rpPlayBtn.click();
  if (e.code === "KeyC") rpCamBtn.click();
});
