// range.js：室内靶场（主菜单 → 设置 → 🎯 室内靶场）
// 一个封闭的室内训练场：射击位隔间 + 10 / 25 / 50 / 75 / 100 米五条靶道、30 米横向移动靶、15 米压枪墙。
// 靶子是和 AI 一模一样大小的假人（头 / 躯干 / 腿的命中盒尺寸相同），伤害按真实规则算（枪的伤害、爆头倍数、
// 距离衰减、可选靶子护甲），打中会飘伤害数字，打倒后倒下再自己立起来。枪和配件随便选，子弹无限。
// 用的是你现在的键位、灵敏度和画质设置。没有 AI、没有毒圈、没有飞机，退出就回主菜单
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

let rangeMode = false;
// 靶场建在地图外面很远的地方（四周什么都没有），房子是封闭的，看不到外面
const RANGE = { x: 2900, z: 2900, y: 0, len: 112, halfW: 14, h: 7 };
const RANGE_LANES = [
  { x: -10, d: 10 }, { x: -6, d: 25 }, { x: -2, d: 50 }, { x: 2, d: 75 }, { x: 6, d: 100 }
];
const RANGE_WALL_X = 10.5, RANGE_WALL_D = 15;        // 压枪墙
const RANGE_MOVER_D = 30, RANGE_MOVER_X0 = -11, RANGE_MOVER_X1 = 7.4, RANGE_MOVER_SPEED = 3.6; // 移动靶（米 / 秒）
const RANGE_ARMOR_NAMES = ["无", "1 级", "2 级", "3 级"];
const rangeState = {
  built: false, targets: [], shots: 0, hits: 0, heads: 0, armor: 0,
  nums: [], pickW: "m416", pickAtt: {}, lastHitSound: 0, statsDirty: true
};

function rangeTextTexture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = MAX_ANISO;
  return t;
}
function rangeSign(text, sub, x, y, z, w, h, color) {
  const tex = rangeTextTexture(256, Math.round(256 * h / w), (g, W, H) => {
    g.fillStyle = color || "#13324f"; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,255,255,0.85)"; g.lineWidth = 6; g.strokeRect(5, 5, W - 10, H - 10);
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
    g.font = `900 ${Math.round(H * (sub ? 0.48 : 0.62))}px sans-serif`;
    g.fillText(text, W / 2, H * (sub ? 0.4 : 0.52));
    if (sub) { g.font = `700 ${Math.round(H * 0.22)}px sans-serif`; g.fillStyle = "#ffd27d"; g.fillText(sub, W / 2, H * 0.78); }
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(x, y, z);
  scene.add(m);
  freezeObject(m);
  return m;
}

// 和 AI 一样大小的训练假人：腿 0.26×0.72、躯干 0.74×0.92、头 0.40×0.42（见 actors.js 的 BOT_GEO）
const RANGE_MAT = {
  body: new THREE.MeshLambertMaterial({ color: 0xc9b28c }),
  head: new THREE.MeshLambertMaterial({ color: 0xd8c4a0 }),
  legs: new THREE.MeshLambertMaterial({ color: 0x9d8a6c }),
  base: new THREE.MeshLambertMaterial({ color: 0x2c2f33 }),
  ring: new THREE.MeshBasicMaterial({ color: 0xc0392b, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  vest: [null, new THREE.MeshLambertMaterial({ color: 0x8d8f7a }), new THREE.MeshLambertMaterial({ color: 0x3f4a3a }), new THREE.MeshLambertMaterial({ color: 0x23272b })]
};
function makeRangeTarget(x, z, label) {
  const g = new THREE.Group();
  g.position.set(x, RANGE.y, z);
  const base = new THREE.Mesh(UNIT_BOX, RANGE_MAT.base);
  base.scale.set(0.9, 0.06, 0.6); base.position.y = 0.03;
  g.add(base);
  const pivot = new THREE.Group(); // 打倒后绕脚底往后倒
  g.add(pivot);
  const t = { group: g, pivot, parts: [], hp: 100, state: "up", fall: 0, downAt: 0, firstHit: 0, hitsThis: 0, label, moving: false, dir: 1 };
  const part = (sx, sy, sz, px, py, mat, zone) => {
    const m = new THREE.Mesh(UNIT_BOX, mat);
    m.scale.set(sx, sy, sz); m.position.set(px, py, 0);
    m.castShadow = true;
    m.userData = { rt: t, zone };
    pivot.add(m);
    if (zone) t.parts.push(m);
    return m;
  };
  part(0.26, 0.72, 0.28, -0.18, 0.36, RANGE_MAT.legs, "legs");
  part(0.26, 0.72, 0.28, 0.18, 0.36, RANGE_MAT.legs, "legs");
  part(0.74, 0.92, 0.42, 0, 1.18, RANGE_MAT.body, "body");
  part(0.40, 0.42, 0.40, 0, 1.88, RANGE_MAT.head, "head");
  part(0.19, 0.64, 0.21, -0.47, 1.26, RANGE_MAT.body, null); // 手臂只是外观（AI 的手臂也不算命中）
  part(0.19, 0.64, 0.21, 0.47, 1.26, RANGE_MAT.body, null);
  // 胸口的红色靶心圈
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 24), RANGE_MAT.ring);
  ring.position.set(0, 1.3, 0.215);
  pivot.add(ring);
  // 护甲（靶子护甲不是“无”的时候显示）
  t.vest = new THREE.Mesh(UNIT_BOX, RANGE_MAT.vest[1]);
  t.vest.scale.set(0.8, 0.6, 0.48); t.vest.position.y = 1.3; t.vest.visible = false;
  t.helm = new THREE.Mesh(new THREE.SphereGeometry(0.255, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), RANGE_MAT.vest[1]);
  t.helm.position.y = 1.95; t.helm.visible = false;
  pivot.add(t.vest, t.helm);
  scene.add(g);
  rangeState.targets.push(t);
  return t;
}

function buildRange() {
  const R = RANGE;
  // 地板放在这片地形最高点上方：脚下永远是靶场地板
  let maxT = -Infinity;
  for (let x = R.x - R.halfW - 4; x <= R.x + R.halfW + 4; x += 4) {
    for (let z = R.z - R.len - 6; z <= R.z + 14; z += 4) maxT = Math.max(maxT, terrainH(x, z));
  }
  R.y = Math.ceil(maxT) + 3;
  const X = R.x, Y = R.y, Z = R.z, HW = R.halfW, HH = R.h;
  const zBack = Z + 8, zEnd = Z - R.len, zc = (zBack + zEnd) / 2, L = zBack - zEnd, W = HW * 2;
  const wallO = { key: "concrete", aoBase: Y };

  // 地板 / 四面墙 / 天花板（天花板不投影子，不然顶灯照不进来）
  addSolidBox(X, Y - 0.3, zc, W + 1, 0.6, L + 1, 0x9a9a95, { key: "concrete", ao: false });
  addWalkRect(X - HW, zEnd, X + HW, zBack, Y, Y + HH - 0.2);
  addSolidBox(X - HW - 0.25, Y + HH / 2, zc, 0.5, HH, L + 1, 0x6f767d, wallO);
  addSolidBox(X + HW + 0.25, Y + HH / 2, zc, 0.5, HH, L + 1, 0x6f767d, wallO);
  addSolidBox(X, Y + HH / 2, zBack + 0.25, W + 1, HH, 0.5, 0x646b72, wallO);
  addSolidBox(X, Y + HH / 2, zEnd - 0.4, W + 1, HH, 0.8, 0x2f2d2a, wallO);              // 尽头的防弹橡胶墙
  addSolidBox(X, Y + 0.55, zEnd + 1.2, W, 1.1, 2.4, 0x6a5b45, { key: "concrete", aoBase: Y }); // 墙根的沙坡
  addSolidBox(X, Y + HH + 0.2, zc, W + 1, 0.4, L + 1, 0x4c4f53, { key: "concrete", ao: false, detail: true, collider: false });
  // 墙裙（下半截深色）
  addVisualBox(X - HW + 0.02, Y + 0.6, zc, 0.06, 1.2, L, 0x3b4046, "concrete", { aoBase: Y, detail: true });
  addVisualBox(X + HW - 0.02, Y + 0.6, zc, 0.06, 1.2, L, 0x3b4046, "concrete", { aoBase: Y, detail: true });
  // 吊顶挡板（防跳弹），每 6 米一道
  for (let z = Z - 4; z > zEnd + 3; z -= 6) addVisualBox(X, Y + HH - 0.35, z, W, 0.5, 0.25, 0x33363b, "metal", { detail: true, ao: false });

  // 射击位：每条靶道一个台子，隔板在台子后面，台子之间留 1.2 米的口子可以走到靶道里去
  const lanesX = RANGE_LANES.map(l => l.x).concat([RANGE_WALL_X]);
  lanesX.forEach(lx => {
    addSolidBox(X + lx, Y + 0.5, Z - 1.05, 2.8, 1.0, 0.6, 0x6b5843, { key: "wood", aoBase: Y });
    addVisualBox(X + lx, Y + 1.02, Z - 1.05, 2.9, 0.04, 0.68, 0x2a2c30, "metal");
  });
  [-8, -4, 0, 4, 8.25].forEach(px => addSolidBox(X + px, Y + 0.95, Z - 0.3, 0.06, 1.9, 0.9, 0x59616a, { key: "metal", aoBase: Y }));
  // 地上的分道线 + 黄色射击线
  [-8, -4, 0, 4, 8.25].forEach(px => addVisualBox(X + px, Y + 0.005, (Z - 1.4 + zEnd) / 2, 0.07, 0.01, Z - 1.4 - zEnd, 0xd8d6cf, "plaster", { ao: false, detail: true }));
  addVisualBox(X, Y + 0.006, Z + 0.35, W, 0.012, 0.1, 0xc9a227, "plaster", { ao: false, detail: true });

  // 靶道：假人靶 + 头顶距离牌
  RANGE_LANES.forEach(l => {
    makeRangeTarget(X + l.x, Z - l.d, `${l.d} 米`);
    rangeSign(`${l.d}m`, null, X + l.x, Y + 3.2, Z - l.d - 0.6, 1.4, 0.62);
  });
  // 移动靶：地上一条轨道
  addVisualBox(X + (RANGE_MOVER_X0 + RANGE_MOVER_X1) / 2, Y + 0.04, Z - RANGE_MOVER_D, RANGE_MOVER_X1 - RANGE_MOVER_X0 + 1.4, 0.08, 0.2, 0x3a3d42, "metal", { ao: false });
  const mover = makeRangeTarget(X + RANGE_MOVER_X0, Z - RANGE_MOVER_D, "30 米移动靶");
  mover.moving = true;
  rangeSign("30m", "移动靶", X - 12.2, Y + 3.2, Z - RANGE_MOVER_D - 0.6, 1.4, 0.8, "#4a1f16");
  // 压枪墙：白板 + 网格（弹孔留在上面，看弹道散布 / 压枪效果）
  const wx = X + RANGE_WALL_X, wz = Z - RANGE_WALL_D;
  addSolidBox(wx, Y + 1.65, wz, 3.2, 2.7, 0.12, 0xeeeeea, { key: "plaster", ao: false });
  addSolidBox(wx - 1.45, Y + 0.15, wz - 0.3, 0.12, 0.3, 0.7, 0x2c2f33, { key: "metal" });
  addSolidBox(wx + 1.45, Y + 0.15, wz - 0.3, 0.12, 0.3, 0.7, 0x2c2f33, { key: "metal" });
  const gridTex = rangeTextTexture(512, 432, (g, w, h) => {
    g.fillStyle = "#f4f4f0"; g.fillRect(0, 0, w, h);
    const s = w / 30; // 每格 10 厘米
    for (let i = 0; i <= 30; i++) {
      g.strokeStyle = i % 5 === 0 ? "rgba(40,60,90,0.55)" : "rgba(40,60,90,0.18)"; g.lineWidth = i % 5 === 0 ? 2 : 1;
      g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.stroke();
    }
    for (let j = 0; j * s <= h + 1; j++) {
      g.strokeStyle = j % 5 === 0 ? "rgba(40,60,90,0.55)" : "rgba(40,60,90,0.18)"; g.lineWidth = j % 5 === 0 ? 2 : 1;
      g.beginPath(); g.moveTo(0, j * s); g.lineTo(w, j * s); g.stroke();
    }
    g.strokeStyle = "#c0392b"; g.lineWidth = 3;
    const cx = w / 2, cy = h * 0.42;
    [12, 28, 46].forEach(r => { g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); });
    g.beginPath(); g.moveTo(cx - 60, cy); g.lineTo(cx + 60, cy); g.moveTo(cx, cy - 60); g.lineTo(cx, cy + 60); g.stroke();
  });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 2.55), new THREE.MeshLambertMaterial({ map: gridTex }));
  grid.position.set(wx, Y + 1.65, wz + 0.066);
  grid.receiveShadow = true;
  scene.add(grid); freezeObject(grid);
  rangeSign("压枪墙", "15m", wx, Y + 3.5, wz, 1.6, 0.7, "#1f3d24");
  // 尽头墙上的大牌子
  rangeSign("PUBG LITE 训练场", "TRAINING RANGE", X, Y + 5.3, zEnd + 0.02, 9, 1.6, "#1a1d22");

  // 顶灯：三排长条 LED（自发光，不受光照影响）
  const lamps = [];
  for (let z = Z + 5; z > zEnd + 2; z -= 7) [-7, 0, 7].forEach(dx => lamps.push([X + dx, z]));
  const lampMesh = new THREE.InstancedMesh(UNIT_BOX, new THREE.MeshBasicMaterial({ color: 0xfffbf0 }), lamps.length);
  const d = new THREE.Object3D();
  lamps.forEach((p, i) => { d.position.set(p[0], Y + HH - 0.06, p[1]); d.scale.set(0.35, 0.06, 3.2); d.updateMatrix(); lampMesh.setMatrixAt(i, d.matrix); });
  scene.add(lampMesh); freezeObject(lampMesh);

  flushStaticBatches();
  lastBatchCullX = Infinity;
  rangeState.built = true;
}

// 室内灯光：主光从头顶照下来（顶灯），天光换成偏暖的室内环境光；天空、草、毒圈都关掉
function applyRangeLighting() {
  SUN_SHADOW_OFFSET.set(0.22, 1, 0.35).normalize().multiplyScalar(340);
  shadowCenterX = 1e9;
  sunLight.intensity = 0.62;
  sunLight.color.set(0xfff4e2);
  hemiLight.color.set(0xfff6ea);
  hemiLight.groundColor.set(0x77736c);
  hemiLight.intensity = 0.6;
  fillLight.intensity = 0.3;
  skyDome.visible = false;
  blueZoneMesh.visible = false;
  if (grassMesh) grassMesh.visible = false;
}

function rangeMakeWeapon(id, atts) {
  const base = WEAPONS_DATA[id];
  const a = {};
  for (const k in atts) if (atts[k] && attachmentFitsWeapon(id, atts[k])) a[k] = atts[k];
  return { id, name: base.name, ammoInMag: a.mag === "ext_mag" ? base.ext : base.mag, fireMode: base.modes[0], attachments: a };
}

function startRange() {
  if (gameStarted) return;
  rangeMode = true;
  if (!rangeState.built) buildRange();
  gameStarted = true;
  sfx.init();
  document.body.classList.remove("menu-mode");
  document.body.classList.add("range-mode");
  planeGroup.visible = false;
  aiPlayers.forEach(b => { b.group.visible = false; });
  actionBtn.style.display = "none";
  applyRangeLighting();

  // 靶场在地图外面：把“世界边界”换成靶场房子的范围，不然一走动就被拉回地图边上、从半空掉下去
  worldBounds.x0 = RANGE.x - RANGE.halfW + 0.3; worldBounds.x1 = RANGE.x + RANGE.halfW - 0.3;
  worldBounds.z0 = RANGE.z - RANGE.len + 0.3; worldBounds.z1 = RANGE.z + 8 - 0.3;
  player.phase = "ground";
  player.fallTop = null;
  player.hp = 100; player.boost = 0; player.velY = 0;
  player.stance = "stand"; player.eyeH = 1.7; player.feetY = RANGE.y;
  player.bagLv = 3; player.maxCap = 400;
  player.throwBag = { frag: 3, smoke: 3, stun: 3, molotov: 3 };
  player.weapons[0] = rangeMakeWeapon("m416", { scope: "reddot", muzzle: "comp", grip: "vert", mag: "ext_mag", stock: "tac_stock" });
  player.weapons[1] = rangeMakeWeapon("kar98k", { scope: "8x", muzzle: "supp", loops: "bullet_loops" });
  player.activeSlot = 0;
  playerRig.position.set(RANGE.x - 2, RANGE.y + 1.7, RANGE.z + 1.0); // 站在 50 米那条靶道的射击位上
  yaw = 0; pitch = 0;
  rebuildFPGunModel(); updateScopeState(); updateAllHUD();
  document.getElementById("compass-bar").innerText = "🎯 室内靶场";
  clock.start();
  lastFrameStamp = performance.now();
  cullStaticBatches();
  rangeRefreshStats();
  showToast("🎯 室内靶场：子弹无限，左上角换枪 / 配件");
}

// ---- 命中 ----
const _rgCands = [];
function rangeTargetSegmentHit(ray, len) {
  _rgCands.length = 0;
  for (let i = 0; i < rangeState.targets.length; i++) {
    const t = rangeState.targets[i];
    if (t.state !== "up") continue;
    const p = t.group.position;
    if (distPointToSeg(p.x, p.y + 1.1, p.z, ray.ray.origin, ray.ray.direction, len) < 2.2) {
      for (let k = 0; k < t.parts.length; k++) _rgCands.push(t.parts[k]);
    }
  }
  if (!_rgCands.length) return null;
  const hits = ray.intersectObjects(_rgCands, false);
  if (!hits.length) return null;
  const h = hits[0];
  return { kind: "rtarget", dist: h.distance, point: h.point, target: h.object.userData.rt, zone: h.object.userData.zone };
}

function rangeOnShot(pellets) {
  rangeState.shots += pellets;
  rangeState.statsDirty = true;
}

const RANGE_ZONE_NAME = { head: "头部", body: "躯干", legs: "腿部" };
function rangeTargetHit(hit, b) {
  const t = hit.target;
  if (t.state !== "up") return;
  const base = WEAPONS_DATA[b.wId];
  const now = performance.now();
  const dist = b.from.distanceTo(hit.point);
  const head = hit.zone === "head";
  const raw = base.type === "SG" ? base.dmgPerPellet : base.dmg;
  // 和打 AI 完全一样：枪的伤害 × 爆头倍数 × 距离衰减 × (1 - 护甲减伤)
  const red = BOT_ARMOR_RED[rangeState.armor] || 0.10;
  const dmg = Math.round(raw * (head ? headMultOf(b.wId) : 1) * bulletDamageScale(b.wId, dist) * (1 - red));
  if (!t.hitsThis) t.firstHit = now;
  t.hitsThis++;
  t.hp -= dmg;
  rangeState.hits++;
  if (head) rangeState.heads++;
  rangeState.statsDirty = true;
  showHitMarker();
  if (now - rangeState.lastHitSound > 60) { rangeState.lastHitSound = now; sfx.playHit(head); }
  spawnFx({ pos: hit.point.clone(), color: 0xe8dcc0, s0: 0.05, s1: 0.32, a0: 0.8, a1: 0, life: 0.35, rise: 0.4 });
  const killed = t.hp <= 0;
  rangeDamageNumber(hit.point, dmg, head, killed);
  const flight = bulletFlightTime(dist, bulletSpeedOf(b.wId), bulletDragOf(b.wId));
  let msg = `${t.label} · ${RANGE_ZONE_NAME[hit.zone]} <b>${dmg}</b> 伤害 · ${dist.toFixed(1)} 米` + (isFinite(flight) ? ` · 子弹飞了 ${flight.toFixed(2)} 秒` : "");
  if (killed) {
    t.state = "falling"; t.downAt = now;
    const ttk = (now - t.firstHit) / 1000;
    msg += `<br>💥 击倒！用了 ${t.hitsThis} 发` + (t.hitsThis > 1 ? `，${ttk.toFixed(2)} 秒` : "");
  }
  document.getElementById("rg-last").innerHTML = msg;
}

// 伤害数字：从命中点飘起来淡出（霰弹一枪多颗弹丸打在同一个靶子上时合成一个数）
function rangeDamageNumber(pos, dmg, head, kill) {
  const now = performance.now();
  const last = rangeState.nums[rangeState.nums.length - 1];
  if (last && now - last.born < 60 && last.pos.distanceTo(pos) < 1.5) {
    last.dmg += dmg; last.head = last.head || head; last.kill = last.kill || kill;
    last.el.textContent = last.dmg;
    last.el.className = "rg-num" + (last.head ? " head" : "") + (last.kill ? " kill" : "");
    return;
  }
  let n = rangeState.nums.length >= 24 ? rangeState.nums.shift() : null;
  if (!n) {
    n = { el: document.createElement("div") };
    document.getElementById("range-dmg").appendChild(n.el);
  }
  n.pos = pos.clone(); n.born = now; n.dmg = dmg; n.head = head; n.kill = kill;
  n.el.textContent = dmg;
  n.el.className = "rg-num" + (head ? " head" : "") + (kill ? " kill" : "");
  n.el.style.display = "block";
  rangeState.nums.push(n);
}

function rangeRefreshStats() {
  const s = rangeState;
  const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
  document.getElementById("rg-stats").innerText = `开枪 ${s.shots} · 命中 ${s.hits}（${acc}%）· 爆头 ${s.heads}`;
  s.statsDirty = false;
}

const _rgV = new THREE.Vector3();
function updateRange(dt, now) {
  // 子弹无限：备弹一直补到一个满弹匣（不多给，免得背包重量显示乱掉），投掷物也一直补满
  for (let i = 0; i < 2; i++) {
    const w = player.weapons[i];
    if (!w) continue;
    const base = WEAPONS_DATA[w.id];
    const need = w.attachments.mag === "ext_mag" ? base.ext : base.mag;
    if ((player.ammoBag[base.ammoType] || 0) < need) player.ammoBag[base.ammoType] = need;
  }
  for (const k in player.throwBag) if (player.throwBag[k] < 3) player.throwBag[k] = 3;

  for (let i = 0; i < rangeState.targets.length; i++) {
    const t = rangeState.targets[i];
    if (t.moving) {
      const g = t.group.position;
      g.x += t.dir * RANGE_MOVER_SPEED * dt;
      if (g.x > RANGE.x + RANGE_MOVER_X1) { g.x = RANGE.x + RANGE_MOVER_X1; t.dir = -1; }
      if (g.x < RANGE.x + RANGE_MOVER_X0) { g.x = RANGE.x + RANGE_MOVER_X0; t.dir = 1; }
    }
    if (t.state === "falling") {
      t.fall = Math.min(1, t.fall + dt * 4);
      if (now - t.downAt > 2500) t.state = "rising";
    } else if (t.state === "rising") {
      t.fall = Math.max(0, t.fall - dt * 2.5);
      if (t.fall === 0) { t.state = "up"; t.hp = 100; t.hitsThis = 0; }
    }
    t.pivot.rotation.x = -1.45 * t.fall * t.fall * (3 - 2 * t.fall);
    // 子弹在渲染前结算：先把靶子的位置矩阵更新好，打移动靶不会差一帧
    t.group.updateMatrixWorld(true);
  }

  // 伤害数字跟着命中点（投到屏幕上），往上飘、淡出
  const W = window.innerWidth, H = window.innerHeight;
  for (let i = rangeState.nums.length - 1; i >= 0; i--) {
    const n = rangeState.nums[i];
    const age = now - n.born;
    if (age > 900) { n.el.style.display = "none"; continue; }
    _rgV.copy(n.pos).project(camera);
    if (_rgV.z > 1) { n.el.style.display = "none"; continue; }
    n.el.style.display = "block";
    const x = (_rgV.x + 1) / 2 * W + 14, y = (1 - _rgV.y) / 2 * H - 10 - age * 0.045;
    n.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    n.el.style.opacity = (1 - Math.max(0, age - 450) / 450).toFixed(2);
  }
  if (rangeState.statsDirty) rangeRefreshStats();
}

// ---- 选枪 / 配件 ----
const RANGE_GROUPS = [["AR", "突击步枪"], ["SMG", "冲锋枪"], ["DMR", "射手步枪"], ["SR", "狙击枪"], ["SG", "霰弹枪"], ["LMG", "轻机枪"]];
const RANGE_SLOT_NAMES = { scope: "瞄具", muzzle: "枪口", sg_muzzle: "枪口", grip: "握把", mag: "弹匣", stock: "枪托", loops: "子弹袋" };
function rangeAttOptions(wId, slot) {
  return Object.values(ATTACHMENTS_DATA).filter(a => a.slot === slot && attachmentFitsWeapon(wId, a.id));
}
function rangePickWeapon(id) {
  rangeState.pickW = id;
  // 已经选好的配件能装就留着（比如换枪时倍镜不用重新选）
  const keep = {};
  WEAPONS_DATA[id].slots.forEach(sl => {
    const cur = rangeState.pickAtt[sl];
    if (cur && attachmentFitsWeapon(id, cur)) keep[sl] = cur;
  });
  rangeState.pickAtt = keep;
  renderRangePicker();
}
function renderRangePicker() {
  const s = rangeState, w = WEAPONS_DATA[s.pickW];
  document.getElementById("rp-weps").innerHTML = RANGE_GROUPS.map(([type, name]) => {
    const list = Object.values(WEAPONS_DATA).filter(x => x.type === type);
    return `<div class="rp-group">${name}</div><div class="rp-list">` +
      list.map(x => `<button class="rp-w${x.id === s.pickW ? " sel" : ""}" data-w="${x.id}">${x.name}</button>`).join("") + `</div>`;
  }).join("");
  const modes = { auto: "全自动", burst: "连发", single: "单发", bolt: "栓动" };
  let html = `<div class="rp-info"><b>${w.name}</b>　${w.ammoType} · 伤害 ${w.type === "SG" ? w.dmgPerPellet + "×" + w.pellets : w.dmg} · 射速 ${w.rpm} 发/分 · 初速 ${bulletSpeedOf(w.id)} 米/秒 · 弹匣 ${w.mag}${w.ext !== w.mag ? "/" + w.ext : ""} · ${w.modes.map(m => modes[m]).join("/")}</div>`;
  w.slots.forEach(sl => {
    const opts = rangeAttOptions(w.id, sl);
    html += `<div class="rp-slot"><div>${RANGE_SLOT_NAMES[sl] || sl}</div>` +
      `<span class="rp-att${!s.pickAtt[sl] ? " sel" : ""}" data-sl="${sl}" data-a="">不装</span>` +
      opts.map(a => `<span class="rp-att${s.pickAtt[sl] === a.id ? " sel" : ""}" data-sl="${sl}" data-a="${a.id}">${a.name}</span>`).join("") + `</div>`;
  });
  html += `<div class="rp-equip"><button data-slot="0">拿上（1 号位）</button><button data-slot="1">拿上（2 号位）</button></div>`;
  document.getElementById("rp-detail").innerHTML = html;
}
function openRangePicker() {
  const cur = player.weapons[player.activeSlot];
  if (cur) { rangeState.pickW = cur.id; rangeState.pickAtt = Object.assign({}, cur.attachments); }
  stopTrigger();
  renderRangePicker();
  document.getElementById("range-picker").classList.add("open");
}
function rangeEquip(slot) {
  const wep = rangeMakeWeapon(rangeState.pickW, rangeState.pickAtt);
  if (player.throwEquipped) unequipThrowable();
  cancelCastProgress();
  player.weapons[slot] = wep;
  player.activeSlot = slot;
  player.isADS = false; player.reopenADSAfterBolt = false; player.boltLockedUntil = 0;
  rebuildFPGunModel(); updateScopeState(); updateAllHUD();
  document.getElementById("range-picker").classList.remove("open");
  showToast(`已拿上 ${wep.name}（${slot + 1} 号位）`);
}
document.getElementById("rp-weps").addEventListener("click", e => {
  const b = e.target.closest(".rp-w");
  if (b) rangePickWeapon(b.dataset.w);
});
document.getElementById("rp-detail").addEventListener("click", e => {
  const a = e.target.closest(".rp-att");
  if (a) { rangeState.pickAtt[a.dataset.sl] = a.dataset.a || undefined; renderRangePicker(); return; }
  const q = e.target.closest(".rp-equip button");
  if (q) rangeEquip(parseInt(q.dataset.slot, 10));
});
document.getElementById("rp-close").addEventListener("click", () => document.getElementById("range-picker").classList.remove("open"));
document.getElementById("rg-pick").addEventListener("click", openRangePicker);
// 点标题收起 / 展开成绩面板（别挡住挪到左上角的按钮）
document.getElementById("rg-title").addEventListener("click", () => document.getElementById("range-hud").classList.toggle("mini"));
document.getElementById("rg-armor").addEventListener("click", () => {
  rangeState.armor = (rangeState.armor + 1) % 4;
  const lv = rangeState.armor;
  document.getElementById("rg-armor").innerText = `🛡 护甲:${RANGE_ARMOR_NAMES[lv].replace(" ", "")}`;
  rangeState.targets.forEach(t => {
    t.vest.visible = t.helm.visible = lv > 0;
    if (lv > 0) t.vest.material = t.helm.material = RANGE_MAT.vest[lv];
  });
  showToast(lv ? `靶子穿上 ${lv} 级头盔 + ${lv} 级防弹衣` : "靶子不穿护甲");
});
document.getElementById("rg-clear").addEventListener("click", () => {
  bulletHoleMesh.count = 0;
  bulletHoleCursor = 0;
  rangeState.shots = rangeState.hits = rangeState.heads = 0;
  rangeRefreshStats();
  document.getElementById("rg-last").innerText = "弹孔和成绩已清空";
});
document.getElementById("rg-exit").addEventListener("click", () => {
  try { sessionStorage.setItem("pubg_menu_page", "set"); } catch (e) {}
  location.reload();
});
