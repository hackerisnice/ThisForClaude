// doors.js：房门 —— 每栋楼底层南北门口各一扇向内开的双开木门。
// 关着的门挡人、挡子弹、挡视线、挡手雷；玩家靠近点“开门 / 关门”（F 键），也可以走过去自动推开；AI 路过会推门。
// 所有门叶用一个 InstancedMesh 画（一次绘制），子弹 / 视线用解析几何直接和门板求交，不进静态网格
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const doors = [];
const DOOR_CELL = 8;
const doorGrid = new Map();
const DOOR_THICK = 0.07, DOOR_OPEN_ANGLE = Math.PI / 2 * 0.94, DOOR_SWING_SEC = 0.35;
let doorStamp = 0;

// 门洞中心 (x, z)，门洞沿 x 方向宽 w、高 h；inward = 门往屋里开的 z 方向（+1 / -1）
function registerDoor(x, z, w, h, inward) {
  const d = { id: doors.length, x, z, hw: w / 2, h: h - 0.04, inward, open: false, t: 0, stamp: 0, slot: -1, color: null };
  doors.push(d);
  const x0 = Math.floor((x - w / 2 - 1.5) / DOOR_CELL), x1 = Math.floor((x + w / 2 + 1.5) / DOOR_CELL);
  const z0 = Math.floor((z - 1.5) / DOOR_CELL), z1 = Math.floor((z + 1.5) / DOOR_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const k = gridKey(ix, iz);
      let arr = doorGrid.get(k);
      if (!arr) { arr = []; doorGrid.set(k, arr); }
      arr.push(d);
    }
  }
  return d;
}

// 两扇门叶的转角：左叶铰链在门洞西端，右叶在东端（右叶 = 左叶转 180°），打开时都转向屋里
function doorLeafAngle(d, i) {
  const e = d.t * d.t * (3 - 2 * d.t);
  return i === 0 ? -d.inward * DOOR_OPEN_ANGLE * e : Math.PI + d.inward * DOOR_OPEN_ANGLE * e;
}
function doorLeafWidth(d) { return d.hw - 0.02; }

// ---------------------------------------------------------------------------
// 渲染：所有门叶一个 InstancedMesh（第一帧再建，那时所有门都登记完了）。
// 只画镜头 160 米内的门（每隔一会儿重新挑一次放进前面的实例槽），远处的门小到看不见，省掉大半三角形
// ---------------------------------------------------------------------------
const DOOR_DRAW_DIST = 160;
let doorMesh = null;
const doorSlots = [];          // 实例槽 → 门
let doorSlotsAt = null, doorSlotsNext = 0;
const _dm = new THREE.Matrix4(), _dq = new THREE.Quaternion(), _dp = new THREE.Vector3(), _ds = new THREE.Vector3(), _dy = new THREE.Vector3(0, 1, 0);
const _dc = new THREE.Color();
function writeDoorMatrices(d) {
  if (!doorMesh || d.slot < 0) return;
  for (let i = 0; i < 2; i++) {
    _dp.set(d.x + (i === 0 ? -d.hw : d.hw), 0, d.z);
    _dq.setFromAxisAngle(_dy, doorLeafAngle(d, i));
    _ds.set(doorLeafWidth(d), d.h, DOOR_THICK);
    _dm.compose(_dp, _dq, _ds);
    doorMesh.setMatrixAt(d.slot * 2 + i, _dm);
  }
}
// 门板贴图：木纹 + 凹进去的门芯板（高光 / 阴影勾边）+ 门把手；颜色由实例颜色染成各种木色
const doorTex = makeCanvasTexture(128, (ctx, s) => {
  const W = s, H = s * 2;
  ctx.canvas.height = H;
  const img = ctx.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const g = 0.86 + 0.08 * Math.sin((x / W * 9 + fbm(x / W * 2, y / H * 14, 5, 3, 2) * 3) * Math.PI) + (hash2(x, y, 4) - 0.5) * 0.05;
    const i = (y * W + x) * 4;
    img.data[i] = 255 * g; img.data[i + 1] = 246 * g; img.data[i + 2] = 236 * g; img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  // 门芯板：上两块、下一块
  const panel = (x0, y0, x1, y1) => {
    ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.fillRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fillRect(x0 * W, y0 * H, (x1 - x0) * W, 3); ctx.fillRect(x0 * W, y0 * H, 3, (y1 - y0) * H);
    ctx.fillStyle = "rgba(255,255,255,0.35)"; ctx.fillRect(x0 * W, y1 * H - 3, (x1 - x0) * W, 3); ctx.fillRect(x1 * W - 3, y0 * H, 3, (y1 - y0) * H);
  };
  panel(0.16, 0.07, 0.84, 0.36);
  panel(0.16, 0.44, 0.84, 0.62);
  panel(0.16, 0.7, 0.84, 0.93);
  // 门把手（靠门缝那一边）
  ctx.fillStyle = "#2a2826"; ctx.fillRect(0.86 * W, 0.47 * H, 0.08 * W, 0.05 * H);
  ctx.fillStyle = "#c8c0a8"; ctx.beginPath(); ctx.arc(0.9 * W, 0.495 * H, 0.035 * W, 0, Math.PI * 2); ctx.fill();
}, false);
function ensureDoorMesh() {
  if (doorMesh || !doors.length) return;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0.5, 0.5, 0);
  // 木色每扇门略有不同（实例颜色）
  doorMesh = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({ color: 0xffffff, map: doorTex }), doors.length * 2);
  doorMesh.frustumCulled = false; // r128 的实例网格不按实例算包围球
  doorMesh.castShadow = true;
  doorMesh.receiveShadow = true;
  // 实例颜色缓冲要按满容量预先建好（setColorAt 懒创建时按当前 count 分配，count 为 0 时会建出空缓冲，整批门都画不出来）
  doorMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(doors.length * 2 * 3), 3);
  doorMesh.count = 0;
  doors.forEach(d => { d.slot = -1; d.color = new THREE.Color().setHSL(0.07 + Math.random() * 0.03, 0.38 + Math.random() * 0.15, 0.24 + Math.random() * 0.08); });
  scene.add(doorMesh);
}
// 重新挑选要画的门（镜头移动超过 12 米或每 1.5 秒）
function refreshDoorSlots(force) {
  camera.getWorldPosition(_dp);
  const cx = _dp.x, cz = _dp.z;
  const now = performance.now();
  if (!force && doorSlotsAt && now < doorSlotsNext && Math.hypot(cx - doorSlotsAt.x, cz - doorSlotsAt.z) < 12) return;
  doorSlotsAt = { x: cx, z: cz };
  doorSlotsNext = now + 1500;
  doorSlots.forEach(d => { d.slot = -1; });
  doorSlots.length = 0;
  for (let i = 0; i < doors.length; i++) {
    const d = doors[i];
    if (Math.abs(d.x - cx) > DOOR_DRAW_DIST || Math.abs(d.z - cz) > DOOR_DRAW_DIST) continue;
    d.slot = doorSlots.length;
    doorSlots.push(d);
    writeDoorMatrices(d);
    doorMesh.setColorAt(d.slot * 2, d.color);
    doorMesh.setColorAt(d.slot * 2 + 1, d.color);
  }
  doorMesh.count = doorSlots.length * 2;
  doorMesh.instanceMatrix.needsUpdate = true;
  if (doorMesh.instanceColor) doorMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------------------
// 物理：关着（没开到一半）的门是挡住门洞的实心板；子弹 / 视线和两扇门板精确求交
// ---------------------------------------------------------------------------
function doorIsShut(d) { return d.t < 0.5; }
// 圆（人）与关着的门是否相交：lo / hi 为身体高度区间
function doorBlocksCircle(x, z, r, lo, hi) {
  const arr = doorGrid.get(gridKey(Math.floor(x / DOOR_CELL), Math.floor(z / DOOR_CELL)));
  if (!arr) return false;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i];
    if (!doorIsShut(d) || lo >= d.h || hi <= 0) continue;
    if (x + r > d.x - d.hw && x - r < d.x + d.hw && z + r > d.z - 0.1 && z - r < d.z + 0.1) return true;
  }
  return false;
}
function doorBlocksPoint(x, y, z, r) {
  return y >= 0 && doorBlocksCircle(x, z, r, y, y + 0.001);
}

// 线段 a→b 与门板的第一个交点（返回 0~1 的比例，没有返回 -1）
function doorLeafHit(d, i, ax, ay, az, dx, dy, dz) {
  const hx = d.x + (i === 0 ? -d.hw : d.hw), th = doorLeafAngle(d, i);
  const c = Math.cos(th), s = Math.sin(th);
  // 门叶本地坐标：x 轴 (c, 0, -s)，z 轴 (s, 0, c)
  const px = ax - hx, pz = az - d.z;
  const o = [px * c - pz * s, ay, px * s + pz * c];
  const v = [dx * c - dz * s, dy, dx * s + dz * c];
  const lo = [0, 0, -DOOR_THICK / 2], hi = [doorLeafWidth(d), d.h, DOOR_THICK / 2];
  let t0 = 0, t1 = 1;
  for (let k = 0; k < 3; k++) {
    if (Math.abs(v[k]) < 1e-9) { if (o[k] < lo[k] || o[k] > hi[k]) return -1; continue; }
    let ta = (lo[k] - o[k]) / v[k], tb = (hi[k] - o[k]) / v[k];
    if (ta > tb) { const q = ta; ta = tb; tb = q; }
    if (ta > t0) t0 = ta;
    if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}
function doorsSegmentHit(ax, ay, az, bx, by, bz) {
  if (!doors.length) return -1;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  doorStamp++;
  let best = -1;
  let cx = Math.floor(ax / DOOR_CELL), cz = Math.floor(az / DOOR_CELL);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(DOOR_CELL / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(DOOR_CELL / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * DOOR_CELL - ax : ax - cx * DOOR_CELL) / Math.abs(dx) : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * DOOR_CELL - az : az - cz * DOOR_CELL) / Math.abs(dz) : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    const arr = doorGrid.get(gridKey(cx, cz));
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i];
        if (d.stamp === doorStamp) continue;
        d.stamp = doorStamp;
        if (Math.min(ay, by) > d.h + 0.1) continue;
        for (let k = 0; k < 2; k++) {
          const t = doorLeafHit(d, k, ax, ay, az, dx, dy, dz);
          if (t >= 0 && (best < 0 || t < best)) best = t;
        }
      }
    }
    if (best >= 0 && best <= Math.min(tMaxX, tMaxZ)) break; // 后面格子里的门不可能更近
    if (tMaxX < tMaxZ) {
      if (tMaxX > 1) break;
      tMaxX += tDeltaX; cx += stepX;
    } else {
      if (tMaxZ > 1) break;
      tMaxZ += tDeltaZ; cz += stepZ;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// 开门 / 关门
// ---------------------------------------------------------------------------
// 门洞里站着人就关不上
function doorwayOccupied(d) {
  const near = (x, y, z) => y < d.h && Math.abs(x - d.x) < d.hw + 0.4 && Math.abs(z - d.z) < 0.75;
  if (player.phase === "ground" && near(playerRig.position.x, player.feetY, playerRig.position.z)) return true;
  return aiPlayers.some(b => b.alive && b.phase === "ground" && near(b.group.position.x, b.group.position.y, b.group.position.z));
}
function setDoorOpen(d, open, byBot) {
  if (d.open === open) return true;
  if (!open && doorwayOccupied(d)) return false;
  d.open = open;
  const dist = Math.hypot(playerRig.position.x - d.x, playerRig.position.z - d.z);
  if (dist < 45) sfx.playDoor(open, dist, stereoPanFor(d.x, d.z));
  if (byBot && dist < 22) registerRadarSound("step", d.x, d.z);
  replayDoorEvent(d.id, open);
  return true;
}
function toggleDoor(d) {
  if (!setDoorOpen(d, !d.open, false)) showToast("门口有人，关不上");
}

// 门板转动动画（只更新正在动的门）
const movingDoors = new Set();
function updateDoors(dt) {
  ensureDoorMesh();
  refreshGlassSlots();
  if (!doorMesh) return;
  refreshDoorSlots(false);
  for (const d of doors) {
    const goal = d.open ? 1 : 0;
    if (d.t !== goal) movingDoors.add(d);
  }
  if (!movingDoors.size) return;
  movingDoors.forEach(d => {
    const goal = d.open ? 1 : 0;
    d.t = goal > d.t ? Math.min(1, d.t + dt / DOOR_SWING_SEC) : Math.max(0, d.t - dt / DOOR_SWING_SEC);
    writeDoorMatrices(d);
    if (d.t === goal) movingDoors.delete(d);
  });
  doorMesh.instanceMatrix.needsUpdate = true;
}
// 直接把门摆到某个状态（回放用，没有动画）
function snapDoor(d, open) {
  d.open = open;
  d.t = open ? 1 : 0;
  movingDoors.delete(d);
  if (doorMesh && d.slot >= 0) { writeDoorMatrices(d); doorMesh.instanceMatrix.needsUpdate = true; }
}

// 离某点最近、在 maxD 以内的门（只看和自己同一层的底层门）
function nearestDoor(x, z, feetY, maxD) {
  if (feetY > 1.5) return null;
  let best = null, bestD = maxD;
  const ix = Math.floor(x / DOOR_CELL), iz = Math.floor(z / DOOR_CELL);
  for (let gx = ix - 1; gx <= ix + 1; gx++) {
    for (let gz = iz - 1; gz <= iz + 1; gz++) {
      const arr = doorGrid.get(gridKey(gx, gz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const d = arr[i];
        const dd = Math.hypot(Math.max(0, Math.abs(x - d.x) - d.hw), z - d.z);
        if (dd < bestD) { bestD = dd; best = d; }
      }
    }
  }
  return best;
}

// AI 走到门前自动推门（不会顺手关门：门开着说明有人来过）
// （不管是在搜东西、巡逻、跑毒、追人还是交火走位，只要要从门口过就先推开）
function botOpenDoorsAhead(bot, now) {
  if (now < (bot.nextDoorCheck || 0)) return;
  bot.nextDoorCheck = now + 150;
  const p = bot.group.position;
  const d = nearestDoor(p.x, p.z, p.y, 3.2);
  if (!d || d.open) return;
  const side = p.z - d.z;
  const gap = Math.hypot(Math.max(0, Math.abs(p.x - d.x) - d.hw), side);
  // 1) 已经贴到门上了（在动或者想动）
  if (gap < 1.4 && (bot.curSpeed > 0.15 || bot.navPath)) { setDoorOpen(d, true, true); return; }
  // 2) 接下来 1 秒左右要穿过门洞
  const L = Math.max(1.6, bot.curSpeed * 1.1 + 0.8);
  const hx = Math.sin(bot.curHeading), hz = Math.cos(bot.curHeading);
  const ez = p.z + hz * L;
  if (side * (ez - d.z) <= 0 && Math.abs(hz) > 0.05) {
    const xc = p.x + hx * L * ((d.z - p.z) / (hz * L));
    if (Math.abs(xc - d.x) < d.hw + 0.6) { setDoorOpen(d, true, true); return; }
  }
  // 3) 寻路的下一个路点 / 要去的地方在门另一边
  const wp = bot.navPath && bot.navPath[bot.navIdx];
  const goal = wp || bot.lastMoveGoal;
  if (goal && gap < 3.2 && side * (goal.z - d.z) < 0 && Math.abs(goal.x - d.x) < d.hw + 2.5) setDoorOpen(d, true, true);
}

// 玩家：靠近门时出现“开门 / 关门”按钮；开着“自动开门”时走向关着的门会自动推开
const doorBtn = document.getElementById("btn-door");
let doorBtnDoor = null, doorBtnText = "";
function updatePlayerDoorPrompt(moving) {
  let d = null;
  if (player.phase === "ground" && !replayState.active) {
    d = nearestDoor(playerRig.position.x, playerRig.position.z, player.feetY, 2.5);
    if (d && moving && !d.open && gameSettings.autoDoor) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      const tx = d.x - playerRig.position.x, tz = d.z - playerRig.position.z, tl = Math.hypot(tx, tz) || 1;
      if (tl < 1.6 && (fx * tx + fz * tz) / tl > 0.35) setDoorOpen(d, true, false);
    }
  }
  doorBtnDoor = d;
  const text = d ? (d.open ? "🚪 关门" : "🚪 开门") : "";
  if (text !== doorBtnText) {
    doorBtnText = text;
    doorBtn.style.display = d ? "flex" : "none";
    doorBtn.innerText = text;
  }
}
function interactNearestDoor() {
  if (doorBtnDoor) toggleDoor(doorBtnDoor);
}
