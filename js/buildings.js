// buildings.js：建筑积木：墙、门窗、屋顶、楼梯、多层楼、家具
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ---------------------------------------------------------------------------
// 3.12 建筑积木：代理网格（子弹/视线检测）+ 合批渲染 + 碰撞盒，一次调用全部登记
// ---------------------------------------------------------------------------
const PROXY_MAT = new THREE.MeshBasicMaterial();
function addSolidBox(cx, cy, cz, sx, sy, sz, color, o = {}) {
  const m = new THREE.Mesh(UNIT_BOX, PROXY_MAT);
  m.position.set(cx, cy, cz);
  m.scale.set(sx, sy, sz);
  if (o.rotX) m.rotation.x = o.rotX;
  if (o.rotZ) m.rotation.z = o.rotZ;
  if (o.visual !== false) {
    addToStaticBatch(m, o.key || "plaster", color, { ao: o.ao, skipBottom: o.skipBottom, aoBase: o.aoBase === undefined ? 0 : o.aoBase });
  } else {
    m.updateMatrixWorld(true);
  }
  if (o.shoot !== false) shootableEnvironment.push(m);
  if (o.los !== false) wallMeshesForLOS.push(m);
  if (o.collider !== false && !o.rotX && !o.rotZ) addCollider(cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, cy - sy / 2, cy + sy / 2);
  return m;
}
function addVisualBox(cx, cy, cz, sx, sy, sz, color, key = "plaster", o = {}) {
  return addSolidBox(cx, cy, cz, sx, sy, sz, color, Object.assign({ key, shoot: false, los: false, collider: false }, o));
}
// 任意形状的静态网格（坐标已是世界坐标），例如山墙三角
function addSolidGeometry(geo, color, key, o = {}) {
  const m = new THREE.Mesh(geo, PROXY_MAT);
  m.updateMatrixWorld(true);
  addToStaticBatch(m, key, color, { ao: false });
  if (o.shoot !== false) shootableEnvironment.push(m);
  if (o.los !== false) wallMeshesForLOS.push(m);
  return m;
}

// 已占用区域（建筑 / 学校 / 遗迹），用于摆放时避免重叠
const reservedRects = [];
const RES_CELL = 64;
const reservedGrid = new Map();
function reserveRect(x0, z0, x1, z1) {
  const r = { x0, z0, x1, z1 };
  reservedRects.push(r);
  for (let ix = Math.floor(x0 / RES_CELL); ix <= Math.floor(x1 / RES_CELL); ix++) {
    for (let iz = Math.floor(z0 / RES_CELL); iz <= Math.floor(z1 / RES_CELL); iz++) {
      const k = gridKey(ix, iz);
      let arr = reservedGrid.get(k);
      if (!arr) { arr = []; reservedGrid.set(k, arr); }
      arr.push(r);
    }
  }
}
function isRectReserved(x0, z0, x1, z1, margin) {
  for (let ix = Math.floor((x0 - margin) / RES_CELL); ix <= Math.floor((x1 + margin) / RES_CELL); ix++) {
    for (let iz = Math.floor((z0 - margin) / RES_CELL); iz <= Math.floor((z1 + margin) / RES_CELL); iz++) {
      const arr = reservedGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        if (x1 + margin > r.x0 && x0 - margin < r.x1 && z1 + margin > r.z0 && z0 - margin < r.z1) return true;
      }
    }
  }
  return false;
}
// 一块矩形区域能否用来盖房子/放东西：不出界、不压河、不压路、不和已有建筑重叠
function isRectBuildable(x0, z0, x1, z1, margin) {
  if (x0 < -MAP_LIMIT + 25 || x1 > MAP_LIMIT - 25 || z0 < -MAP_LIMIT + 25 || z1 > MAP_LIMIT - 25) return false;
  if (z1 > RIVER_Z - RIVER_HALF - margin - 6 && z0 < RIVER_Z + RIVER_HALF + margin + 6) return false;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hd = Math.hypot(x1 - x0, z1 - z0) / 2;
  if (roadEdgeDistance(cx, cz, hd + margin + 10) < hd + margin) return false;
  return !isRectReserved(x0, z0, x1, z1, margin);
}

// 沿 x 方向（位于 z = fixed）或 z 方向（位于 x = fixed）的一段墙，按门窗开口切成若干实心块
function buildWall(axis, fixed, from, to, yBase, height, thick, color, openings, o = {}) {
  const ops = (openings || []).filter(op => op.b > from + 0.05 && op.a < to - 0.05).sort((p, q) => p.a - q.a);
  const key = o.key || "plaster";
  let cur = from;
  const piece = (a, b, y0, y1) => {
    if (b - a < 0.05 || y1 - y0 < 0.05) return;
    const len = b - a, mid = (a + b) / 2, cy = yBase + (y0 + y1) / 2, h = y1 - y0;
    const opts = { key, aoBase: yBase, skipBottom: y0 <= 0.001 };
    if (axis === "x") addSolidBox(mid, cy, fixed, len, h, thick, color, opts);
    else addSolidBox(fixed, cy, mid, thick, h, len, color, opts);
  };
  for (const op of ops) {
    const a = Math.max(from, op.a), b = Math.min(to, op.b);
    piece(cur, a, 0, height);
    piece(a, b, 0, op.bottom);
    piece(a, b, op.top, height);
    // 窗台（纯视觉，凸出墙面一点，让立面更有层次）
    if (op.bottom > 0.3 && o.sills !== false) {
      const sy = yBase + op.bottom - 0.04;
      if (axis === "x") addVisualBox((a + b) / 2, sy, fixed, b - a + 0.24, 0.08, thick + 0.18, 0x5f5850, "plaster", { ao: false });
      else addVisualBox(fixed, sy, (a + b) / 2, thick + 0.18, 0.08, b - a + 0.24, 0x5f5850, "plaster", { ao: false });
    }
    cur = b;
  }
  piece(cur, to, 0, height);
}

// 山墙双坡屋顶（纯外观 + 子弹/视线代理；不可站立，跳伞落上去会落进顶层室内）
function buildGableRoof(cx, cz, w, d, H, roofColor, wallColor) {
  const alongX = w >= d;
  const span = alongX ? d : w, length = alongX ? w : d;
  const run = span / 2 + 0.5, rh = Math.min(3.2, span * 0.32);
  const L = Math.hypot(run, rh), ang = Math.atan2(rh, run);
  for (const side of [-1, 1]) {
    if (alongX) addSolidBox(cx, H + rh / 2 + 0.05, cz + side * run / 2, length + 1.0, 0.18, L, roofColor, { rotX: side * ang, ao: false });
    else addSolidBox(cx + side * run / 2, H + rh / 2 + 0.05, cz, L, 0.18, length + 1.0, roofColor, { rotZ: -side * ang, ao: false });
  }
  // 两端山墙三角
  const tri = [];
  const apex = H + rh * (1 - 0.12);
  for (const end of [-1, 1]) {
    if (alongX) {
      const x = cx + end * (w / 2 + 0.2);
      tri.push(x, H, cz - d / 2, x, H, cz + d / 2, x, apex, cz);
      tri.push(x, H, cz + d / 2, x, H, cz - d / 2, x, apex, cz);
    } else {
      const z = cz + end * (d / 2 + 0.2);
      tri.push(cx - w / 2, H, z, cx + w / 2, H, z, cx, apex, z);
      tri.push(cx + w / 2, H, z, cx - w / 2, H, z, cx, apex, z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  g.computeVertexNormals();
  addSolidGeometry(g, wallColor, "plaster");
}

// 楼梯井：贴着西墙的双跑楼梯（两条并排的坡道交替上下），四周有隔墙，楼梯口有护栏
// 楼梯道宽 1.6 米（原 1.25 米：人物身宽 0.96 米，要对准中线 ±15 厘米才挤得进去，看起来就像“二楼上不去”）
const STAIR_LANE_W = 1.6, STAIR_DIV = 0.15, STAIR_RUN = 5.2;
// 一段直跑楼梯：可站立坡道 + 台阶外观 + 子弹代理 + 楼梯下方实心区（防止从楼梯底下钻进去）
function buildStairFlight(x0, x1, zA, zB, yb, yt, risesSouth) {
  const run = zB - zA;
  if (risesSouth) addWalkRampZ(x0, x1, zA, zB, yb, yt);
  else addWalkRampZ(x0, x1, zA, zB, yt, yb);
  // 台阶（纯视觉）
  const N = 9;
  for (let k = 0; k < N; k++) {
    const top = yb + (yt - yb) * (k + 1) / N;
    const zc = zA + run * (k + 0.5) / N;
    addVisualBox((x0 + x1) / 2, (yb + top) / 2, risesSouth ? zc : zA + zB - zc, x1 - x0, top - yb, run / N, 0x7a6a58, "wood", { skipBottom: true, ao: false });
  }
  // 子弹代理：楼梯斜面
  const slope = Math.atan2(yt - yb, run);
  addSolidBox((x0 + x1) / 2, (yb + yt) / 2 - 0.1, (zA + zB) / 2, x1 - x0, 0.2, Math.hypot(run, yt - yb), 0, { visual: false, los: false, rotX: risesSouth ? -slope : slope });
  const blockH = 1.3, frac = blockH / (yt - yb);
  if (risesSouth) addCollider(x0, x1, zA + run * frac, zB, yb, yb + blockH);
  else addCollider(x0, x1, zA, zB - run * frac, yb, yb + blockH);
}
// toRoof：平顶楼再加一段从顶层通到屋顶的楼梯（屋顶开口，三面有护栏，出口一面敞开）
function buildStairCore(ix0, zA, zB, floors, color, toRoof = false) {
  const lanes = [[ix0, ix0 + STAIR_LANE_W], [ix0 + STAIR_LANE_W + STAIR_DIV, ix0 + 2 * STAIR_LANE_W + STAIR_DIV]];
  const coreX1 = lanes[1][1];
  const run = zB - zA;
  const H = floors * FLOOR_H;
  addSolidBox(ix0 + STAIR_LANE_W + STAIR_DIV / 2, H / 2, (zA + zB) / 2, STAIR_DIV, H, run, color, { skipBottom: true });
  addSolidBox(coreX1 + 0.08, H / 2, (zA + zB) / 2, 0.16, H, run, color, { skipBottom: true });
  const flights = toRoof ? floors : floors - 1;
  for (let f = 0; f < flights; f++) {
    const L = f % 2;
    const [x0, x1] = lanes[L];
    const roof = f === floors - 1;
    const yt = roof ? H + 0.2 : floorY(f + 1);
    buildStairFlight(x0, x1, zA, zB, floorY(f), yt, L === 0);
    // 上一层楼梯井口护栏（在本段楼梯低端那一头，防止从井口掉下去）
    const railZ = L === 0 ? zA : zB;
    addSolidBox((x0 + x1) / 2, yt + 0.5, railZ, x1 - x0, 1.0, 0.1, 0x3a3532, { los: false, aoBase: yt, ao: false });
    if (roof) {
      // 屋顶开口两侧的护栏
      addSolidBox(x0 + 0.05, yt + 0.5, (zA + zB) / 2, 0.1, 1.0, run, 0x3a3532, { los: false, aoBase: yt, ao: false });
      addSolidBox(x1 - 0.05, yt + 0.5, (zA + zB) / 2, 0.1, 1.0, run, 0x3a3532, { los: false, aoBase: yt, ao: false });
    }
  }
  return { lanes, zA, zB, coreX1, roofLane: toRoof ? (floors - 1) % 2 : -1 };
}

// 从矩形里挖掉一个矩形洞，返回剩下的（最多 4 块）矩形 [x0, z0, x1, z1]
function rectMinusHole(X0, Z0, X1, Z1, hx0, hz0, hx1, hz1) {
  return [[X0, Z0, X1, hz0], [X0, hz1, X1, Z1], [X0, hz0, hx0, hz1], [hx1, hz0, X1, hz1]]
    .filter(r => r[2] - r[0] > 0.05 && r[3] - r[1] > 0.05);
}

// 单层平顶房：贴着东墙（东边没地方就西墙）的室外楼梯 + 顶端平台，女儿墙在平台处留口子走上屋顶。
// 返回女儿墙缺口所在的那一侧与 z 范围
function buildExteriorStair(cx, cz, w, d, roofY, sides) {
  const run = Math.min(5.6, d - 2.2), land = 1.4, laneW = 1.4;
  if (run < 4) return null;
  for (const side of sides) {
    const inner = cx + side * (w / 2 + 0.32), outer = inner + side * laneW;
    const lx0 = Math.min(inner, outer), lx1 = Math.max(inner, outer);
    const Z0 = cz - d / 2 + 0.2, zR = Z0 + land, zE = zR + run;
    if (isRectReserved(lx0 - 0.15, Z0 - 0.15, lx1 + 0.15, zE + 0.4, 0) || roadEdgeDistance((lx0 + lx1) / 2, (Z0 + zE) / 2, 12) < 1.5) continue;
    // 从南往北爬升的坡道（复用楼梯段：台阶外观 + 坡道 + 子弹代理 + 坡道下方实心区）
    buildStairFlight(lx0, lx1, zR, zE, 0, roofY, false);
    // 顶端平台（与屋顶挑檐重叠一点，走过去不会掉缝）
    const px0 = side > 0 ? cx + w / 2 + 0.25 : lx0, px1 = side > 0 ? lx1 : cx - w / 2 - 0.25;
    addSolidBox((px0 + px1) / 2, roofY - 0.1, (Z0 + zR) / 2, px1 - px0, 0.2, land, 0x596066, { key: "wood", collider: false, ao: false });
    addWalkRect(px0, Z0, px1, zR, roofY, roofY - 0.2);
    addCollider(lx0, lx1, Z0, zR, 0, 1.3); // 平台下面不能钻
    // 外侧护栏（坡道 + 平台）与平台北侧护栏
    const rx = side > 0 ? lx1 - 0.04 : lx0 + 0.04;
    addSolidBox(rx, (roofY + 1.0) / 2, (Z0 + zE) / 2, 0.08, roofY + 1.0, zE - Z0, 0x3a3532, { los: false, shoot: false, ao: false, visual: false });
    addVisualBox(rx, roofY + 0.95, (Z0 + zR) / 2, 0.08, 0.08, land, 0x3a3532, "plaster", { ao: false });
    const sl = Math.atan2(roofY, run);
    addVisualBox(rx, roofY / 2 + 0.95, (zR + zE) / 2, 0.08, 0.08, Math.hypot(run, roofY), 0x3a3532, "plaster", { ao: false, rotX: sl });
    addSolidBox((lx0 + lx1) / 2, roofY + 0.5, Z0 + 0.04, lx1 - lx0, 1.0, 0.08, 0x3a3532, { los: false, ao: false, aoBase: roofY });
    // 立柱
    [Z0 + 0.1, zR, zR + run * 0.5].forEach(z => {
      const top = z <= zR ? roofY - 0.2 : roofY * (1 - (z - zR) / run);
      addSolidBox(rx, top / 2, z, 0.12, top, 0.12, 0x596066, { los: false, ao: false, skipBottom: true });
    });
    reserveRect(lx0, Z0, lx1, zE);
    return { side, z0: Z0, z1: zR, zE, lx0, lx1 };
  }
  return null;
}

// 高大单层建筑（仓库 / 谷仓 / 体育馆）的钢架平台：贴南墙一整排、深 3 米、与二楼同高，
// 西墙边一条坡道（与楼梯同坡度）从北往南爬上去，可以从高窗往外打。
// 返回值与楼梯井同格式，AI 按“两层楼”自动寻路上下
const CATWALK_DEPTH = 3.0;
function buildCatwalk(cx, ix0, ix1, iz1) {
  const zB = iz1 - CATWALK_DEPTH, zA = zB - STAIR_RUN;
  const lanes = [[ix0, ix0 + STAIR_LANE_W], [ix0 + STAIR_LANE_W + STAIR_DIV, ix0 + 2 * STAIR_LANE_W + STAIR_DIV]];
  const [x0, x1] = lanes[0];
  const yt = floorY(1);
  const steel = 0x596066;
  buildStairFlight(x0, x1, zA, zB, floorY(0), yt, true);
  // 坡道东侧挡板（只能从北端走上坡道，不会从侧面钻进坡道下面）
  addSolidBox(x1 + 0.05, 0.75, (zA + 0.9 + zB) / 2, 0.1, 1.5, zB - zA - 0.9, steel, { los: false, ao: false, skipBottom: true });
  // 平台板（可站立，下面可以走人）
  addSolidBox(cx, yt - 0.1, (zB + iz1) / 2, ix1 - ix0, 0.2, iz1 - zB, steel, { key: "wood", collider: false, ao: false });
  addWalkRect(ix0, zB, ix1, iz1, yt, yt - 0.2);
  // 平台边缘护栏（坡道口留空）+ 支撑立柱
  addSolidBox((x1 + ix1) / 2, yt + 0.5, zB + 0.04, ix1 - x1, 1.0, 0.08, 0x3a3532, { los: false, ao: false, aoBase: yt });
  for (let px = x1 + 3; px < ix1 - 0.5; px += 5) {
    addSolidBox(px, (yt - 0.2) / 2, zB + 0.15, 0.2, yt - 0.2, 0.2, steel, { los: false, ao: false, skipBottom: true });
  }
  return { lanes, zA, zB, coreX1: x1 + STAIR_DIV, catwalk: true };
}

const FACADE_COLORS = [0xc2b29b, 0x9b7653, 0x7a8b99, 0xb86b52, 0x8c857b, 0xd1c7b0, 0xa39a86, 0x8f9a8a, 0xb5a48a, 0xc9b38f];
const ROOF_COLORS = [0x4a413b, 0x6b3a2e, 0x3f4448, 0x6a4b3a, 0x52575b];
const pickColor = arr => arr[Math.floor(Math.random() * arr.length)];

// 通用建筑生成器：多层（每层有窗、底层南北开门）、楼梯井、平顶/双坡顶、室内家具与物资
function buildBuilding(o) {
  const { cx, cz, w, d } = o;
  const floors = o.floors || 1;
  const wallH = o.wallH || FLOOR_H;
  const H = floors === 1 ? wallH : floors * FLOOR_H;
  const t = 0.4;
  const color = o.color || pickColor(FACADE_COLORS);
  const key = o.key || "plaster";
  const ix0 = cx - w / 2 + t / 2, ix1 = cx + w / 2 - t / 2;
  const iz0 = cz - d / 2 + t / 2, iz1 = cz + d / 2 - t / 2;
  const doorW = o.doorW || 2.6, doorH = o.doorH || 2.6;

  // 底层地板
  addSolidBox(cx, 0.08, cz, w, 0.16, d, o.floorColor || 0x6a5442, { key: "wood", collider: false, los: false, ao: false, skipBottom: true });
  addWalkRect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 0.16);

  // 楼梯井（两层及以上）
  let stairs = null;
  const flatRoof = o.roof !== "gable" && o.roof !== "none";
  if (floors >= 2) {
    const zA = cz - STAIR_RUN / 2, zB = cz + STAIR_RUN / 2;
    stairs = buildStairCore(ix0, zA, zB, floors, color, flatRoof);
  } else if (o.catwalk && wallH >= 5.8 && d >= 10.5) {
    // 仓库 / 谷仓 / 体育馆外面看有一排高窗，像有二楼：里面真的加一层平台，能上去
    stairs = buildCatwalk(cx, ix0, ix1, iz1);
  }
  const hasCatwalk = !!(stairs && stairs.catwalk);
  const levels = hasCatwalk ? 2 : floors;

  // 楼板（挖掉楼梯井）
  for (let f = 1; f < floors; f++) {
    const y = f * FLOOR_H;
    const rects = [];
    if (stairs) {
      const [hx0, hx1] = stairs.lanes[(f - 1) % 2];
      rects.push([ix0, iz0, ix1, stairs.zA], [ix0, stairs.zB, ix1, iz1]);
      if (hx0 - ix0 > 0.05) rects.push([ix0, stairs.zA, hx0, stairs.zB]);
      rects.push([hx1, stairs.zA, ix1, stairs.zB]);
    } else {
      rects.push([ix0, iz0, ix1, iz1]);
    }
    rects.forEach(([x0, z0, x1, z1]) => {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
      addSolidBox((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, 0.2, z1 - z0, o.floorColor || 0x6a5442, { key: "wood", collider: false, ao: false });
      addWalkRect(x0, z0, x1, z1, y + 0.1, y - 0.1);
    });
  }

  // 外墙：底层南北开门，各层开窗；西墙避开楼梯井不开窗（防止从楼梯上翻出窗外）
  const winOps = (centers, width, bottom, top) => centers.map(c => ({ a: c - width / 2, b: c + width / 2, bottom, top }));
  for (let f = 0; f < floors; f++) {
    const yBase = f * FLOOR_H;
    const h = floors === 1 ? wallH : FLOOR_H;
    const tall = h > 4;
    // 有平台的高大建筑：高窗下沿对准平台上的人眼高度以下，站在平台上能往外看、往外打
    const wb = tall ? (hasCatwalk ? FLOOR_H + 1.0 : h - 2.0) : 1.0, wt = tall ? h - 0.8 : 2.3;
    const nsCenters = w >= 12 ? [cx - w * 0.3, cx + w * 0.3] : (w >= 9 ? [cx - w * 0.28, cx + w * 0.28] : []);
    for (const side of [-1, 1]) {
      const ops = [];
      if (f === 0 && o.doors !== false) {
        ops.push({ a: cx - doorW / 2, b: cx + doorW / 2, bottom: 0, top: doorH });
        if (o.kind !== "ruin") registerDoor(cx, cz + side * d / 2, doorW, doorH, -side); // 向屋里开的双开门
      }
      else if (w >= 13 && o.windows !== false) ops.push(...winOps([cx], 1.6, wb, wt));
      if (o.windows !== false) ops.push(...winOps(nsCenters, 1.5, wb, wt));
      buildWall("x", cz + side * d / 2, cx - w / 2 - t / 2, cx + w / 2 + t / 2, yBase, h, t, color, ops, { key });
    }
    const nWin = Math.max(1, Math.floor((d - 2) / 4.2));
    const ewCenters = [];
    for (let k = 0; k < nWin; k++) ewCenters.push(cz - d / 2 + d * (k + 0.5) / nWin);
    for (const side of [-1, 1]) {
      let centers = o.windows === false ? [] : ewCenters;
      if (side === -1 && stairs) centers = centers.filter(c => c < stairs.zA - 1.2 || c > stairs.zB + 1.2);
      const ops = winOps(centers, 1.5, wb, wt);
      (o.sideOpenings || []).forEach(so => {
        if (so.side === (side < 0 ? "west" : "east") && so.floors.includes(f)) {
          ops.push({ a: so.z - so.width / 2, b: so.z + so.width / 2, bottom: 0, top: 2.5 });
        }
      });
      buildWall("z", cx + side * w / 2, cz - d / 2 + t / 2, cz + d / 2 - t / 2, yBase, h, t, color, ops, { key });
    }
    // 楼层之间的腰线（纯视觉）
    if (f > 0 && o.trim !== false) {
      addVisualBox(cx, yBase, cz - d / 2 - 0.25, w + 0.9, 0.22, 0.12, 0x5f5850, "plaster", { ao: false });
      addVisualBox(cx, yBase, cz + d / 2 + 0.25, w + 0.9, 0.22, 0.12, 0x5f5850, "plaster", { ao: false });
    }
  }

  // 屋顶
  let roofY = null, ext = null;
  if (o.roof === "gable") {
    addSolidBox(cx, H, cz, w, 0.2, d, o.floorColor || 0x6a5442, { key: "wood", collider: false, ao: false });
    buildGableRoof(cx, cz, w, d, H + 0.1, o.roofColor || pickColor(ROOF_COLORS), color);
  } else if (o.roof !== "none") {
    // 平屋顶 + 女儿墙（可站立；跳伞可以落在楼顶）。多层楼：楼梯通到屋顶，屋顶上开一个楼梯口；
    // 单层房：外墙边有室外楼梯上屋顶，女儿墙在楼梯平台处留口子
    const rc = o.roofColor || 0x4a413b;
    roofY = H + 0.2;
    const X0 = cx - w / 2 - 0.3, X1 = cx + w / 2 + 0.3, Z0 = cz - d / 2 - 0.3, Z1 = cz + d / 2 + 0.3;
    const rl = stairs && stairs.roofLane >= 0 ? stairs.lanes[stairs.roofLane] : null;
    const roofRects = rl ? rectMinusHole(X0, Z0, X1, Z1, rl[0], stairs.zA, rl[1], stairs.zB) : [[X0, Z0, X1, Z1]];
    roofRects.forEach(([a, b, c, e]) => {
      addSolidBox((a + c) / 2, H + 0.05, (b + e) / 2, c - a, 0.3, e - b, rc, { collider: false, ao: false });
      addWalkRect(a, b, c, e, roofY, H - 0.1);
    });
    // 有侧门通道连着别的楼的那一侧不放室外楼梯
    const extSides = [1, -1].filter(sd => !(o.sideOpenings || []).some(so => so.side === (sd > 0 ? "east" : "west")));
    ext = floors === 1 && H <= 4 && o.windows !== false && o.kind !== "ruin" ? buildExteriorStair(cx, cz, w, d, roofY, extSides) : null;
    const pc = 0x5a514a;
    addSolidBox(cx, roofY + 0.3, cz - d / 2 - 0.18, w + 0.6, 0.6, 0.25, pc, { ao: false, skipBottom: true });
    addSolidBox(cx, roofY + 0.3, cz + d / 2 + 0.18, w + 0.6, 0.6, 0.25, pc, { ao: false, skipBottom: true });
    for (const side of [-1, 1]) {
      const px = cx + side * (w / 2 + 0.18);
      if (ext && ext.side === side) {
        // 楼梯平台处的女儿墙缺口
        const za = cz - d / 2 - 0.05, zb = cz + d / 2 + 0.05;
        if (ext.z0 - za > 0.05) addSolidBox(px, roofY + 0.3, (za + ext.z0) / 2, 0.25, 0.6, ext.z0 - za, pc, { ao: false, skipBottom: true });
        addSolidBox(px, roofY + 0.3, (ext.z1 + zb) / 2, 0.25, 0.6, zb - ext.z1, pc, { ao: false, skipBottom: true });
      } else {
        addSolidBox(px, roofY + 0.3, cz, 0.25, 0.6, d + 0.1, pc, { ao: false, skipBottom: true });
      }
    }
    // 屋顶空调外机/水箱（掩体）
    if (o.roofProps !== false && w > 11 && Math.random() < 0.7) {
      addSolidBox(cx + w * 0.2, roofY + 0.5, cz + d * 0.15, 1.6, 1.0, 1.0, 0x8a8f94, { aoBase: roofY });
    }
  }

  // 室内家具（掩体）与物资，每层分别摆放
  const coreX1 = stairs ? stairs.coreX1 : ix0;
  for (let f = 0; f < levels; f++) {
    const fy = floorY(f);
    const onCatwalk = f >= floors;
    if (o.furniture !== false && !onCatwalk) placeFurniture(o, ix0, ix1, iz0, iz1, coreX1, stairs, fy, cx);
    if (o.loot !== false) placeFloorLoot(o, ix0, ix1, iz0, iz1, coreX1, stairs, fy, onCatwalk ? w * CATWALK_DEPTH : w * d);
  }

  const rec = {
    cx, cz, w, d, floors: levels, kind: o.kind || "house", poi: o.poi || null, roofY, stairs, extStair: ext,
    northDoor: { x: cx, z: cz - d / 2 - 2.0 },
    southDoor: { x: cx, z: cz + d / 2 + 2.0 }
  };
  buildingFootprints.push(rec);
  indexBuilding(rec);
  reserveRect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  if (o.poi && POI_BY_KEY[o.poi]) POI_BY_KEY[o.poi].buildings.push(rec);
  return rec;
}

const FURNITURE_TYPES = [
  { w: 1.2, d: 1.2, h: 1.2, color: 0x7a5835, key: "wood" },   // 木箱
  { w: 1.2, d: 1.2, h: 2.4, color: 0x6e4f30, key: "wood" },   // 叠起来的木箱
  { w: 1.8, d: 0.9, h: 0.85, color: 0x5c4532, key: "wood" },  // 桌子
  { w: 2.0, d: 0.5, h: 1.9, color: 0x4f3d2c, key: "wood" },   // 书架
  { w: 2.0, d: 1.0, h: 0.6, color: 0x7d6a5a, key: "plaster" } // 床 / 沙发
];
function placeFurniture(o, ix0, ix1, iz0, iz1, coreX1, stairs, fy, cx) {
  const n = 1 + Math.floor(Math.random() * 2) + (ix1 - ix0 > 14 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const ft = FURNITURE_TYPES[Math.floor(Math.random() * FURNITURE_TYPES.length)];
    // 只靠东墙或南北墙角摆放，不挡门口中轴线与楼梯口
    const spot = Math.floor(Math.random() * 3);
    let x, z, fw = ft.w, fd = ft.d;
    if (spot === 0) { fw = ft.d; fd = ft.w; x = ix1 - fw / 2 - 0.05; z = iz0 + 1.2 + Math.random() * Math.max(0.1, iz1 - iz0 - 2.4); }
    else { x = cx + 2.0 + fw / 2 + Math.random() * Math.max(0.1, ix1 - cx - 3.0 - fw); z = spot === 1 ? iz0 + fd / 2 + 0.05 : iz1 - fd / 2 - 0.05; }
    if (x - fw / 2 < coreX1 + 0.6 || x + fw / 2 > ix1 + 0.01) continue;
    if (isPointBlocked2D(x, z, Math.max(fw, fd) / 2 + 0.3, fy)) continue;
    addSolidBox(x, fy + ft.h / 2, z, fw, ft.h, fd, ft.color, { key: ft.key, aoBase: fy, skipBottom: true });
  }
}
function placeFloorLoot(o, ix0, ix1, iz0, iz1, coreX1, stairs, fy, area) {
  const count = Math.round((1.6 + area / 70) * (o.lootMul || 1) * (0.8 + Math.random() * 0.4));
  let placed = 0;
  for (let tries = 0; tries < count * 8 && placed < count; tries++) {
    const x = ix0 + 0.9 + Math.random() * (ix1 - ix0 - 1.8);
    const z = iz0 + 0.9 + Math.random() * (iz1 - iz0 - 1.8);
    if (stairs && x < coreX1 + 0.5 && z > stairs.zA - 0.3 && z < stairs.zB + 0.3) continue;
    if (Math.abs(getGroundHeight(x, z, fy + 0.05) - fy) > 0.05) continue;
    if (isPointBlocked2D(x, z, 0.35, fy)) continue;
    spawnRandomGroundLoot(x, z, null, fy);
    placed++;
  }
}

// 建筑空间索引（AI 每帧都要查“自己在哪栋楼里”）
const BLD_CELL = 32;
const buildingGrid = new Map();
function indexBuilding(b) {
  for (let ix = Math.floor((b.cx - b.w / 2 - 1.2) / BLD_CELL); ix <= Math.floor((b.cx + b.w / 2 + 1.2) / BLD_CELL); ix++) {
    for (let iz = Math.floor((b.cz - b.d / 2 - 1.2) / BLD_CELL); iz <= Math.floor((b.cz + b.d / 2 + 1.2) / BLD_CELL); iz++) {
      const k = gridKey(ix, iz);
      let arr = buildingGrid.get(k);
      if (!arr) { arr = []; buildingGrid.set(k, arr); }
      arr.push(b);
    }
  }
}
// 检查一个坐标位于哪栋建筑内部（用于房门导航进出屋）
function getBuildingContainingPoint(x, z, margin = 0.2) {
  const arr = buildingGrid.get(gridKey(Math.floor(x / BLD_CELL), Math.floor(z / BLD_CELL)));
  if (!arr) return null;
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    if (Math.abs(x - b.cx) < b.w / 2 + margin && Math.abs(z - b.cz) < b.d / 2 + margin) return b;
  }
  return null;
}
