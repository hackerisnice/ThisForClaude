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
// 写实树木：Poly Haven（CC0）的真实树模型（两种冷杉 + 一种阔叶树）离线渲染成贴图，
// 游戏里每棵树是两张互相垂直的面片（正反两面，透明处裁掉），顶点数只有低多边形树冠的零头。
// 每张图：贴图集里的 uv 范围 + 这张图对应的真实宽高（米），图的底边中点就是树根
// ---------------------------------------------------------------------------
const TREE_TYPES = [
  { views: [{ u0: 0, v0: 0.5, u1: 0.25, v1: 1, w: 5.2, h: 10.4 }, { u0: 0.25, v0: 0.5, u1: 0.5, v1: 1, w: 5.548, h: 11.096 }], s0: 0.95, s1: 1.35, trunkR: 0.3 },
  { views: [{ u0: 0.5, v0: 0.5, u1: 0.75, v1: 1, w: 4.503, h: 9.006 }, { u0: 0.75, v0: 0.5, u1: 1, v1: 1, w: 4.151, h: 8.302 }], s0: 1.0, s1: 1.4, trunkR: 0.3 },
  { views: [{ u0: 0, v0: 0, u1: 0.5, v1: 0.5, w: 4.412, h: 4.412 }, { u0: 0.5, v0: 0, u1: 1, v1: 0.5, w: 6.042, h: 6.042 }], s0: 1.9, s1: 2.5, trunkR: 0.45 }
];
// 灌木：只取阔叶树树冠那一段贴图（不要树干），贴地放，看起来就是一丛浓密的灌木
const BUSH_TYPE = { views: TREE_TYPES[2].views.map(v => ({ u0: v.u0, u1: v.u1, v0: v.v0 + (v.v1 - v.v0) * 0.3, v1: v.v0 + (v.v1 - v.v0) * 0.8, w: v.w, h: v.h * 0.5 })) };
const treeImpTex = new THREE.Texture();
treeImpTex.anisotropy = MAX_ANISO;
const treeImpMat = new THREE.MeshLambertMaterial({ map: treeImpTex, vertexColors: true, alphaTest: 0.5, visible: false });
// 阴影也按叶子的形状投（透明处不投影）
const treeImpDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: treeImpTex, alphaTest: 0.5 });
const treeImpMeshes = [];
let treeImpReady = false;
// 颜色 JPEG + 透明度 PNG 拼成一张带透明的贴图，再自己做缩小的各级 mipmap：
// 每级都把透明度适当放大，保持“不透明部分”的面积不变 —— 否则远处的树会越缩越稀，最后只剩树干
function loadTreeImpostors() {
  if (typeof TEX_DATA === "undefined" || !TEX_DATA.treeC) return;
  const ci = new Image(), ai = new Image();
  let n = 0;
  const pixels = (img) => {
    const cv = document.createElement("canvas");
    cv.width = img.width; cv.height = img.height;
    const ctx = cv.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return ctx.getImageData(0, 0, img.width, img.height);
  };
  const done = () => {
    if (++n < 2) return;
    const base = pixels(ci), al = pixels(ai).data, d0 = base.data;
    for (let i = 0; i < d0.length; i += 4) d0[i + 3] = al[i];
    let cover = 0;
    for (let i = 3; i < d0.length; i += 4) if (d0[i] >= 128) cover++;
    cover /= d0.length / 4;
    const mips = [base];
    let prev = base;
    for (let S = base.width >> 1; S >= 1; S >>= 1) {
      const out = new ImageData(S, S), d = out.data, p = prev.data, P = prev.width;
      const hist = new Uint32Array(256);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          let r = 0, g = 0, b = 0, a = 0, r0 = 0, g0 = 0, b0 = 0;
          for (let k = 0; k < 4; k++) {
            const i = ((y * 2 + (k >> 1)) * P + x * 2 + (k & 1)) * 4, w = p[i + 3];
            r += p[i] * w; g += p[i + 1] * w; b += p[i + 2] * w; a += w;
            r0 += p[i]; g0 += p[i + 1]; b0 += p[i + 2];
          }
          const o = (y * S + x) * 4;
          // 颜色按透明度加权平均（全透明的地方取普通平均，保留向外扩散过的颜色）
          if (a > 0) { d[o] = r / a; d[o + 1] = g / a; d[o + 2] = b / a; } else { d[o] = r0 / 4; d[o + 1] = g0 / 4; d[o + 2] = b0 / 4; }
          d[o + 3] = a / 4;
          hist[d[o + 3]]++;
        }
      }
      // 找一个放大倍数，让 alpha ≥ 0.5 的像素占比与原图一致
      const need = cover * S * S;
      let cum = 0, aStar = 128;
      for (let a = 255; a >= 1; a--) { cum += hist[a]; if (cum >= need) { aStar = a; break; } }
      const k = Math.min(4, Math.max(1, 128 / aStar));
      if (k > 1.001) for (let i = 3; i < d.length; i += 4) d[i] = Math.min(255, d[i] * k);
      mips.push(out);
      prev = out;
    }
    treeImpTex.image = base;
    treeImpTex.mipmaps = mips;
    treeImpTex.generateMipmaps = false;
    treeImpTex.minFilter = THREE.LinearMipmapLinearFilter;
    treeImpTex.needsUpdate = true;
    treeImpMat.visible = true;
    treeImpReady = true;
    treeImpMeshes.forEach(m => { m.castShadow = true; });
    renderer.shadowMap.needsUpdate = true;
  };
  ci.onload = done; ai.onload = done;
  ci.src = TEX_DATA.treeC; ai.src = TEX_DATA.treeA;
}
loadTreeImpostors();

// 按 250 米方格合并成少数几个网格（和房子 / 岩石的合批一样，远处整块不画）
const treeImpBuckets = new Map();
function addTreeImpostor(tx, gy, tz, type, scale, rot, tint, sink = 0.15) {
  const key = Math.floor(tx / BATCH_CELL) + "|" + Math.floor(tz / BATCH_CELL);
  let b = treeImpBuckets.get(key);
  if (!b) { b = { pos: [], nor: [], uv: [], col: [], idx: [] }; treeImpBuckets.set(key, b); }
  const c = Math.cos(rot), s = Math.sin(rot);
  // 两张面片：第一张沿模型的 X 轴，第二张沿 Z 轴（与烘焙时转 0° / 90° 拍的两张图对应）
  const axes = [[c, -s], [s, c]];
  for (let k = 0; k < 2; k++) {
    const v = type.views[k], [ax, az] = axes[k];
    const hw = v.w * scale / 2, H = v.h * scale, y0 = gy - sink;
    const base = b.pos.length / 3;
    const corners = [[-1, 0], [1, 0], [1, 1], [-1, 1]];
    for (const [sx, sy] of corners) {
      b.pos.push(tx + ax * hw * sx, y0 + H * sy, tz + az * hw * sx);
      // 法线大致朝上、略向外张开：正反两面受光一致，整棵树有一点圆润的明暗
      const nx = ax * sx * 0.35, nz = az * sx * 0.35, ny = 1 + sy * 0.3, nl = Math.hypot(nx, ny, nz);
      b.nor.push(nx / nl, ny / nl, nz / nl);
      b.uv.push(sx < 0 ? v.u0 : v.u1, sy ? v.v1 : v.v0);
      const sh = sy ? 1 : 0.8;
      b.col.push(tint[0] * sh, tint[1] * sh, tint[2] * sh);
    }
    // 正面 + 反面（反面三角形绕序相反，共用顶点）
    b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2);
  }
}
function flushTreeImpostors() {
  treeImpBuckets.forEach(b => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
    g.setIndex(b.idx);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, treeImpMat);
    m.customDepthMaterial = treeImpDepthMat;
    m.castShadow = treeImpReady;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    scene.add(m);
    treeImpMeshes.push(m);
    staticBatchMeshes.push(m);
  });
  treeImpBuckets.clear();
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
  addTreeImpostor(tx, gy, tz, type, scale, Math.random() * Math.PI * 2, [t * (0.96 + Math.random() * 0.08), t, t * (0.94 + Math.random() * 0.08)]);
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
  addTreeImpostor(bx, gy, bz, BUSH_TYPE, s, Math.random() * Math.PI * 2, [t, t * (0.98 + Math.random() * 0.06), t * 0.95], 0.3 * s);
}

// 地形定型（房子底下都压平了）→ 生成地形网格与贴着地形的路面
buildTerrainMesh();
buildRoadRibbons();
// 全部静态物体生成完毕 → 一次性合批上传 GPU
flushStaticBatches();
flushTreeImpostors();
flushGlass();
syncColliderGrid();
