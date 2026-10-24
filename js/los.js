// los.js：视线检测与子弹射线检测的空间网格
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// 视线检测空间网格：只对视线线段穿过的格子里的墙体做射线检测
// （检测结果与对全部墙体检测完全一致，但每次只需测试几十个而非两千多个网格）
const LOS_CELL = 8;
const losGrid = new Map();
let losGridCount = 0;
let losStamp = 0;
const losCandidates = [];
const _losBox = new THREE.Box3();

function syncLOSGrid() {
  while (losGridCount < wallMeshesForLOS.length) {
    const m = wallMeshesForLOS[losGridCount++];
    _losBox.setFromObject(m);
    const x0 = Math.floor((_losBox.min.x - 0.05) / LOS_CELL), x1 = Math.floor((_losBox.max.x + 0.05) / LOS_CELL);
    const z0 = Math.floor((_losBox.min.z - 0.05) / LOS_CELL), z1 = Math.floor((_losBox.max.z + 0.05) / LOS_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = gridKey(ix, iz);
        let arr = losGrid.get(k);
        if (!arr) { arr = []; losGrid.set(k, arr); }
        arr.push(m);
      }
    }
  }
}

function addLOSCell(ix, iz) {
  const arr = losGrid.get(gridKey(ix, iz));
  if (!arr) return;
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    if (m.__losStamp !== losStamp) { m.__losStamp = losStamp; losCandidates.push(m); }
  }
}

// 2D 网格步进（DDA）收集线段经过的所有格子
function gatherLOSCandidates(x0, z0, x1, z1) {
  losStamp++;
  losCandidates.length = 0;
  let cx = Math.floor(x0 / LOS_CELL), cz = Math.floor(z0 / LOS_CELL);
  const dx = x1 - x0, dz = z1 - z0;
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(LOS_CELL / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(LOS_CELL / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * LOS_CELL - x0 : x0 - cx * LOS_CELL) / Math.abs(dx) : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * LOS_CELL - z0 : z0 - cz * LOS_CELL) / Math.abs(dz) : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    addLOSCell(cx, cz);
    if (tMaxX < tMaxZ) {
      if (tMaxX > 1) break;
      tMaxX += tDeltaX; cx += stepX;
    } else {
      if (tMaxZ > 1) break;
      tMaxZ += tDeltaZ; cz += stepZ;
    }
  }
}

const losRaycaster = new THREE.Raycaster();
// 任意两点之间是否没有墙体/楼板阻挡（多层楼时楼板也会挡视线）
function losSegmentClear(ax, ay, az, bx, by, bz) {
  if (losGridCount !== wallMeshesForLOS.length) syncLOSGrid();
  const origin = new THREE.Vector3(ax, ay, az);
  const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const dist = dir.length();
  if (dist < 1e-4) return true;
  dir.normalize();
  gatherLOSCandidates(ax, az, bx, bz);
  losRaycaster.set(origin, dir);
  losRaycaster.far = dist;
  return losRaycaster.intersectObjects(losCandidates, false).length === 0;
}
// 烟雾弹的烟团会挡住 AI 视线
function smokeBlocksSegment(ax, ay, az, bx, by, bz) {
  for (let i = 0; i < smokeClouds.length; i++) {
    const c = smokeClouds[i];
    if (c.r < 1.5) continue;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L2 = dx * dx + dy * dy + dz * dz;
    let t = L2 > 0 ? ((c.x - ax) * dx + (c.y - ay) * dy + (c.z - az) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + dx * t - c.x, qy = ay + dy * t - c.y, qz = az + dz * t - c.z;
    if (qx * qx + qy * qy * 2.2 + qz * qz < (c.r * 0.85) * (c.r * 0.85)) return true;
  }
  return false;
}
// eyeA / eyeB：在两个位置的 y 上再加多少作为视线高度（AI 传入的是脚底位置，玩家传入的是眼睛位置）
function hasLineOfSight(posA, posB, eyeA = 1.5, eyeB = 1.5) {
  const ay = posA.y + eyeA, by = posB.y + eyeB;
  if (smokeClouds.length && smokeBlocksSegment(posA.x, ay, posA.z, posB.x, by, posB.z)) return false;
  return losSegmentClear(posA.x, ay, posA.z, posB.x, by, posB.z);
}

// 子弹射线检测空间网格：只测试弹道经过的格子里的物体（结果与全量检测一致；大地图上上万个物体时依然流畅）
const SHOOT_CELL = 8;
const shootGrid = new Map();
let shootGridCount = 1; // 0 号是覆盖全图的地面代理，单独处理
let shootStamp = 0;
const shootCandidates = [];
function syncShootGrid() {
  while (shootGridCount < shootableEnvironment.length) {
    const m = shootableEnvironment[shootGridCount++];
    _losBox.setFromObject(m);
    const x0 = Math.floor((_losBox.min.x - 0.05) / SHOOT_CELL), x1 = Math.floor((_losBox.max.x + 0.05) / SHOOT_CELL);
    const z0 = Math.floor((_losBox.min.z - 0.05) / SHOOT_CELL), z1 = Math.floor((_losBox.max.z + 0.05) / SHOOT_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = gridKey(ix, iz);
        let arr = shootGrid.get(k);
        if (!arr) { arr = []; shootGrid.set(k, arr); }
        arr.push(m);
      }
    }
  }
}
// includeAI = false：只要场景物体（子弹弹道单独处理 AI 命中盒）
function gatherShootCandidates(ray, far, includeAI = true) {
  if (shootGridCount !== shootableEnvironment.length) syncShootGrid();
  shootStamp++;
  shootCandidates.length = 0;
  shootCandidates.push(shootableEnvironment[0]);
  if (includeAI) for (let i = 0; i < aiHitboxes.length; i++) shootCandidates.push(aiHitboxes[i]);
  const x0 = ray.origin.x, z0 = ray.origin.z;
  const dx = ray.direction.x * far, dz = ray.direction.z * far;
  let cx = Math.floor(x0 / SHOOT_CELL), cz = Math.floor(z0 / SHOOT_CELL);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(SHOOT_CELL / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(SHOOT_CELL / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * SHOOT_CELL - x0 : x0 - cx * SHOOT_CELL) / Math.abs(dx) : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * SHOOT_CELL - z0 : z0 - cz * SHOOT_CELL) / Math.abs(dz) : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    const arr = shootGrid.get(gridKey(cx, cz));
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (m.__shootStamp !== shootStamp) { m.__shootStamp = shootStamp; shootCandidates.push(m); }
      }
    }
    if (tMaxX < tMaxZ) {
      if (tMaxX > 1) break;
      tMaxX += tDeltaX; cx += stepX;
    } else {
      if (tMaxZ > 1) break;
      tMaxZ += tDeltaZ; cz += stepZ;
    }
  }
  return shootCandidates;
}
