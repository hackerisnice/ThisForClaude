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

// 子弹 / 视线检测用的场景物体（地形不在这里，按高度场单独求交，见 terrain.js）
const shootableEnvironment = [];
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

// 关着的门只挡玩家（移动时临时打开这个开关）；AI 走到门前会自己推门，寻路也把门洞当通路
let collideWithDoors = false;
// 人物身体占据的高度区间：脚下 0.45m 以内的矮台阶可以直接迈过，头顶 1.6m 以上的结构不挡路
function isPointBlocked2D(x, z, radius = 0.5, feetY = 0) {
  if (colliderGridCount !== wallColliders2D.length) syncColliderGrid();
  const lo = feetY + 0.45, hi = feetY + 1.6;
  if (collideWithDoors && doorBlocksCircle(x, z, radius, lo, hi)) return true;
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

// 指定高度区间 [y0, y1] 内是否有东西挡着（翻越时用：缩起身子过窗口 / 矮墙），关着的门也算
function isBodyBlocked(x, z, radius, y0, y1) {
  if (colliderGridCount !== wallColliders2D.length) syncColliderGrid();
  if (doorBlocksCircle(x, z, radius, y0, y1)) return true;
  const x0 = Math.floor((x - radius) / COLLIDER_CELL), x1 = Math.floor((x + radius) / COLLIDER_CELL);
  const z0 = Math.floor((z - radius) / COLLIDER_CELL), z1 = Math.floor((z + radius) / COLLIDER_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const arr = colliderGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (c.minY < y1 && c.maxY > y0 && x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ) return true;
      }
    }
  }
  return false;
}
// 某处“从脚下长起来”的障碍物（矮墙、窗台、箱子、石头……）顶面高度，没有返回 -Infinity。
// 只算底部在脚边的碰撞体：窗户上方的过梁不算（它决定的是头顶够不够空）
function obstacleTopAt(x, z, radius, feet) {
  if (colliderGridCount !== wallColliders2D.length) syncColliderGrid();
  let top = -Infinity;
  if (doorBlocksCircle(x, z, radius, feet + 0.45, feet + 1.6)) top = 99; // 关着的门翻不过去
  const x0 = Math.floor((x - radius) / COLLIDER_CELL), x1 = Math.floor((x + radius) / COLLIDER_CELL);
  const z0 = Math.floor((z - radius) / COLLIDER_CELL), z1 = Math.floor((z + radius) / COLLIDER_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const arr = colliderGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (c.minY <= feet + 0.5 && c.maxY > feet + 0.45 && x + radius > c.minX && x - radius < c.maxX && z + radius > c.minZ && z - radius < c.maxZ && c.maxY > top) top = c.maxY;
      }
    }
  }
  return top;
}

// 某个三维点是否在实体内部（投掷物碰撞用）
function isSolidAt(x, y, z, radius) {
  if (colliderGridCount !== wallColliders2D.length) syncColliderGrid();
  if (doorBlocksPoint(x, y, z, radius)) return true; // 关着的门（手雷会弹回来）
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
// 脚下不高于 maxY 的最高可站立表面（最低就是地形本身：山坡、平地，见 terrain.js）
function getGroundHeight(x, z, maxY) {
  let best = terrainH(x, z);
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

// 登记一条路（折线点 pts）：路面网格查询（脚步声、不在路上种树盖房）+ 之后生成路面条带。
// street：城镇街道的走向（"v" 南北向 / "h" 东西向），公路为 false
function registerRoad(pts, w, kind, street = false) {
  roadPolylines.push({ pts, w, kind, street });
  for (let i = 0; i < pts.length - 1; i++) {
    const s = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], hw: w / 2, kind };
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
}
ROAD_DEFS.forEach(def => registerRoad(sampleRoad(def.pts), def.w, def.kind));

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
// 照片版土路：沙土照片 + 两道压实的车辙 + 两边渐渐长草（与地面过渡自然）
upgradeToPhoto(dirtRoadTex, "dirtroad", (ctx, s) => {
  const band = (v0, v1, color) => { ctx.fillStyle = color; ctx.fillRect(0, v0 * s, s, (v1 - v0) * s); };
  for (const c of [0.3, 0.7]) {
    band(c - 0.07, c + 0.07, "rgba(70,52,34,0.10)");
    band(c - 0.045, c + 0.045, "rgba(70,52,34,0.12)");
  }
  for (let i = 0; i < 6; i++) {
    const a = 0.16 * (1 - i / 6);
    band(i * 0.012, (i + 1) * 0.012, `rgba(74,86,40,${a})`);
    band(1 - (i + 1) * 0.012, 1 - i * 0.012, `rgba(74,86,40,${a})`);
  }
});
const asphaltRoadTex = makeAsphaltTexture(false);
const roadMaterials = {
  asphalt: new THREE.MeshLambertMaterial({ map: asphaltRoadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  dirt: new THREE.MeshLambertMaterial({ map: dirtRoadTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
};

// 沿曲线生成路面条带（UV 沿道路方向展开，标线跟着弯道走）。路面贴着地形起伏：每 3 米一个横截面、
// 每个横截面左中右三个点都取地形高度再略抬高一点（地形在路面下已经沿路抹平，见 terrain.js）。
// 所有路按“路面类型 + 所在 1 公里方格”合并成少数几个网格（城镇街道很多条，一条一个网格会多出几十次绘制）
const ROAD_TILE = 1000;
const roadBatches = new Map();
function roadBatch(kind, x, z) {
  const key = kind + "|" + Math.floor(x / ROAD_TILE) + "|" + Math.floor(z / ROAD_TILE);
  let b = roadBatches.get(key);
  if (!b) { b = { kind, pos: [], nor: [], uv: [], idx: [] }; roadBatches.set(key, b); }
  return b;
}
function buildRoadRibbon(poly, yLift) {
  const src = poly.pts, hw = poly.w / 2;
  const pts = [];
  for (let i = 0; i < src.length - 1; i++) {
    const n = Math.max(1, Math.ceil(Math.hypot(src[i + 1][0] - src[i][0], src[i + 1][1] - src[i][1]) / 3));
    for (let k = 0; k < n; k++) pts.push([src[i][0] + (src[i + 1][0] - src[i][0]) * k / n, src[i][1] + (src[i + 1][1] - src[i][1]) * k / n]);
  }
  pts.push(src[src.length - 1]);
  let dist = 0, cur = null, prevBase = -1;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const px = -tz, pz = tx, u = dist / poly.w;
    // 跨进另一个方格：在新方格里接着画（把上一个横截面复制一份，条带不断开）
    const b = roadBatch(poly.kind, pts[i][0], pts[i][1]);
    const emit = (j, bb) => {
      const base = bb.pos.length / 3;
      for (const o of [1, 0, -1]) {
        const x = pts[j][0] + px * hw * o, z = pts[j][1] + pz * hw * o;
        bb.pos.push(x, terrainH(x, z) + yLift, z);
        terrainNormalAt(x, z, _roadN);
        bb.nor.push(_roadN.x, _roadN.y, _roadN.z);
      }
      const uj = j === i ? u : (dist - Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1])) / poly.w;
      bb.uv.push(uj, 0, uj, 0.5, uj, 1);
      return base;
    };
    if (cur !== b && i > 0) { prevBase = emit(i - 1, b); cur = b; }
    else if (cur !== b) cur = b;
    const base = emit(i, b);
    // 三角形朝上（原来的绕序朝下，从上面看会被背面剔除，路面根本画不出来）
    if (prevBase >= 0) {
      for (let c = 0; c < 2; c++) b.idx.push(prevBase + c, base + c, prevBase + c + 1, prevBase + c + 1, base + c, base + c + 1);
    }
    prevBase = base;
  }
}
function flushRoadBatches() {
  roadBatches.forEach(b => {
    if (!b.idx.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    g.setIndex(b.pos.length / 3 > 65000 ? new THREE.Uint32BufferAttribute(b.idx, 1) : new THREE.Uint16BufferAttribute(b.idx, 1));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, roadMaterials[b.kind]);
    m.receiveShadow = true;
    scene.add(m);
    freezeObject(m);
  });
  roadBatches.clear();
}
const _roadN = new THREE.Vector3();

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
// 3.11 河流（地形本身见 terrain.js）
// ---------------------------------------------------------------------------
const TERRAIN_EXT = 900;
const TERRAIN_SIZE = MAP_SIZE + TERRAIN_EXT * 2;
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
