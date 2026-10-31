// nature.js：树林、树木、岩石、草垛、灌木，最后统一合批上传
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ---------------------------------------------------------------------------
// 3.15 植被与岩石：成片树林 + 零散树木、岩石、草垛、灌木
// ---------------------------------------------------------------------------
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3525 });
const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b6e70 });

const TRUNK_GEO = new THREE.CylinderGeometry(0.4, 0.5, 3.6, 7);
TRUNK_GEO.userData.shared = true;
const ROCK_GEO = new THREE.DodecahedronGeometry(1.6, 0);

// ---------------------------------------------------------------------------
// 写实树木：Poly Haven（CC0）的真实树模型（冷杉 + 阔叶树）精简成三档真实几何 —— 每片叶子 / 每簇针叶都是模型里
// 原本的形状（按轮廓重新三角化），树干枝杈是模型的减面版。离得越远用越简的一档（叶片更少、更大），
// 但从头到尾都是立体的几何，不用交叉贴图。全部用实例化绘制（同一种树同一档一次绘制），只画视野里的
// ---------------------------------------------------------------------------
const TREE_TYPES = [
  { s0: 0.95, s1: 1.35, trunkR: 0.3, model: "fir", modelScale: 1 },           // 冷杉（8.7 米）
  { s0: 1.0, s1: 1.4, trunkR: 0.3, model: "fir", modelScale: 7.68 / 8.74 },   // 矮一点的冷杉
  { s0: 1.9, s1: 2.5, trunkR: 0.45, model: "broad", modelScale: 1 }            // 阔叶树（模型原高 3.4 米）
];
// 各档的距离（米）：[精细档, 简化档, 最简档]，按画质档位
const TREE_LOD_BY_TIER = { low: [35, 200, 650], mid: [55, 300, 950], high: [75, 400, 950] };
const BUSH_LOD_BY_TIER = { low: [30, 150], mid: [55, 240], high: [70, 300] };

// ---- 真实几何：解码 assets_trees.js 里量化过的网格 ----
function decodeTreePart(part) {
  const m = part.m, bin = atob(part.d), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  const buf = u8.buffer, nv = m.nv;
  let off = 0;
  const q = new Uint16Array(buf, off, nv * 3); off += nv * 6;
  const n8 = new Int8Array(buf, off, nv * 3); off += nv * 3; off += off % 2;
  const uq = new Uint16Array(buf, off, nv * 2); off += nv * 4;
  const ao = new Uint8Array(buf, off, nv); off += nv; off += (4 - off % 4) % 4;
  const idx = m.big ? new Uint32Array(buf, off, m.ni) : new Uint16Array(buf, off, m.ni);
  const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    for (let k = 0; k < 3; k++) pos[i * 3 + k] = m.lo[k] + q[i * 3 + k] * m.sc[k];
    uv[i * 2] = m.uv[0] + uq[i * 2] / 65535 * (m.uv[1] - m.uv[0]);
    uv[i * 2 + 1] = m.uv[0] + uq[i * 2 + 1] / 65535 * (m.uv[1] - m.uv[0]);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao[i] / 255;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(new Int8Array(n8), 3, true));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(m.big ? new Uint32Array(idx) : new Uint16Array(idx), 1));
  g.computeBoundingSphere();
  return g;
}
const treeTexLoader = new THREE.TextureLoader();
function treeTexture(key, repeat) {
  const t = treeTexLoader.load(TREE_TEX[key]);
  t.anisotropy = MAX_ANISO;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
const treeWind = { time: { value: 0 } };
// 叶片材质：正反两面按正面受光（叶子薄，背面也透光，不该一面亮一面黑）；叶片随风轻轻摆，越靠外、越高摆得越多
function makeLeafMaterial(tex, swayH0) {
  const m = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.time = treeWind.time;
    sh.vertexShader = "uniform float time;\n" + sh.vertexShader.replace("#include <begin_vertex>", `
      vec3 transformed = vec3(position);
      #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float h = max(0.0, position.y - ${swayH0.toFixed(2)});
        float ph = ip.x * 0.21 + ip.z * 0.17;
        transformed.x += sin(time * 1.6 + ph + position.z * 0.8) * 0.035 * h;
        transformed.z += sin(time * 1.3 + ph * 1.3 + position.x * 0.8) * 0.03 * h;
        transformed.y += sin(time * 2.4 + ph + position.x * 2.0) * 0.012 * h;
      #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace("( gl_FrontFacing ) ? vLightFront : vLightBack", "vLightFront")
      .replace("( gl_FrontFacing ) ? vIndirectFront : vIndirectBack", "vIndirectFront");
  };
  return m;
}
// 树种 → 各档模型的网格与材质（第一次用到时才解码）
const TREE_SPECIES = {};
function treeSpecies(name) {
  if (TREE_SPECIES[name]) return TREE_SPECIES[name];
  if (typeof TREE_MODELS === "undefined") return null;
  const sp = { lods: [] };
  if (name === "broad") {
    const leaf = makeLeafMaterial(treeTexture("isLeaf"), 1.3), trunk = new THREE.MeshLambertMaterial({ map: treeTexture("isTrunk"), vertexColors: true });
    const branch = new THREE.MeshLambertMaterial({ map: treeTexture("isBranch", true), vertexColors: true });
    for (const k of ["broad0", "broad1", "broad2"]) sp.lods.push([[decodeTreePart(TREE_MODELS[k].leaf), leaf], [decodeTreePart(TREE_MODELS[k].trunk), trunk], [decodeTreePart(TREE_MODELS[k].branch), branch]]);
  } else if (name === "fir") {
    const leaf = makeLeafMaterial(treeTexture("firTwig"), 0.5), branch = new THREE.MeshLambertMaterial({ map: treeTexture("firBranch", true), vertexColors: true });
    for (const k of ["fir0", "fir1", "fir2"]) sp.lods.push([[decodeTreePart(TREE_MODELS[k].leaf), leaf], [decodeTreePart(TREE_MODELS[k].trunk), branch]]);
  } else if (name === "bush") {
    // 灌木：阔叶树的树冠叶片，往下挪到贴地（不要树干）
    const leaf = makeLeafMaterial(treeTexture("isLeaf"), 1.2);
    for (const k of ["bush0", "bush1"]) {
      const g = decodeTreePart(TREE_MODELS[k].leaf);
      g.translate(0, -1.15, 0);
      sp.lods.push([[g, leaf]]);
    }
  }
  TREE_SPECIES[name] = sp;
  return sp;
}

// 每棵树 / 每丛灌木的记录（摆放时登记，实例矩阵预先算好）
const treeList = [];
const _trM = new THREE.Matrix4(), _trQ = new THREE.Quaternion(), _trP = new THREE.Vector3(), _trS = new THREE.Vector3(), _trY = new THREE.Vector3(0, 1, 0);
function registerTree(kind, type, x, gy, z, scale, rot, tint) {
  const t = { kind, type, x, y: gy, z, tint, model: new Float32Array(16) };
  _trQ.setFromAxisAngle(_trY, rot);
  const ms = kind === "bush" ? scale * 0.42 : scale * type.modelScale;
  _trS.setScalar(ms); _trP.set(x, gy - (kind === "bush" ? 0.05 : 0.12), z);
  _trM.compose(_trP, _trQ, _trS); _trM.toArray(t.model);
  t.r = kind === "bush" ? 2 : 6 * scale; // 视锥剔除用的半径
  t.sp = kind === "bush" ? "bush" : type.model;
  treeList.push(t);
  return t;
}

// ---- 实例化绘制：每帧按离镜头远近分档，再做视锥剔除 ----
const treeDraw = { groups: null };
function ensureTreeDraw() {
  if (treeDraw.groups) return;
  const counts = {};
  treeList.forEach(t => { counts[t.sp] = (counts[t.sp] || 0) + 1; });
  const mkInst = (geo, mat, cap, shadow) => {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, cap));
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, cap) * 3), 3);
    m.frustumCulled = false; // 按实例自己剔除
    m.castShadow = shadow; m.receiveShadow = true;
    m.count = 0;
    scene.add(m);
    return m;
  };
  treeDraw.groups = {};
  for (const name of ["broad", "fir", "bush"]) {
    const sp = treeSpecies(name);
    if (!sp || !counts[name]) continue;
    // 精细档投影子（阴影只画玩家附近几十米）；远的几档不投（实例化网格整批画进阴影图，太浪费）
    treeDraw.groups[name] = sp.lods.map((parts, li) => ({ n: 0, meshes: parts.map(([g, mat]) => mkInst(g, mat, counts[name], li === 0)) }));
  }
}
const _trFrustum = new THREE.Frustum(), _trPV = new THREE.Matrix4(), _trSph = new THREE.Sphere(), _trCam = new THREE.Vector3();
function updateTrees(elapsed) {
  if (!treeList.length) return;
  ensureTreeDraw();
  treeWind.time.value = elapsed;
  camera.updateMatrixWorld();
  camera.getWorldPosition(_trCam);
  _trPV.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _trFrustum.setFromProjectionMatrix(_trPV);
  const cx = _trCam.x, cz = _trCam.z;
  const TL = TREE_LOD_BY_TIER[quality.tier] || TREE_LOD_BY_TIER.mid, BL = BUSH_LOD_BY_TIER[quality.tier] || BUSH_LOD_BY_TIER.mid;
  const G = treeDraw.groups;
  for (const name in G) for (const g of G[name]) g.n = 0;
  for (let i = 0; i < treeList.length; i++) {
    const t = treeList[i], lods = G[t.sp];
    if (!lods) continue;
    const dx = t.x - cx, dz = t.z - cz, d = Math.sqrt(dx * dx + dz * dz);
    const L = t.sp === "bush" ? BL : TL;
    let li = 0;
    while (li < L.length && d > L[li]) li++;
    if (li >= L.length || li >= lods.length) continue; // 太远：不画
    _trSph.center.set(t.x, t.y + t.r * 0.6, t.z); _trSph.radius = t.r;
    if (!_trFrustum.intersectsSphere(_trSph)) continue;
    const g = lods[li], k = g.n++;
    for (const m of g.meshes) {
      m.instanceMatrix.array.set(t.model, k * 16);
      m.instanceColor.setXYZ(k, t.tint[0], t.tint[1], t.tint[2]);
    }
  }
  for (const name in G) {
    for (const g of G[name]) {
      for (const m of g.meshes) {
        m.count = g.n;
        m.instanceMatrix.needsUpdate = true;
        m.instanceColor.needsUpdate = true;
      }
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
// 物体贴地摆放的高度：取占地范围内最低的地形高度（坡上的树根、石头底部埋进土里一点，不会悬空）
function propBaseY(x, z, r) {
  return Math.min(terrainH(x - r, z - r), terrainH(x + r, z - r), terrainH(x - r, z + r), terrainH(x + r, z + r), terrainH(x, z));
}

// 树林里冷杉多，零散的树阔叶树多
function plantTree(tx, tz, forest = false) {
  const gy = propBaseY(tx, tz, 0.5);
  const type = TREE_TYPES[Math.random() < (forest ? 0.8 : 0.45) ? (Math.random() < 0.5 ? 0 : 1) : 2];
  const scale = type.s0 + Math.random() * (type.s1 - type.s0);
  const t = 0.88 + Math.random() * 0.2;
  const tint = [t * (0.96 + Math.random() * 0.08), t, t * (0.94 + Math.random() * 0.08)];
  registerTree("tree", type, tx, gy, tz, scale, Math.random() * Math.PI * 2, type.model === "fir" ? tint.map(c => c * 0.78) : tint); // 冷杉针叶贴图偏浅
  // 看不见的树干：挡子弹、挡视线、挡人（和原来一样）
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(TRUNK_GEO, trunkMat);
  trunk.position.y = 1.8;
  trunk.scale.set(type.trunkR / 0.45, 1, type.trunkR / 0.45);
  tree.add(trunk);
  tree.position.set(tx, gy, tz);
  tree.updateMatrixWorld(true);
  shootableEnvironment.push(trunk);
  wallMeshesForLOS.push(trunk);
  addCollider(tx - type.trunkR, tx + type.trunkR, tz - type.trunkR, tz + type.trunkR, gy, gy + 3.6);
}

// 成片树林（记录位置，用于地图上画出林区）
const forestPatches = [];
for (let f = 0, made = 0; f < 60 && made < 13; f++) {
  const fx = (Math.random() - 0.5) * (MAP_SIZE - 400), fz = (Math.random() - 0.5) * (MAP_SIZE - 400);
  if (POIS.some(p => Math.hypot(p.x - fx, p.z - fz) < p.r + 120)) continue;
  made++;
  const fr = 70 + Math.random() * 90, n = 40 + Math.floor(Math.random() * 36);
  forestPatches.push({ x: fx, z: fz, r: fr });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * fr;
    const tx = fx + Math.cos(a) * rr, tz = fz + Math.sin(a) * rr;
    if (canPlaceProp(tx, tz, 3)) plantTree(tx, tz, true);
  }
}
// 零散树木
for (let i = 0; i < 380; i++) {
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
    const gy = propBaseY(rx, rz, 1.3);
    const rock = new THREE.Mesh(ROCK_GEO, rockMat);
    rock.position.set(rx, gy + 0.9, rz);
    rock.scale.set(1.2, 0.85, 1.1);
    addToStaticBatch(rock, "rock", Math.random() < 0.5 ? 0x7a7d7f : 0x6b6e70, { ao: false, shadeFn: p => 0.7 + 0.3 * Math.min(1, (p.y - gy) / 1.4) });
    shootableEnvironment.push(rock);
    wallMeshesForLOS.push(rock);
    addCollider(rx - 1.4, rx + 1.4, rz - 1.3, rz + 1.3, gy, gy + 1.8);
  } else {
    // 草垛只放在平缓的地方（横躺的圆柱放在陡坡上会悬空）
    const gy = propBaseY(rx, rz, 1.1);
    if (terrainMaxDeviation(rx - 1.5, rz - 1.5, rx + 1.5, rz + 1.5, gy) > 0.6) continue;
    const hay = new THREE.Mesh(HAY_GEO, PROXY_MAT);
    hay.rotation.z = Math.PI / 2;
    hay.position.set(rx, gy + 0.75, rz);
    addToStaticBatch(hay, "bark", 0xd4ae4a, { ao: false, shadeFn: p => 0.72 + 0.28 * Math.min(1, (p.y - gy) / 1.5) });
    shootableEnvironment.push(hay);
    wallMeshesForLOS.push(hay);
    addCollider(rx - 1.1, rx + 1.1, rz - 1.1, rz + 1.1, gy, gy + 1.5);
  }
}

// 装饰灌木（纯视觉，可穿行，和端游草丛一样不挡子弹）
for (let i = 0; i < 760; i++) {
  const bx = (Math.random() - 0.5) * (MAP_SIZE - 80);
  const bz = (Math.random() - 0.5) * (MAP_SIZE - 80);
  if (!canPlaceProp(bx, bz, 1.5)) continue;
  const s = 0.55 + Math.random() * 0.4;
  const gy = propBaseY(bx, bz, 0.8 * s);
  const t = 0.85 + Math.random() * 0.2;
  registerTree("bush", null, bx, gy, bz, s, Math.random() * Math.PI * 2, [t, t * (0.98 + Math.random() * 0.06), t * 0.95]);
}

// 地形定型（房子底下都压平了）→ 生成地形网格与贴着地形的路面
buildTerrainMesh();
buildRoadRibbons();
// 全部静态物体生成完毕 → 一次性合批上传 GPU
flushStaticBatches();
flushGlass();
syncColliderGrid();
