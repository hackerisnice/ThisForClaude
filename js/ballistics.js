// ballistics.js：子弹弹道 —— 每颗子弹都有真实初速、重力下坠和空气阻力，逐帧飞行，飞到了才算命中
// （远距离要抬枪、打移动目标要给提前量；AI 也按同样的物理开枪）
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// 各枪初速（米/秒，参考端游）
const BULLET_SPEED = {
  beryl: 880, m416: 880, akm: 715, aug: 940, scar: 870, m16a4: 900, mk47: 780,
  ump45: 360, vector: 300, uzi: 350, mp5k: 400,
  s1897: 360, s686: 370, s12k: 350, dbs: 380,
  slr: 840, sks: 800, mini14: 990, dragunov: 830, mk14: 853,
  kar98k: 760, m24: 790, awm: 945, amr: 1000,
  dp28: 715, m249: 915
};
// 空气阻力（每秒速度衰减比例，按子弹口径）：霰弹丸衰减最快，大口径狙击弹最慢
const AMMO_DRAG = { "5.56mm": 0.2, "7.62mm": 0.17, "9mm": 0.4, ".45ACP": 0.45, "12Gauge": 1.4, ".50BMG": 0.08 };
// 伤害：每把枪基础伤害不同（data.js 里的 dmg），再按口径随距离衰减（手枪弹 / 霰弹掉得快，步枪弹慢，.50 几乎不掉）；
// 爆头倍数按枪种。玩家打 AI、AI 打玩家用同一套规则
const HEAD_MULT = { AR: 2.35, SMG: 2.1, LMG: 2.3, DMR: 2.35, SR: 2.5, SG: 1.5 };
const AMMO_FALLOFF = { // [开始衰减的距离, 衰减到最低的距离, 最低剩余比例]
  "9mm": [40, 160, 0.55], ".45ACP": [40, 160, 0.55], "5.56mm": [100, 450, 0.75], "7.62mm": [120, 500, 0.8], ".50BMG": [400, 900, 0.9], "12Gauge": [8, 40, 0.25]
};
function bulletDamageScale(wId, dist) {
  const f = AMMO_FALLOFF[WEAPONS_DATA[wId].ammoType];
  return f ? 1 - (1 - f[2]) * smoothstep(f[0], f[1], dist) : 1;
}
function headMultOf(wId) { return HEAD_MULT[WEAPONS_DATA[wId].type] || 2.35; }
const BULLET_G = 9.8;
const BULLET_MAX_TIME = 1.6;  // 最长飞行时间（秒）
const BULLET_ZERO = 100;      // 瞄具归零距离（米）：100 米处弹着点正好在准星上

function bulletSpeedOf(wId) { return BULLET_SPEED[wId] || 800; }
function bulletDragOf(wId) { return AMMO_DRAG[WEAPONS_DATA[wId].ammoType] || 0.2; }
// 飞行 d 米所需时间（线性阻力：s(t) = v0/k·(1-e^(-kt))），飞不到返回 Infinity
function bulletFlightTime(d, v0, k) {
  const r = k * d / v0;
  return r >= 0.98 ? Infinity : -Math.log(1 - r) / k;
}
function bulletDropAt(t) { return 0.5 * BULLET_G * t * t; }
// 归零修正：枪口相对视线略微上扬的角度
function bulletZeroAngle(wId) {
  const t = bulletFlightTime(BULLET_ZERO, bulletSpeedOf(wId), bulletDragOf(wId));
  return isFinite(t) ? bulletDropAt(t) / BULLET_ZERO : 0;
}

const activeBullets = [];
const pendingBotHits = []; // AI 互殴：子弹飞到了才扣血
let ballisticsClock = 0;

// o: { pos, dir（单位向量）, wId, owner（-1 = 玩家，否则 AI 对象）, info }
function spawnBullet(o) {
  const v0 = bulletSpeedOf(o.wId);
  activeBullets.push({
    p: o.pos.clone(), from: o.pos.clone(), v: o.dir.clone().multiplyScalar(v0), v0,
    drag: bulletDragOf(o.wId), owner: o.owner, wId: o.wId, info: o.info || {},
    age: 0, traveled: 0, born: replayRec.clock, whizzed: false
  });
}

// 子弹路径附近的 AI 命中盒（玩家子弹用）
const _bRay = new THREE.Raycaster();
const _bDir = new THREE.Vector3(), _bNext = new THREE.Vector3(), _bTmp = new THREE.Vector3();
const _bCand = [], _bNear = [];
function distPointToSeg(px, py, pz, a, dir, len) {
  const t = Math.max(0, Math.min(len, (px - a.x) * dir.x + (py - a.y) * dir.y + (pz - a.z) * dir.z));
  return Math.hypot(px - (a.x + dir.x * t), py - (a.y + dir.y * t), pz - (a.z + dir.z * t));
}
// 线段与玩家身体（竖直胶囊体）的最近交点距离，打不中返回 null
function bulletHitsPlayer(a, dir, len) {
  if (player.phase !== "ground") return null;
  const px = playerRig.position.x, pz = playerRig.position.z;
  const prone = player.stance === "prone";
  const y0 = player.feetY + 0.12, y1 = player.feetY + (prone ? 0.5 : player.eyeH + 0.15);
  const R = prone ? 0.42 : 0.36;
  // 在线段上按 0.15 米采样，找离身体轴线最近的点
  const n = Math.max(1, Math.ceil(len / 0.15));
  for (let i = 0; i <= n; i++) {
    const t = len * i / n;
    const x = a.x + dir.x * t, y = a.y + dir.y * t, z = a.z + dir.z * t;
    if (y < y0 - R || y > y1 + R) continue;
    const cy = Math.max(y0, Math.min(y1, y));
    if (Math.hypot(x - px, y - cy, z - pz) < R) return { dist: t, x, y, z, head: !prone && y > player.feetY + player.eyeH - 0.18 };
  }
  return null;
}

function traceBulletSegment(b, a, dir, len) {
  _bRay.set(a, dir);
  _bRay.far = len;
  const fromPlayer = b.owner === -1;
  const cands = gatherShootCandidates(_bRay.ray, len, false);
  let best = null;
  const env = _bRay.intersectObjects(cands, false);
  if (env.length) best = { kind: "env", dist: env[0].distance, point: env[0].point, normal: env[0].face ? env[0].face.normal : _up };
  // 门板（门会动，不进静态网格，单独求交；打在门上不留弹孔）
  const dh = doorsSegmentHit(a.x, a.y, a.z, a.x + dir.x * len, a.y + dir.y * len, a.z + dir.z * len);
  if (dh >= 0 && (!best || dh * len < best.dist)) best = { kind: "door", dist: dh * len, point: a.clone().addScaledVector(dir, dh * len) };
  if (fromPlayer) {
    // 只检测路径附近还活着的 AI
    _bCand.length = 0;
    _bNear.length = 0;
    for (let i = 0; i < aiPlayers.length; i++) {
      const bot = aiPlayers[i];
      if (!bot.alive || !bot.group.visible) continue;
      const bp = bot.group.position;
      const dd = distPointToSeg(bp.x, bp.y + 1.0, bp.z, a, dir, len);
      if (dd < 2.6) _bCand.push(bot.body, bot.head, bot.legL, bot.legR);
      if (dd < 4.5) _bNear.push(bot);
    }
    if (_bCand.length) {
      const hits = _bRay.intersectObjects(_bCand, false);
      if (hits.length && (!best || hits[0].distance < best.dist)) {
        best = { kind: "bot", dist: hits[0].distance, point: hits[0].point, bot: hits[0].object.userData.bot, head: hits[0].object.userData.isHead };
      }
    }
    // 子弹从身边擦过（被打了没打中）：AI 知道有人在打它
    for (let i = 0; i < _bNear.length; i++) {
      const bot = _bNear[i];
      if ((best && best.kind === "bot" && best.bot === bot) || (b.nm && b.nm.includes(bot))) continue;
      const bp = bot.group.position;
      if (best && (bp.x - a.x) * dir.x + (bp.y + 1 - a.y) * dir.y + (bp.z - a.z) * dir.z > best.dist + 1) continue;
      (b.nm || (b.nm = [])).push(bot);
      botNearMiss(bot);
    }
  } else {
    const h = bulletHitsPlayer(a, dir, len);
    if (h && (!best || h.dist < best.dist)) best = { kind: "player", dist: h.dist, point: new THREE.Vector3(h.x, h.y, h.z), head: h.head };
    // 擦着耳边飞过：子弹破空声
    if (!b.whizzed && player.phase === "ground") {
      const ep = playerRig.position;
      if (distPointToSeg(ep.x, ep.y - 0.3, ep.z, a, dir, best ? best.dist : len) < 3.2 && (!best || best.kind !== "player")) {
        b.whizzed = true;
        sfx.playWhiz(stereoPanFor(a.x, a.z));
      }
    }
  }
  return best;
}

function botNearMiss(bot) {
  const now = performance.now();
  bot.alertUntil = Math.max(bot.alertUntil, now + 9000);
  botLearnPlayerPos(bot, now, 0.1);
  if (now > bot.faceHintUntil) setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 1200);
  if (bot.tactic === "ambush") botEndTactic(bot); // 被发现了，不蹲了
}

let lastPlayerHitSound = 0;
// 玩家子弹打中 AI（原先开枪瞬间结算，现在子弹飞到才结算）
function playerBulletHitBot(bot, isHead, point, info, dist = 0) {
  if (!bot.alive) return;
  const base = WEAPONS_DATA[info.wId];
  const now = performance.now();
  const rawDmg = base.type === "SG" ? base.dmgPerPellet : base.dmg;
  // 爆头按 AI 头盔等级减伤，打身体按防弹衣等级减伤；远了按口径衰减
  const finalDmg = Math.round(rawDmg * (isHead ? headMultOf(info.wId) : 1.0) * bulletDamageScale(info.wId, dist) * (1 - botArmorReduction(bot, isHead)));
  bot.hp -= finalDmg;
  player.totalDmg += finalDmg;
  spawnBloodEffect(point);
  bot.alertUntil = now + 12000;
  bot.strafeDir = -bot.strafeDir;
  setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 1500);
  botLearnPlayerPos(bot, now, 0.05);
  if (bot.tactic === "ambush") botEndTactic(bot);
  showHitMarker();
  if (now - lastPlayerHitSound > 60) { lastPlayerHitSound = now; sfx.playHit(isHead); }
  if (bot.hp <= 0 && bot.alive) killAIBot(bot, "你 (Player)", base.name, isHead, true);
}

function finishBullet(b, hit) {
  const end = hit ? hit.point : b.p;
  const impact = !hit ? 0 : (hit.kind === "env" || hit.kind === "door" ? 2 : 1);
  // 录像：子弹轨迹（时间记在开枪那一刻，回放里按真实弹速飞）
  replayShotEvent(b.owner === -1 ? -1 : b.owner.id, b.from.x, b.from.y, b.from.z, [end.x, end.y, end.z], [impact], 0, b.born, b.v0);
  if (!hit) return;
  if (hit.kind === "env") {
    if (hit.point.distanceTo(playerRig.position) < 160) {
      const t = WEAPONS_DATA[b.wId].type;
      addBulletHoleDecal(hit.point, hit.normal, t === "SG" ? 0.038 : 0.055);
    }
  } else if (hit.kind === "door") {
    const dd = hit.point.distanceTo(playerRig.position);
    if (dd < 60) sfx.playBounce(dd * 0.6, stereoPanFor(hit.point.x, hit.point.z));
  } else if (hit.kind === "bot") {
    playerBulletHitBot(hit.bot, hit.head, hit.point, b.info, b.from.distanceTo(hit.point));
  } else if (hit.kind === "player") {
    // AI 的子弹和玩家的一样：枪的原始伤害 × 爆头倍数 × 距离衰减（霰弹的中弹弹丸数已经按距离算进 dmg 里了）
    const fall = WEAPONS_DATA[b.wId].type === "SG" ? 1 : bulletDamageScale(b.wId, b.from.distanceTo(hit.point));
    damagePlayer(Math.round(b.info.dmg * (hit.head ? headMultOf(b.wId) : 1) * fall), b.info.botName, b.info.wName, hit.head);
  }
}

// 主循环每帧调用
function updateBullets(dt) {
  ballisticsClock += dt;
  for (let i = activeBullets.length - 1; i >= 0; i--) {
    const b = activeBullets[i];
    const decay = Math.exp(-b.drag * dt);
    _bNext.copy(b.p).addScaledVector(b.v, dt * (1 + decay) / 2);
    _bNext.y -= 0.5 * BULLET_G * dt * dt;
    b.v.multiplyScalar(decay);
    b.v.y -= BULLET_G * dt;
    _bDir.subVectors(_bNext, b.p);
    const len = _bDir.length();
    _bDir.divideScalar(len || 1);
    b.age += dt;
    const hit = traceBulletSegment(b, b.p, _bDir, len);
    if (hit) {
      activeBullets.splice(i, 1);
      finishBullet(b, hit);
      continue;
    }
    b.p.copy(_bNext);
    b.traveled += len;
    if (b.age > BULLET_MAX_TIME || b.p.y < -3 || Math.abs(b.p.x) > MAP_SIZE || Math.abs(b.p.z) > MAP_SIZE) {
      activeBullets.splice(i, 1);
      finishBullet(b, null);
    }
  }
  for (let i = pendingBotHits.length - 1; i >= 0; i--) {
    const h = pendingBotHits[i];
    if (ballisticsClock < h.at) continue;
    pendingBotHits.splice(i, 1);
    const t = h.target;
    if (!t.alive) continue;
    t.hp -= h.dmg;
    if (t.hp <= 0) killAIBot(t, h.killerName, h.wName, Math.random() < 0.25, false);
  }
  updateBulletTracers();
}

// AI 互殴：伤害在子弹飞行时间之后才生效
function scheduleBotHit(shooter, target, dmg, dist) {
  const t = bulletFlightTime(dist, bulletSpeedOf(shooter.weaponKey), bulletDragOf(shooter.weaponKey));
  pendingBotHits.push({ at: ballisticsClock + (isFinite(t) ? t : 0.3), target, dmg, killerName: shooter.name, wName: WEAPONS_DATA[shooter.weaponKey].name });
}

// 子弹曳光：淡淡的一小段亮线跟着子弹飞（能看出下坠和飞行时间）
const BULLET_TRACERS = 96;
const bulletTracerGeo = new THREE.BufferGeometry();
bulletTracerGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(BULLET_TRACERS * 6), 3));
bulletTracerGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(BULLET_TRACERS * 6), 3));
const bulletTracerLines = new THREE.LineSegments(bulletTracerGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
bulletTracerLines.frustumCulled = false;
scene.add(bulletTracerLines);
function updateBulletTracers() {
  const pos = bulletTracerGeo.attributes.position.array, col = bulletTracerGeo.attributes.color.array;
  let n = 0;
  for (let i = 0; i < activeBullets.length && n < BULLET_TRACERS; i++) {
    const b = activeBullets[i];
    // 自己的子弹出膛 4 米后才显示，免得糊在眼前
    if (b.owner === -1 && b.traveled < 4) continue;
    const sp = b.v.length() || 1, L = Math.min(5, b.traveled);
    const tx = b.p.x - b.v.x / sp * L, ty = b.p.y - b.v.y / sp * L, tz = b.p.z - b.v.z / sp * L;
    pos.set([tx, ty, tz, b.p.x, b.p.y, b.p.z], n * 6);
    const k = b.owner === -1 ? 0.45 : 0.75;
    col.set([0.05 * k, 0.04 * k, 0.01 * k, 1.0 * k, 0.82 * k, 0.45 * k], n * 6);
    n++;
  }
  for (let k = n; k < BULLET_TRACERS; k++) col.fill(0, k * 6, k * 6 + 6);
  bulletTracerGeo.attributes.position.needsUpdate = true;
  bulletTracerGeo.attributes.color.needsUpdate = true;
  bulletTracerGeo.setDrawRange(0, Math.max(1, n) * 2);
  bulletTracerLines.visible = n > 0;
}

// 玩家移动速度（AI 打移动目标时预判提前量用）与平均帧间隔
const playerVel = { x: 0, z: 0 };
let frameDtAvg = 1 / 30;
let _pvLastX = null, _pvLastZ = 0;
function trackPlayerVelocity(dt) {
  if (dt > 0) frameDtAvg += (Math.min(dt, 0.1) - frameDtAvg) * 0.1;
  const x = playerRig.position.x, z = playerRig.position.z;
  if (_pvLastX !== null && dt > 0) {
    const k = Math.min(1, dt * 6);
    const vx = (x - _pvLastX) / dt, vz = (z - _pvLastZ) / dt;
    // 瞬移（死亡 / 回放）时不算
    if (Math.hypot(vx, vz) < 30) { playerVel.x += (vx - playerVel.x) * k; playerVel.z += (vz - playerVel.z) * k; }
  }
  _pvLastX = x; _pvLastZ = z;
}
