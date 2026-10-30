// pathfind.js：AI 绕路寻路 —— 平时直接走（触须避障），一旦朝目标走不过去（被房子、L 形墙角、围墙挡住），
// 就在自己和目标之间的区域里用 A* 在 1 米网格上算一条绕行路线，再把路线拉直成少量路点跟着走
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const NAV_CELL = 1.0;          // 网格边长（米）
const NAV_RADIUS = 0.5;        // 按 AI 身体半径判断格子能不能站
const NAV_MAX_SPAN = 120;      // 一次搜索的区域最大边长（米），目标再远就先走到区域边上
const NAV_MAX_EXPAND = 12000;  // 一次搜索最多展开的格子数
const navLevelCaches = new Map(); // 每一层一个“格子能不能站”的缓存
let navCacheColliders = -1;
let navSearchesThisFrame = 0;  // 每帧最多算一次，避免卡顿（主循环每帧清零）

// 地面层用 1 米格；楼上（屋里窄、家具多）用 0.5 米格，只在同一层楼板上搜
function navCellSize(fy) { return fy < 1 ? NAV_CELL : 0.5; }
function navFloorAt(x, z, fy) { return Math.abs(getGroundHeight(x, z, fy + 0.35) - fy) < 0.3; }

// 这个格子能不能站人（结果缓存；场景碰撞体变化时整体清空）。fy = 所在楼层的地板高度（地面层传 0，按地形高度算）
function navCellFree(ix, iz, fy = 0) {
  if (navCacheColliders !== wallColliders2D.length) { navLevelCaches.clear(); navCacheColliders = wallColliders2D.length; }
  const lv = fy < 1 ? 0 : Math.round(fy * 10);
  let cache = navLevelCaches.get(lv);
  if (!cache) { cache = new Map(); navLevelCaches.set(lv, cache); }
  const k = gridKey(ix, iz);
  let v = cache.get(k);
  if (v === undefined) {
    const c = navCellSize(fy), x = ix * c, z = iz * c;
    let free;
    if (fy < 1) {
      free = Math.abs(x) < MAP_LIMIT - 2 && Math.abs(z) < MAP_LIMIT - 2 && !isPointBlocked2D(x, z, NAV_RADIUS, terrainH(x, z));
      // 河面只能走桥
      if (free && Math.abs(z - RIVER_Z) < RIVER_HALF + 1 && !BRIDGE_XS.some(bx => Math.abs(x - bx) < 8.5)) free = false;
    } else {
      // 楼上：脚下要有这一层的楼板（不能走进楼梯井 / 走出窗外），身边不碰墙和家具
      free = navFloorAt(x, z, fy) && !isPointBlocked2D(x, z, 0.44, fy);
    }
    v = free ? 1 : 0;
    cache.set(k, v);
  }
  return v === 1;
}

// 两点之间能不能直接走过去（每 0.4 米采样一次：所在格子能站，而且这个点本身真的不碰墙——
// 只看格子中心的话，斜线会擦着门框 / 墙角过去，AI 就卡在门边）
function navLineClear(ax, az, bx, bz, fy = 0) {
  const c = navCellSize(fy);
  const d = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(d / (fy < 1 ? 0.4 : 0.25)));
  for (let i = 1; i <= n; i++) {
    const x = ax + (bx - ax) * i / n, z = az + (bz - az) * i / n;
    if (!navCellFree(Math.round(x / c), Math.round(z / c), fy) || isPointBlocked2D(x, z, 0.46, fy < 1 ? terrainH(x, z) : fy)) return false;
    if (fy >= 1 && !navFloorAt(x, z, fy)) return false;
  }
  return true;
}

// 最近的可站格子（目标贴着墙 / 在家具旁边时用）
function navNearestFree(ix, iz, maxR, fy = 0) {
  if (navCellFree(ix, iz, fy)) return [ix, iz];
  for (let r = 1; r <= maxR; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        if (navCellFree(ix + dx, iz + dz, fy)) return [ix + dx, iz + dz];
      }
    }
  }
  return null;
}

// A*：返回拉直后的路点数组 [{x, z}, ...]（最后一个是终点或搜索区域边上朝向终点的点），走不通返回 null
function findNavPath(sx, sz, gx, gz, fy = 0) {
  const c = navCellSize(fy), margin = fy < 1 ? 15 : 6;
  let tx = gx, tz = gz;
  const dd = Math.hypot(gx - sx, gz - sz), maxD = NAV_MAX_SPAN - 30;
  if (dd > maxD) { tx = sx + (gx - sx) / dd * maxD; tz = sz + (gz - sz) / dd * maxD; }
  const x0 = Math.floor((Math.min(sx, tx) - margin) / c), x1 = Math.ceil((Math.max(sx, tx) + margin) / c);
  const z0 = Math.floor((Math.min(sz, tz) - margin) / c), z1 = Math.ceil((Math.max(sz, tz) + margin) / c);
  const W = x1 - x0 + 1, H = z1 - z0 + 1, N = W * H;
  const s = navNearestFree(Math.round(sx / c), Math.round(sz / c), fy < 1 ? 3 : 4, fy);
  const g = navNearestFree(Math.round(tx / c), Math.round(tz / c), fy < 1 ? 4 : 5, fy);
  if (!s || !g) return null;
  const inBox = (ix, iz) => ix >= x0 && ix <= x1 && iz >= z0 && iz <= z1;
  if (!inBox(s[0], s[1]) || !inBox(g[0], g[1])) return null;
  const idxOf = (ix, iz) => (iz - z0) * W + (ix - x0);
  const start = idxOf(s[0], s[1]), goal = idxOf(g[0], g[1]);
  const gScore = new Float32Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  // 二叉堆（按 f 值）
  const heapI = [], heapF = [];
  const push = (i, f) => {
    let k = heapI.length; heapI.push(i); heapF.push(f);
    while (k > 0) { const p = (k - 1) >> 1; if (heapF[p] <= f) break; heapI[k] = heapI[p]; heapF[k] = heapF[p]; k = p; }
    heapI[k] = i; heapF[k] = f;
  };
  const pop = () => {
    const top = heapI[0], li = heapI.pop(), lf = heapF.pop();
    if (heapI.length) {
      let k = 0;
      for (;;) {
        let c = 2 * k + 1;
        if (c >= heapI.length) break;
        if (c + 1 < heapI.length && heapF[c + 1] < heapF[c]) c++;
        if (heapF[c] >= lf) break;
        heapI[k] = heapI[c]; heapF[k] = heapF[c]; k = c;
      }
      heapI[k] = li; heapF[k] = lf;
    }
    return top;
  };
  const gx0 = g[0], gz0 = g[1];
  const hOf = (ix, iz) => { const ax = Math.abs(ix - gx0), az = Math.abs(iz - gz0); return (ax + az + (1.4142 - 2) * Math.min(ax, az)) * 1.15; };
  gScore[start] = 0;
  push(start, hOf(s[0], s[1]));
  const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];
  let expanded = 0, found = false;
  while (heapI.length && expanded < NAV_MAX_EXPAND) {
    const cur = pop();
    if (closed[cur]) continue;
    if (cur === goal) { found = true; break; }
    closed[cur] = 1;
    expanded++;
    const cx = cur % W + x0, cz = ((cur / W) | 0) + z0;
    for (let d = 0; d < 8; d++) {
      const nx = cx + DIRS[d][0], nz = cz + DIRS[d][1];
      if (!inBox(nx, nz)) continue;
      const ni = idxOf(nx, nz);
      if (closed[ni] || !navCellFree(nx, nz, fy)) continue;
      // 斜着走不能切墙角
      if (DIRS[d][2] > 1 && (!navCellFree(cx + DIRS[d][0], cz, fy) || !navCellFree(cx, cz + DIRS[d][1], fy))) continue;
      const ng = gScore[cur] + DIRS[d][2];
      if (ng < gScore[ni]) { gScore[ni] = ng; came[ni] = cur; push(ni, ng + hOf(nx, nz)); }
    }
  }
  if (!found) return null;
  // 回溯路径
  const cells = [];
  for (let i = goal; i !== -1; i = came[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map(i => ({ x: (i % W + x0) * c, z: (((i / W) | 0) + z0) * c }));
  // 拉直：从当前点出发，能直接走到的最远路点之间的格子全部省掉
  const out = [];
  let ax = sx, az = sz, k = 0;
  while (k < pts.length - 1) {
    let far = k + 1;
    for (let j = pts.length - 1; j > k + 1; j--) {
      if (navLineClear(ax, az, pts[j].x, pts[j].z, fy)) { far = j; break; }
    }
    out.push(pts[far]);
    ax = pts[far].x; az = pts[far].z;
    k = far;
  }
  if (!out.length) out.push(pts[pts.length - 1]);
  return out;
}

// steerAndMoveAI 每帧调用：决定这一帧朝哪走（有绕行路线就朝下一个路点，否则交给原来的门 / 楼梯 / 过桥逻辑）
// · 在地面层、目标也在地面层且不用过河时，绕行路线直接算到最终目标（A* 自己会找门进出房子）
// · 每秒探测一次：直线被房子挡住就提前算路线；或者朝目标 1.6 秒没有接近 / 卡住了也会重算
const _navSteer = new THREE.Vector3();
function navCrossesRiver(az, bz) {
  const nearSide = RIVER_Z - RIVER_HALF - 5, farSide = RIVER_Z + RIVER_HALF + 5;
  return (az < nearSide && bz > farSide) || (az > farSide && bz < nearSide);
}
function botNavSteerPoint(bot, subGoal, finalGoal, speed, dt, allowPlan) {
  const pos = bot.group.position;
  bot.navCooldown = Math.max(0, (bot.navCooldown || 0) - dt);
  // 楼上：只在同一层楼板上规划（去楼梯口 / 去本层的东西）；正在楼梯上、或者要去的点在别的楼层就交给楼梯逻辑
  // 楼上 / 地面层按离地高度判断（山坡上也是地面层）
  const upper = heightAboveTerrain(pos.x, pos.y, pos.z) >= 1;
  const goalUp = heightAboveTerrain(finalGoal.x, finalGoal.y || 0, finalGoal.z) >= 1;
  const groundGoal = !upper && !goalUp && !navCrossesRiver(pos.z, finalGoal.z);
  const target = groundGoal ? finalGoal : subGoal;
  let fy = 0;
  if (upper) {
    const b = getBuildingContainingPoint(pos.x, pos.z, -0.3);
    fy = getGroundHeight(pos.x, pos.z, pos.y + 0.1);
    if (!b || flightAt(b, pos) >= 0 || Math.abs((target.y || 0) - pos.y) > 0.6) { bot.navPath = null; bot.navTrack = null; return subGoal; }
  }
  if (!allowPlan || (!upper && heightAboveTerrain(target.x, target.y || 0, target.z) >= 1)) { bot.navPath = null; bot.navTrack = null; return subGoal; }
  // 目标挪远了：旧路线作废
  if (bot.navPath && Math.hypot(bot.navPathGoal.x - target.x, bot.navPathGoal.z - target.z) > 5) bot.navPath = null;
  // 进度监测（盯着最终目标，而不是来回切换的门口子目标）
  const d = Math.hypot(target.x - pos.x, target.z - pos.z);
  const tr = bot.navTrack;
  if (!tr || Math.hypot(tr.gx - target.x, tr.gz - target.z) > 5) {
    bot.navTrack = { gx: target.x, gz: target.z, best: d, t: 0 };
  } else if (d < tr.best - 1.2) {
    tr.best = d; tr.t = 0;
  } else if (speed > 0.5) {
    tr.t += dt;
  }
  let want = bot.navWant || bot.navTrack.t > 1.6;
  bot.navProbe = (bot.navProbe || 0) - dt;
  if (!bot.navPath && !want && bot.navProbe <= 0) {
    bot.navProbe = 1.0 + Math.random() * 0.3;
    if (d > (upper ? 1.5 : 6) && d < 110) {
      // 直线（不含终点那一小段）被挡住就提前规划
      const k = (d - 0.8) / d;
      if (!navLineClear(pos.x, pos.z, pos.x + (target.x - pos.x) * k, pos.z + (target.z - pos.z) * k, fy)) want = true;
    }
  }
  if (want && !bot.navPath && speed > 0.5 && d > (upper ? 1.2 : 2.5) && bot.navCooldown <= 0 && navSearchesThisFrame < 1) {
    navSearchesThisFrame++;
    bot.navWant = false;
    const path = findNavPath(pos.x, pos.z, target.x, target.z, fy);
    if (path) {
      bot.navPath = path; bot.navIdx = 0;
      bot.navPathGoal = { x: target.x, z: target.z };
      bot.navTrack.t = 0; bot.navTrack.best = d;
      bot.navCooldown = 0.6; // 两次重算之间至少隔 0.6 秒
    } else {
      bot.navCooldown = 3;
      bot.navUnreachable = true; // 由 AI 大脑决定是否放弃这个目标
    }
  }
  if (bot.navPath) {
    let wp = bot.navPath[bot.navIdx];
    const reach = upper ? 0.5 : 1.1;
    while (wp && Math.hypot(wp.x - pos.x, wp.z - pos.z) < reach) { bot.navIdx++; wp = bot.navPath[bot.navIdx]; }
    // 被挤离了路线、下一个路点隔着墙了：这条路线作废，马上重算
    bot.navCheck = (bot.navCheck || 0) - dt;
    if (wp && bot.navCheck <= 0) {
      bot.navCheck = 0.5;
      if (!navLineClear(pos.x, pos.z, wp.x, wp.z, fy)) { bot.navPath = null; bot.navWant = true; bot.navCooldown = 0; wp = null; return groundGoal ? finalGoal : subGoal; }
    }
    // 被挤离路线太远就重新算
    if (wp && Math.hypot(wp.x - pos.x, wp.z - pos.z) > 40) { bot.navPath = null; wp = null; }
    if (!wp) { bot.navPath = null; return groundGoal ? finalGoal : subGoal; }
    return _navSteer.set(wp.x, pos.y, wp.z);
  }
  return subGoal;
}
