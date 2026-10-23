// world.js：地图尺寸、碰撞系统、可站立表面、道路、地点、地形与河流
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ---------------------------------------------------------------------------
// 3.6 世界尺寸：地图面积扩大为原来的 4 倍（1600m → 3200m 见方）
// ---------------------------------------------------------------------------
const MAP_SIZE = 3200;
const MAP_LIMIT = MAP_SIZE / 2 - 5;
const FLOOR_H = 3.2;          // 楼层层高
const STEP_UP = 0.6;          // 能直接迈上去的高度（楼梯、门槛、台阶）
const RIVER_Z = 330, RIVER_HALF = 23;
const BRIDGE_XS = [-720, 0, 720];

// 原始地面平面保留为子弹射线检测代理（不参与渲染），渲染使用下方带起伏远山的高细节地形
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
  new THREE.MeshLambertMaterial({ color: 0x4d5b41 })
);
ground.rotation.x = -Math.PI / 2;
ground.updateMatrixWorld(true);

const shootableEnvironment = [ground];
const wallMeshesForLOS = [];
const wallColliders2D = [];
const buildingFootprints = [];
const worldLootItems = [];

function floorY(f) { return f === 0 ? 0.16 : f * FLOOR_H + 0.1; }

// ---------------------------------------------------------------------------
// 3.7 碰撞：带高度区间的碰撞盒 + 空间网格（多层楼的二楼墙不会挡住一楼的人）
// ---------------------------------------------------------------------------
const COLLIDER_CELL = 6;
const colliderGrid = new Map();
let colliderGridCount = 0;
function gridKey(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }

function addCollider(minX, maxX, minZ, maxZ, minY = 0, maxY = 60) {
  wallColliders2D.push({ minX, maxX, minZ, maxZ, minY, maxY });
}

function syncColliderGrid() {
  while (colliderGridCount < wallColliders2D.length) {
    const c = wallColliders2D[colliderGridCount++];
    if (c.minY === undefined) c.minY = 0;
    if (c.maxY === undefined) c.maxY = 60;
    const x0 = Math.floor(c.minX / COLLIDER_CELL), x1 = Math.floor(c.maxX / COLLIDER_CELL);
    const z0 = Math.floor(c.minZ / COLLIDER_CELL), z1 = Math.floor(c.maxZ / COLLIDER_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = gridKey(ix, iz);
        let arr = colliderGrid.get(k);
        if (!arr) { arr = []; colliderGrid.set(k, arr); }
        arr.push(c);
      }
    }
  }
}

// 人物身体占据的高度区间：脚下 0.45m 以内的矮台阶可以直接迈过，头顶 1.6m 以上的结构不挡路
function isPointBlocked2D(x, z, radius = 0.5, feetY = 0) {
  if (colliderGridCount !== wallColliders2D.length) syncColliderGrid();
  const lo = feetY + 0.45, hi = feetY + 1.6;
  const x0 = Math.floor((x - radius) / COLLIDER_CELL), x1 = Math.floor((x + radius) / COLLIDER_CELL);
  const z0 = Math.floor((z - radius) / COLLIDER_CELL), z1 = Math.floor((z + radius) / COLLIDER_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const arr = colliderGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (c.minY < hi && c.maxY > lo &&
            x + radius > c.minX && x - radius < c.maxX &&
            z + radius > c.minZ && z - radius < c.maxZ) {
          return true;
        }
      }
    }
  }
  return false;
}

// 某个三维点是否在实体内部（投掷物碰撞用）
function isSolidAt(x, y, z, radius) {
  if (colliderGridCount !== wallColliders2D.length) syncColliderGrid();
  const x0 = Math.floor((x - radius) / COLLIDER_CELL), x1 = Math.floor((x + radius) / COLLIDER_CELL);
  const z0 = Math.floor((z - radius) / COLLIDER_CELL), z1 = Math.floor((z + radius) / COLLIDER_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const arr = colliderGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (y >= c.minY && y <= c.maxY &&
            x + radius > c.minX && x - radius < c.maxX &&
            z + radius > c.minZ && z - radius < c.maxZ) {
          return true;
        }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 3.8 可站立表面：各层楼板、平屋顶、楼梯坡道、遗迹平台、桥面（没有表面的地方高度为 0）
// ---------------------------------------------------------------------------
const WALK_CELL = 8;
const walkGrid = new Map();

function registerWalkSurface(s) {
  const x0 = Math.floor(s.x0 / WALK_CELL), x1 = Math.floor(s.x1 / WALK_CELL);
  const z0 = Math.floor(s.z0 / WALK_CELL), z1 = Math.floor(s.z1 / WALK_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const k = gridKey(ix, iz);
      let arr = walkGrid.get(k);
      if (!arr) { arr = []; walkGrid.set(k, arr); }
      arr.push(s);
    }
  }
}
function addWalkRect(x0, z0, x1, z1, y, ceilY = null) {
  registerWalkSurface({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), ya: y, yb: y, axis: 0, ceil: ceilY });
}
// 坡道：沿 z 方向，z0 处高度 ya，z1 处高度 yb
function addWalkRampZ(x0, x1, z0, z1, ya, yb) {
  registerWalkSurface({ x0, x1, z0, z1, ya, yb, axis: 1, ceil: null });
}
function surfaceHeight(s, x, z) {
  if (s.axis === 0) return s.ya;
  const t = (z - s.z0) / (s.z1 - s.z0);
  return s.ya + (s.yb - s.ya) * Math.max(0, Math.min(1, t));
}
// 脚下不高于 maxY 的最高可站立表面
function getGroundHeight(x, z, maxY) {
  let best = 0;
  const arr = walkGrid.get(gridKey(Math.floor(x / WALK_CELL), Math.floor(z / WALK_CELL)));
  if (!arr) return best;
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const h = surfaceHeight(s, x, z);
    if (h <= maxY + 1e-3 && h > best) best = h;
  }
  return best;
}
// 头顶最近的楼板底面（手雷撞天花板反弹用）
function getCeilingAbove(x, z, y) {
  let best = Infinity;
  const arr = walkGrid.get(gridKey(Math.floor(x / WALK_CELL), Math.floor(z / WALK_CELL)));
  if (!arr) return null;
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (s.ceil === null || x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    if (s.ceil > y && s.ceil < best) best = s.ceil;
  }
  return best === Infinity ? null : best;
}

// 平面移动 + 碰撞：按“走到新位置后的脚底高度”判断（这样才能走上楼梯、跨过门槛）
function moveWithWallCollisions(posVec, dx, dz, radius = 0.48, feetY = 0) {
  const nextX = posVec.x + dx;
  if (!isPointBlocked2D(nextX, posVec.z, radius, Math.max(feetY, getGroundHeight(nextX, posVec.z, feetY + STEP_UP)))) posVec.x = nextX;
  const nextZ = posVec.z + dz;
  if (!isPointBlocked2D(posVec.x, nextZ, radius, Math.max(feetY, getGroundHeight(posVec.x, nextZ, feetY + STEP_UP)))) posVec.z = nextZ;
  posVec.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, posVec.x));
  posVec.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, posVec.z));
}

// 玩家专用：正面顶到门框 / 楼梯口边缘时，自动往开口那一侧侧滑（最多偏 0.4 米），
// 摇杆不用精确对准也能顺畅进门、上楼梯
const CORNER_SLIDE_OFFSETS = [0.08, 0.16, 0.24, 0.32, 0.4];
function movePlayerWithCornerAssist(posVec, dx, dz, radius = 0.48, feetY = 0) {
  const x0 = posVec.x, z0 = posVec.z;
  moveWithWallCollisions(posVec, dx, dz, radius, feetY);
  const free = (x, z) => !isPointBlocked2D(x, z, radius, Math.max(feetY, getGroundHeight(x, z, feetY + STEP_UP)));
  // 主要朝 z 方向走却被挡住 → 沿 x 方向找开口；反之亦然
  if (Math.abs(dz) > 1e-4 && posVec.z === z0 && Math.abs(dz) >= Math.abs(dx)) {
    for (const o of CORNER_SLIDE_OFFSETS) {
      for (const s of (dx < 0 ? [-1, 1] : [1, -1])) {
        if (free(posVec.x + s * o, z0 + dz) && free(posVec.x + s * o, z0)) {
          const step = s * Math.min(o, Math.abs(dz));
          if (free(posVec.x + step, z0)) posVec.x += step;
          return;
        }
      }
    }
  } else if (Math.abs(dx) > 1e-4 && posVec.x === x0 && Math.abs(dx) > Math.abs(dz)) {
    for (const o of CORNER_SLIDE_OFFSETS) {
      for (const s of (dz < 0 ? [-1, 1] : [1, -1])) {
        if (free(x0 + dx, posVec.z + s * o) && free(x0, posVec.z + s * o)) {
          const step = s * Math.min(o, Math.abs(dx));
          if (free(x0, posVec.z + step)) posVec.z += step;
          return;
        }
      }
    }
  }
}

// 防卡墙：如果某个位置已经处在碰撞体内部（跳伞落进墙/树/石头、空投箱砸在身上），
// 由内向外螺旋搜索最近的空地并移过去。正常情况下只做一次碰撞查询，几乎零开销
function pushOutOfColliders(posVec, radius, feetY = 0) {
  if (!isPointBlocked2D(posVec.x, posVec.z, radius, feetY)) return false;
  for (let r = 0.3; r <= 14; r += 0.3) {
    const steps = Math.max(8, Math.ceil(r * 6));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = posVec.x + Math.cos(a) * r, z = posVec.z + Math.sin(a) * r;
      if (Math.abs(x) > MAP_LIMIT || Math.abs(z) > MAP_LIMIT) continue;
      if (!isPointBlocked2D(x, z, radius, feetY)) {
        posVec.x = x; posVec.z = z;
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 3.9 道路网：曲线公路 + 乡间土路（原版是两条贯穿全图、16 米宽的笔直大道）
// ---------------------------------------------------------------------------
const ROAD_DEFS = [
  // 南北主干道（经中桥过河）
  { w: 9, kind: "asphalt", pts: [[60, -1760], [10, -1250], [-60, -820], [-20, -420], [0, -80], [36, 190], [0, 286], [0, 374], [-30, 500], [50, 880], [10, 1300], [-30, 1760]] },
  // 东西主干道（穿过 P 城）
  { w: 9, kind: "asphalt", pts: [[-1760, -120], [-1150, -40], [-560, -170], [-220, -70], [0, -80], [300, 10], [760, -50], [1200, 50], [1760, -20]] },
  // P 城 → R 城 → 西北
  { w: 7, kind: "asphalt", pts: [[-220, -70], [-260, -260], [-420, -470], [-620, -640], [-760, -720], [-900, -1000], [-1100, -1400], [-1250, -1760]] },
  // P 城 → Y 城 → 东北
  { w: 7, kind: "asphalt", pts: [[300, 10], [470, -280], [620, -520], [760, -680], [980, -1080], [1280, -1460], [1500, -1760]] },
  // 西桥 → L 城
  { w: 7, kind: "asphalt", pts: [[-1150, -40], [-860, 80], [-730, 200], [-720, 286], [-720, 374], [-720, 720], [-820, 1100], [-640, 1760]] },
  // 东桥 → M 城
  { w: 7, kind: "asphalt", pts: [[760, -50], [740, 120], [720, 286], [720, 374], [720, 760], [1080, 1010], [1760, 1160]] },
  // 南部乡间土路
  { w: 5, kind: "dirt", pts: [[-720, 720], [-420, 880], [-30, 860], [50, 880], [380, 990], [720, 760]] },
  // 学校支路
  { w: 5, kind: "dirt", pts: [[-560, -170], [-562, -240], [-560, -310]] },
  // 遗迹支路
  { w: 5, kind: "dirt", pts: [[-40, -960], [120, -1050], [250, -1088], [318, -1100]] }
];
const roadPolylines = [];
const ROAD_CELL = 40;
const roadGrid = new Map();
let roadQueryKind = null;

function catmull(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}
function sampleRoad(P) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  out.push(P[P.length - 1].slice());
  return out;
}

ROAD_DEFS.forEach(def => {
  const pts = sampleRoad(def.pts);
  roadPolylines.push({ pts, w: def.w, kind: def.kind });
  for (let i = 0; i < pts.length - 1; i++) {
    const s = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], hw: def.w / 2, kind: def.kind };
    const x0 = Math.floor((Math.min(s.ax, s.bx) - s.hw) / ROAD_CELL), x1 = Math.floor((Math.max(s.ax, s.bx) + s.hw) / ROAD_CELL);
    const z0 = Math.floor((Math.min(s.az, s.bz) - s.hw) / ROAD_CELL), z1 = Math.floor((Math.max(s.az, s.bz) + s.hw) / ROAD_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = gridKey(ix, iz);
        let arr = roadGrid.get(k);
        if (!arr) { arr = []; roadGrid.set(k, arr); }
        arr.push(s);
      }
    }
  }
});

function distToSeg(px, pz, s) {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - s.ax) * dx + (pz - s.az) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t));
}
// 到最近路面边缘的距离（负数 = 站在路面上）；同时记录该路面类型到 roadQueryKind
function roadEdgeDistance(x, z, searchR = 40) {
  let best = Infinity;
  roadQueryKind = null;
  const r = Math.ceil(searchR / ROAD_CELL);
  const cx = Math.floor(x / ROAD_CELL), cz = Math.floor(z / ROAD_CELL);
  for (let ix = cx - r; ix <= cx + r; ix++) {
    for (let iz = cz - r; iz <= cz + r; iz++) {
      const arr = roadGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const d = distToSeg(x, z, arr[i]) - arr[i].hw;
        if (d < best) { best = d; roadQueryKind = arr[i].kind; }
      }
    }
  }
  return best;
}

const dirtRoadTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n = fbm(u * 6, v * 6, 91, 4, 6);
    // 两道车辙
    const rut = Math.min(Math.abs(v - 0.3), Math.abs(v - 0.7)) < 0.06 ? 0.86 : 1;
    const k = (0.62 + n * 0.32 + (hash2(x, y, 17) - 0.5) * 0.16) * rut;
    o[0] = 150 * k; o[1] = 124 * k; o[2] = 92 * k;
  });
});
const asphaltRoadTex = makeAsphaltTexture(false);
const roadMaterials = {
  asphalt: new THREE.MeshLambertMaterial({ map: asphaltRoadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  dirt: new THREE.MeshLambertMaterial({ map: dirtRoadTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
};

// 沿曲线生成路面条带（UV 沿道路方向展开，标线跟着弯道走）
function buildRoadRibbon(poly, yLift) {
  const pts = poly.pts, hw = poly.w / 2;
  const pos = [], uv = [], nor = [], idx = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const px = -tz, pz = tx;
    pos.push(pts[i][0] + px * hw, yLift, pts[i][1] + pz * hw, pts[i][0] - px * hw, yLift, pts[i][1] - pz * hw);
    nor.push(0, 1, 0, 0, 1, 0);
    const u = dist / poly.w;
    uv.push(u, 0, u, 1);
    if (i > 0) {
      const a = (i - 1) * 2, b = i * 2;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, roadMaterials[poly.kind]);
  m.receiveShadow = true;
  scene.add(m);
  freezeObject(m);
}
roadPolylines.forEach((poly, i) => buildRoadRibbon(poly, 0.03 + i * 0.004));

// ---------------------------------------------------------------------------
// 3.10 地点（POI）：P 城 + 四座村镇 + 学校 + 遗迹（农场在生成时追加）
// ---------------------------------------------------------------------------
const POIS = [
  { key: "pcity",  name: "P城",  x: 0,    z: -80,   r: 210, weight: 6 },
  { key: "rcity",  name: "R城",  x: -760, z: -720,  r: 120, weight: 3 },
  { key: "ycity",  name: "Y城",  x: 760,  z: -680,  r: 120, weight: 3 },
  { key: "lcity",  name: "L城",  x: -720, z: 720,   r: 120, weight: 3 },
  { key: "mcity",  name: "M城",  x: 720,  z: 760,   r: 120, weight: 3 },
  { key: "school", name: "学校", x: -560, z: -360,  r: 80,  weight: 3,   special: "🏫" },
  { key: "ruins",  name: "遗迹", x: 320,  z: -1160, r: 75,  weight: 2.5, special: "🏛️" }
];
const POI_BY_KEY = {};
POIS.forEach(p => { POI_BY_KEY[p.key] = p; p.buildings = []; });

// ---------------------------------------------------------------------------
// 3.11 地形（含地图外远山）、河流、桥梁
// ---------------------------------------------------------------------------
const TERRAIN_EXT = 900;
const TERRAIN_SIZE = MAP_SIZE + TERRAIN_EXT * 2;
const TERRAIN_SEG = 125;
const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
terrainGeo.rotateX(-Math.PI / 2);
{
  const tPos = terrainGeo.attributes.position;
  const tCol = new Float32Array(tPos.count * 3);
  const edgeStart = MAP_SIZE / 2 + 30;
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i), z = tPos.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    let h = 0;
    if (edge > edgeStart) {
      // 地图边界外隆起远山；沿河流与公路留出山谷，让河与路一直延伸到地平线
      const valley = Math.min(smoothstep(30, 110, Math.abs(z - RIVER_Z) - RIVER_HALF), smoothstep(8, 80, roadEdgeDistance(x, z, 120)));
      h = smoothstep(edgeStart, edgeStart + 380, edge) * (35 + fbm(x / 260, z / 260, 7, 4) * 170) * valley;
    }
    tPos.setY(i, h);
    const n = fbm(x / 170, z / 170, 3, 4);
    const n2 = valueNoise(x / 42, z / 42, 9);
    const dry = smoothstep(0.58, 0.74, n);
    const bank = 1 - smoothstep(RIVER_HALF - 4, RIVER_HALF + 6, Math.abs(z - RIVER_Z));
    const rocky = smoothstep(45, 120, h);
    let r = 0.96 + (n - 0.5) * 0.3 + (n2 - 0.5) * 0.12 + dry * 0.22;
    let g = 0.98 + (n - 0.5) * 0.26 + (n2 - 0.5) * 0.1 + dry * 0.05;
    let bl = 0.95 + (n - 0.5) * 0.2 - dry * 0.08;
    r += bank * 0.35; g += bank * 0.12; bl += bank * 0.05;
    // 村镇地面偏土色、遗迹周边偏灰白碎石色
    POIS.forEach(p => {
      const k = 1 - smoothstep(p.r * 0.55, p.r * 1.05, Math.hypot(x - p.x, z - p.z));
      if (k <= 0) return;
      if (p.key === "ruins") { r += k * 0.32; g += k * 0.2; bl += k * 0.28; }
      else { r += k * 0.16; g += k * 0.04; bl -= k * 0.02; }
    });
    r = r * (1 - rocky) + 1.05 * rocky; g = g * (1 - rocky) + 0.92 * rocky; bl = bl * (1 - rocky) + 1.0 * rocky;
    tCol[i * 3] = r; tCol[i * 3 + 1] = g; tCol[i * 3 + 2] = bl;
  }
  terrainGeo.setAttribute("color", new THREE.Float32BufferAttribute(tCol, 3));
  terrainGeo.computeVertexNormals();
}
grassTex.repeat.set(TERRAIN_SIZE / 7, TERRAIN_SIZE / 7);
const terrainMesh = new THREE.Mesh(terrainGeo, new THREE.MeshLambertMaterial({ map: grassTex, vertexColors: true }));
terrainMesh.receiveShadow = true;
terrainMesh.frustumCulled = false;
scene.add(terrainMesh);
freezeObject(terrainMesh);

waterNormalTex.repeat.set(TERRAIN_SIZE / 24, (RIVER_HALF * 2) / 24);
const riverMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(TERRAIN_SIZE, RIVER_HALF * 2),
  new THREE.MeshPhongMaterial({
    color: 0x24607f, specular: 0x9fc4d8, shininess: 70,
    normalMap: waterNormalTex, normalScale: new THREE.Vector2(0.55, 0.55),
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  })
);
riverMesh.rotation.x = -Math.PI / 2;
riverMesh.position.set(0, 0.02, RIVER_Z);
riverMesh.receiveShadow = true;
scene.add(riverMesh);
freezeObject(riverMesh);

// 蓝圈电网：竖向流动扫描线 + 底部辉光，顶部渐隐
const blueZoneGeo = new THREE.CylinderGeometry(1, 1, 180, 72, 1, true);
const blueZoneMat = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0x0a86ff) } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float time; uniform vec3 color; varying vec2 vUv;
    void main() {
      float band = smoothstep(0.7, 1.0, 0.5 + 0.5 * sin(vUv.y * 42.0 - time * 1.6));
      float fadeTop = 1.0 - smoothstep(0.3, 1.0, vUv.y);
      float glow = 1.0 - smoothstep(0.0, 0.06, vUv.y);
      float a = (0.17 + band * 0.13 + glow * 0.22) * fadeTop;
      gl_FragColor = vec4(color + vec3(0.25, 0.3, 0.3) * (band + glow), a);
    }`,
  transparent: true, side: THREE.DoubleSide, depthWrite: false
});
const blueZoneMesh = new THREE.Mesh(blueZoneGeo, blueZoneMat);
blueZoneMesh.position.y = 90;
blueZoneMesh.frustumCulled = false;
scene.add(blueZoneMesh);
