// nature.js：树林、树木、岩石、草垛、灌木，最后统一合批上传
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ---------------------------------------------------------------------------
// 3.15 植被与岩石：成片树林 + 零散树木、岩石、草垛、灌木
// ---------------------------------------------------------------------------
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3525 });
const leafMat = new THREE.MeshLambertMaterial({ color: 0x2d4c2b });
const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b6e70 });

// 树冠：低多边形硬边造型（松树叠层锥 / 阔叶树团簇），每棵树色调与大小随机，纯视觉不影响碰撞
const FOLIAGE_COLORS = [0x2d4c2b, 0x355a2c, 0x2b5034, 0x41602e, 0x3a5526];
const foliageConeGeo = (() => { const g = new THREE.ConeGeometry(1, 1, 7).toNonIndexed(); g.computeVertexNormals(); return g; })();
const foliageBlobGeo = new THREE.IcosahedronGeometry(1, 0);
const TRUNK_GEO = new THREE.CylinderGeometry(0.4, 0.5, 3.6, 7);
TRUNK_GEO.userData.shared = true;
const ROCK_GEO = new THREE.DodecahedronGeometry(1.6, 0);
const _foliageTmp = new THREE.Mesh(foliageConeGeo, leafMat);
function addTreeFoliageToBatch(tx, tz) {
  const col = FOLIAGE_COLORS[Math.floor(Math.random() * FOLIAGE_COLORS.length)];
  const s = 0.85 + Math.random() * 0.4;
  const shadeFn = p => 0.68 + 0.32 * smoothstep(2.6, 8.5, p.y);
  const put = (geo, x, y, z, sx, sy, sz, rotY) => {
    _foliageTmp.geometry = geo;
    _foliageTmp.position.set(x, y, z);
    _foliageTmp.scale.set(sx, sy, sz);
    _foliageTmp.rotation.set(0, rotY, 0);
    addToStaticBatch(_foliageTmp, "leaf", col, { ao: false, shadeFn });
  };
  if (Math.random() < 0.55) {
    put(foliageConeGeo, tx, 3.9 * s, tz, 2.7 * s, 3.3 * s, 2.7 * s, Math.random() * 6);
    put(foliageConeGeo, tx, 5.3 * s, tz, 2.1 * s, 2.9 * s, 2.1 * s, Math.random() * 6);
    put(foliageConeGeo, tx, 6.7 * s, tz, 1.4 * s, 2.5 * s, 1.4 * s, Math.random() * 6);
  } else {
    put(foliageBlobGeo, tx, 4.6 * s, tz, 2.1 * s, 1.8 * s, 2.1 * s, Math.random() * 6);
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2;
      put(foliageBlobGeo, tx + Math.cos(a) * 1.2 * s, (4.2 + Math.random() * 1.4) * s, tz + Math.sin(a) * 1.2 * s,
        1.5 * s, 1.3 * s, 1.5 * s, Math.random() * 6);
    }
  }
}

// 植被摆放点是否合适：不出界、不在河里/路上、不压建筑
function canPlaceProp(x, z, clearance) {
  if (Math.abs(x) > MAP_LIMIT - 30 || Math.abs(z) > MAP_LIMIT - 30) return false;
  if (Math.abs(z - RIVER_Z) < RIVER_HALF + clearance + 2) return false;
  if (roadEdgeDistance(x, z, clearance + 4) < clearance) return false;
  return !isRectReserved(x, z, x, z, clearance + 1);
}

function plantTree(tx, tz) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(TRUNK_GEO, trunkMat);
  trunk.position.y = 1.8;
  tree.add(trunk);
  tree.position.set(tx, 0, tz);
  tree.updateMatrixWorld(true);
  addToStaticBatch(trunk, "bark", 0x5c4331, { ao: false, shadeFn: p => 0.75 + 0.25 * Math.min(1, p.y / 3) });
  addTreeFoliageToBatch(tx, tz);
  shootableEnvironment.push(trunk);
  wallMeshesForLOS.push(trunk);
  addCollider(tx - 0.45, tx + 0.45, tz - 0.45, tz + 0.45, 0, 3.6);
}

// 成片树林（记录位置，用于地图上画出林区）
const forestPatches = [];
for (let f = 0, made = 0; f < 60 && made < 13; f++) {
  const fx = (Math.random() - 0.5) * (MAP_SIZE - 400), fz = (Math.random() - 0.5) * (MAP_SIZE - 400);
  if (POIS.some(p => Math.hypot(p.x - fx, p.z - fz) < p.r + 120)) continue;
  made++;
  const fr = 70 + Math.random() * 90, n = 30 + Math.floor(Math.random() * 30);
  forestPatches.push({ x: fx, z: fz, r: fr });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * fr;
    const tx = fx + Math.cos(a) * rr, tz = fz + Math.sin(a) * rr;
    if (canPlaceProp(tx, tz, 3)) plantTree(tx, tz);
  }
}
// 零散树木
for (let i = 0; i < 300; i++) {
  const tx = (Math.random() - 0.5) * (MAP_SIZE - 120), tz = (Math.random() - 0.5) * (MAP_SIZE - 120);
  if (canPlaceProp(tx, tz, 3)) plantTree(tx, tz);
}
// 岩石与草垛（遗迹附近多放碎石）
for (let i = 0; i < 300; i++) {
  let rx, rz;
  if (i < 30) {
    const a = Math.random() * Math.PI * 2, rr = 40 + Math.random() * 70;
    rx = POI_BY_KEY.ruins.x + Math.cos(a) * rr; rz = POI_BY_KEY.ruins.z + Math.sin(a) * rr;
  } else {
    rx = (Math.random() - 0.5) * (MAP_SIZE - 160); rz = (Math.random() - 0.5) * (MAP_SIZE - 160);
  }
  if (!canPlaceProp(rx, rz, 4)) continue;
  if (Math.random() < 0.68) {
    const rock = new THREE.Mesh(ROCK_GEO, rockMat);
    rock.position.set(rx, 0.9, rz);
    rock.scale.set(1.2, 0.85, 1.1);
    addToStaticBatch(rock, "rock", Math.random() < 0.5 ? 0x7a7d7f : 0x6b6e70, { ao: false, shadeFn: p => 0.7 + 0.3 * Math.min(1, p.y / 1.4) });
    shootableEnvironment.push(rock);
    wallMeshesForLOS.push(rock);
    addCollider(rx - 1.4, rx + 1.4, rz - 1.3, rz + 1.3, 0, 1.8);
  } else {
    const hay = new THREE.Mesh(HAY_GEO, PROXY_MAT);
    hay.rotation.z = Math.PI / 2;
    hay.position.set(rx, 0.75, rz);
    addToStaticBatch(hay, "bark", 0xd4ae4a, { ao: false, shadeFn: p => 0.72 + 0.28 * Math.min(1, p.y / 1.5) });
    shootableEnvironment.push(hay);
    wallMeshesForLOS.push(hay);
    addCollider(rx - 1.1, rx + 1.1, rz - 1.1, rz + 1.1, 0, 1.5);
  }
}

// 装饰灌木（纯视觉，可穿行，和端游草丛一样不挡子弹）
for (let i = 0; i < 760; i++) {
  const bx = (Math.random() - 0.5) * (MAP_SIZE - 80);
  const bz = (Math.random() - 0.5) * (MAP_SIZE - 80);
  if (!canPlaceProp(bx, bz, 1.5)) continue;
  const col = FOLIAGE_COLORS[Math.floor(Math.random() * FOLIAGE_COLORS.length)];
  const s = 0.6 + Math.random() * 0.7;
  for (let k = 0; k < 2; k++) {
    _foliageTmp.geometry = foliageBlobGeo;
    _foliageTmp.position.set(bx + (k - 0.5) * 0.7 * s, 0.35 * s, bz + (Math.random() - 0.5) * 0.6 * s);
    _foliageTmp.scale.set(0.9 * s, 0.65 * s, 0.9 * s);
    _foliageTmp.rotation.set(0, Math.random() * 6, 0);
    addToStaticBatch(_foliageTmp, "leaf", col, { ao: false, shadeFn: p => 0.6 + 0.4 * Math.min(1, p.y / (0.9 * s)) });
  }
}

// 全部静态物体生成完毕 → 一次性合批上传 GPU
flushStaticBatches();
syncColliderGrid();
