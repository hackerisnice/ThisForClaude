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
// 立体树：叶簇 / 冷杉枝条贴图集 + 树皮
const leafTex = new THREE.Texture();
leafTex.anisotropy = MAX_ANISO;
const leafMat = new THREE.MeshLambertMaterial({ map: leafTex, vertexColors: true, alphaTest: 0.5, visible: false });
const leafDepthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTex, alphaTest: 0.5 });
const treeBarkMat = new THREE.MeshLambertMaterial({ map: barkTex, vertexColors: true });
const treeAlphaMeshes = [];   // 用透明贴图的树网格（贴图解码好之前不投影子）
let treeImpReady = false, leafReady = false;
// 颜色 JPEG + 透明度 PNG 拼成一张带透明的贴图，再自己做缩小的各级 mipmap：
// 每级都把透明度适当放大，保持“不透明部分”的面积不变 —— 否则远处的树会越缩越稀，最后只剩树干
function loadAlphaAtlas(colorUrl, alphaUrl, tex, onReady) {
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
    tex.image = base;
    tex.mipmaps = mips;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.needsUpdate = true;
    onReady();
    treeAlphaMeshes.forEach(m => { m.castShadow = m.material.visible; });
    renderer.shadowMap.needsUpdate = true;
  };
  ci.onload = done; ai.onload = done;
  ci.src = colorUrl; ai.src = alphaUrl;
}
if (typeof TEX_DATA !== "undefined" && TEX_DATA.treeC) loadAlphaAtlas(TEX_DATA.treeC, TEX_DATA.treeA, treeImpTex, () => { treeImpMat.visible = true; treeImpReady = true; });
if (typeof TEX_DATA !== "undefined" && TEX_DATA.leafC) loadAlphaAtlas(TEX_DATA.leafC, TEX_DATA.leafA, leafTex, () => { leafMat.visible = true; leafReady = true; });

// ---------------------------------------------------------------------------
// 树的分块与远近两套模型：按 200 米方格合批。镜头附近的方格画立体树（树干、枝杈是几何体，
// 树冠是几十片朝向各不相同的叶簇 / 冷杉枝条面片，从哪个角度看都有体积）；远处的方格换成两张交叉的贴图树
// ---------------------------------------------------------------------------
const TREE_CELL = 200;
const TREE_LOD_DIST = 280;     // 方格中心离镜头多近画立体树
const treeBuckets = new Map();
const treeCells = [];          // 有树的方格（远处贴图网格 + 近处立体模型按需生成）
const mkGeoArrays = () => ({ pos: [], nor: [], uv: [], col: [], idx: [] });
function treeBucket(x, z) {
  const i = Math.floor(x / TREE_CELL), j = Math.floor(z / TREE_CELL), key = i + "|" + j;
  let b = treeBuckets.get(key);
  if (!b) {
    b = { cx: (i + 0.5) * TREE_CELL, cz: (j + 0.5) * TREE_CELL, imp: mkGeoArrays(), trees: [], far: null, near: null };
    treeBuckets.set(key, b);
    treeCells.push(b);
  }
  return b;
}
// 立体树的随机数：每棵树按自己的位置定种子（离远了释放、走回来重新生成，长得一模一样）
let _treeSeed = 1;
const trnd = () => { _treeSeed = (Math.imul(_treeSeed, 1664525) + 1013904223) >>> 0; return _treeSeed / 4294967296; };
function seedTree(x, z) { _treeSeed = (Math.imul(Math.round(x * 10), 73856093) ^ Math.imul(Math.round(z * 10), 19349663)) >>> 0 || 7; }
// 远处：两张互相垂直的面片（与烘焙时转 0° / 90° 拍的两张图对应）
function addTreeImpostor(tx, gy, tz, type, scale, rot, tint, sink = 0.15) {
  const b = treeBucket(tx, tz).imp;
  const c = Math.cos(rot), s = Math.sin(rot);
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

// 叶簇贴图集里的格子（树冠俯视 / 两个侧视，冷杉枝条 4 种：树干那头在 u0，枝梢在 u1）
const LEAF_CELLS = {
  top: { u0: 0, v0: 0.5, u1: 0.5, v1: 1 },
  side: [{ u0: 0.5, v0: 0.75, u1: 1, v1: 1 }, { u0: 0.5, v0: 0.5, u1: 1, v1: 0.75 }],
  frond: [{ u0: 0, v0: 0.25, u1: 0.5, v1: 0.5 }, { u0: 0.5, v0: 0.25, u1: 1, v1: 0.5 }, { u0: 0, v0: 0, u1: 0.5, v1: 0.25 }, { u0: 0.5, v0: 0, u1: 1, v1: 0.25 }]
};
const _tA = new THREE.Vector3(), _tU = new THREE.Vector3(), _tV = new THREE.Vector3(), _tN = new THREE.Vector3(), _tP = new THREE.Vector3();
// 一张叶片面片：o = 起点（u 方向从 o 出发长 lu；v 方向以 o 为中心宽 2·hv），法线 / 颜色由 shade(p) 给出
function addLeafCard(b, o, u, lu, v, hv, cell, shade, flipV) {
  const base = b.pos.length / 3;
  for (const [su, sv] of [[0, -1], [1, -1], [1, 1], [0, 1]]) {
    _tP.copy(o).addScaledVector(u, su * lu).addScaledVector(v, sv * hv);
    b.pos.push(_tP.x, _tP.y, _tP.z);
    const r = shade(_tP);
    b.nor.push(r[0], r[1], r[2]);
    b.col.push(r[3], r[4], r[5]);
    b.uv.push(su ? cell.u1 : cell.u0, (sv > 0) !== !!flipV ? cell.v1 : cell.v0);
  }
  b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3, base, base + 2, base + 1, base, base + 3, base + 2);
}
// 一段树干 / 枝杈：沿折线的锥管（rings：[[x, y, z, 半径], ...]），seg 条棱，树皮纹理沿长度方向
function addBarkTube(b, rings, seg, tint) {
  let vAcc = 0;
  for (let r = 0; r < rings.length; r++) {
    const [x, y, z, rad] = rings[r];
    if (r > 0) vAcc += Math.hypot(x - rings[r - 1][0], y - rings[r - 1][1], z - rings[r - 1][2]) / 1.6;
    // 这一圈的轴向（相邻两圈连线）
    const p = rings[Math.max(0, r - 1)], q = rings[Math.min(rings.length - 1, r + 1)];
    _tA.set(q[0] - p[0], q[1] - p[1], q[2] - p[2]).normalize();
    _tU.set(0, 0, 1).cross(_tA);
    if (_tU.lengthSq() < 1e-4) _tU.set(1, 0, 0).cross(_tA);
    _tU.normalize();
    _tV.crossVectors(_tA, _tU).normalize();
    const shade = 0.72 + 0.28 * Math.min(1, r / 2);
    for (let k = 0; k <= seg; k++) {
      const a = k / seg * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
      _tN.copy(_tU).multiplyScalar(ca).addScaledVector(_tV, sa);
      b.pos.push(x + _tN.x * rad, y + _tN.y * rad, z + _tN.z * rad);
      b.nor.push(_tN.x, _tN.y, _tN.z);
      b.uv.push(k / seg * 1.5, vAcc);
      b.col.push(tint[0] * shade, tint[1] * shade, tint[2] * shade);
    }
  }
  const base = b.pos.length / 3 - rings.length * (seg + 1);
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < seg; k++) {
      const a = base + r * (seg + 1) + k, c = a + seg + 1;
      b.idx.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
}
const _rv = () => trnd() - 0.5;
// 阔叶树：歪扭的树干分出几根枝杈，树冠是椭球形里随机朝向的一团叶簇
function addBroadleaf3D(B, tx, gy, tz, s, tint) {
  const th = (2.0 + trnd() * 0.8) * s, r0 = 0.24 * s;
  const lx = _rv() * 0.5 * s, lz = _rv() * 0.5 * s;
  const top = [tx + lx, gy + th, tz + lz];
  const barkT = [0.55, 0.47, 0.38];
  addBarkTube(B.bark, [[tx, gy - 0.2, tz, r0 * 1.25], [tx + lx * 0.35, gy + th * 0.5, tz + lz * 0.35, r0], [top[0], top[1], top[2], r0 * 0.72]], 7, barkT);
  const Rh = (2.7 + trnd() * 0.5) * s, Rv = 1.65 * s;
  const C = new THREE.Vector3(top[0], top[1] + 1.25 * s, top[2]);
  const nb = 4 + (trnd() < 0.5 ? 1 : 0), a0 = trnd() * 6.28;
  for (let k = 0; k < nb; k++) {
    const a = a0 + k / nb * Math.PI * 2 + _rv() * 0.6, reach = Rh * (0.5 + trnd() * 0.25);
    const ex = top[0] + Math.cos(a) * reach, ez = top[2] + Math.sin(a) * reach, ey = top[1] + (0.8 + trnd() * 0.8) * s;
    addBarkTube(B.bark, [[top[0], top[1] - 0.15, top[2], r0 * 0.5], [(top[0] + ex) / 2, (top[1] + ey) / 2 + 0.25 * s, (top[2] + ez) / 2, r0 * 0.32], [ex, ey, ez, r0 * 0.12]], 5, barkT);
  }
  const shade = p => {
    const dx = (p.x - C.x) / Rh, dy = (p.y - C.y) / Rv, dz = (p.z - C.z) / Rh;
    const nl = Math.hypot(dx, dy + 0.45, dz) || 1;
    const k = 0.55 + 0.45 * Math.min(1, Math.max(0, (dy + 1) / 2));
    return [dx / nl, (dy + 0.45) / nl, dz / nl, tint[0] * k, tint[1] * k, tint[2] * k];
  };
  const n = 24 + Math.floor(trnd() * 6);
  for (let k = 0; k < n; k++) {
    // 位置：树冠椭球里偏外层；朝向随机（俯视叶团）或者大致竖直（侧视叶团，底边朝下）
    _tN.set(_rv(), trnd() * 1.1 - 0.4, _rv()).normalize();
    const rr = 0.4 + trnd() * 0.55;
    const P = new THREE.Vector3(C.x + _tN.x * Rh * rr, C.y + _tN.y * Rv * rr, C.z + _tN.z * Rh * rr);
    const sideView = trnd() < 0.4;
    const u = new THREE.Vector3(), v = new THREE.Vector3();
    if (sideView) {
      const a = trnd() * 6.28;
      u.set(Math.cos(a), 0, Math.sin(a));
      v.set(_rv() * 0.3, 1, _rv() * 0.3).normalize();
      const hu = (1.25 + trnd() * 0.45) * s;
      addLeafCard(B.leaf, P.clone().addScaledVector(u, -hu), u, hu * 2, v.multiplyScalar(1).clone(), hu * 0.5, LEAF_CELLS.side[k & 1], shade);
    } else {
      const nrm = new THREE.Vector3(_rv(), trnd() * 0.9 + 0.1, _rv()).normalize();
      u.set(_rv(), _rv(), _rv()).cross(nrm).normalize();
      v.crossVectors(nrm, u);
      const hs = (0.95 + trnd() * 0.45) * s;
      addLeafCard(B.leaf, P.clone().addScaledVector(u, -hs), u, hs * 2, v, hs, LEAF_CELLS.top, shade, trnd() < 0.5);
    }
  }
}
// 冷杉：笔直的锥形树干，一层层轮生、往下垂的枝条（每根枝条两张交叉的面片：平铺的 + 竖着的），越往上越短
function addFir3D(B, tx, gy, tz, H, s, tint) {
  addBarkTube(B.bark, [[tx, gy - 0.2, tz, 0.24 * s], [tx, gy + H * 0.5, tz, 0.14 * s], [tx, gy + H, tz, 0.03]], 6, [0.5, 0.42, 0.36]);
  const y0 = 1.2 * s, R0 = 2.5 * s, step = 0.72 * s;
  const shadeFor = (cy, R) => p => {
    const dx = p.x - tx, dz = p.z - tz, rad = Math.hypot(dx, dz) || 1;
    const out = Math.min(1, rad / Math.max(0.5, R));
    const ny = 0.75, nl = Math.hypot(dx / rad * out, ny, dz / rad * out);
    const k = (0.55 + 0.45 * Math.min(1, (p.y - gy) / H)) * (0.78 + 0.22 * out);
    return [dx / rad * out / nl, ny / nl, dz / rad * out / nl, tint[0] * k, tint[1] * k, tint[2] * k];
  };
  const fr = LEAF_CELLS.frond;
  let a0 = trnd() * 6.28;
  for (let y = y0; y < H - 0.5; y += step * (0.85 + trnd() * 0.3)) {
    const f = (y - y0) / (H - y0), R = R0 * Math.pow(1 - f, 0.95) + 0.35;
    const nBr = f > 0.75 ? 4 : 5;
    a0 += 0.7 + trnd() * 0.5;
    const shade = shadeFor(y, R);
    for (let k = 0; k < nBr; k++) {
      const a = a0 + k / nBr * Math.PI * 2 + _rv() * 0.35, droop = 0.22 + 0.25 * (1 - f) + _rv() * 0.1;
      const L = R * (1.0 + _rv() * 0.2);
      const u = new THREE.Vector3(Math.cos(a) * Math.cos(droop), -Math.sin(droop), Math.sin(a) * Math.cos(droop));
      const tang = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a));
      const up = new THREE.Vector3().crossVectors(tang, u).normalize();
      const o = new THREE.Vector3(tx, gy + y, tz);
      const cell = fr[(k + Math.floor(y * 3)) & 3];
      addLeafCard(B.leaf, o, u, L, tang, L * 0.27, cell, shade);                 // 平铺的枝条
      addLeafCard(B.leaf, o, u, L, up, L * 0.2, cell, shade, true);              // 竖着的一片，侧面看也有厚度
    }
  }
  // 树尖
  const shade = shadeFor(H, 0.6);
  const tipL = 1.5 * s, o = new THREE.Vector3(tx, gy + H - tipL * 0.75, tz), up = new THREE.Vector3(0, 1, 0);
  addLeafCard(B.leaf, o, up, tipL, new THREE.Vector3(1, 0, 0), tipL * 0.25, fr[0], shade);
  addLeafCard(B.leaf, o, up, tipL, new THREE.Vector3(0, 0, 1), tipL * 0.25, fr[1], shade);
}
// 灌木：贴地的一小团叶簇
function addBush3D(B, bx, gy, bz, s, tint) {
  const C = new THREE.Vector3(bx, gy + 0.55 * s, bz), Rh = 1.05 * s, Rv = 0.6 * s;
  const shade = p => {
    const dx = (p.x - C.x) / Rh, dy = (p.y - C.y) / Rv, dz = (p.z - C.z) / Rh;
    const nl = Math.hypot(dx, dy + 0.6, dz) || 1, k = 0.6 + 0.4 * Math.min(1, Math.max(0, (dy + 1) / 2));
    return [dx / nl, (dy + 0.6) / nl, dz / nl, tint[0] * k, tint[1] * k, tint[2] * k];
  };
  for (let k = 0; k < 5; k++) {
    const a = trnd() * 6.28, P = new THREE.Vector3(C.x + Math.cos(a) * Rh * 0.35, C.y + _rv() * Rv * 0.5, C.z + Math.sin(a) * Rh * 0.35);
    const u = new THREE.Vector3(Math.cos(a + 1.57), _rv() * 0.4, Math.sin(a + 1.57)).normalize();
    const v = new THREE.Vector3(_rv() * 0.5, 1, _rv() * 0.5).normalize();
    const hu = (0.85 + trnd() * 0.3) * s;
    if (k < 3) addLeafCard(B.leaf, P.clone().addScaledVector(u, -hu), u, hu * 2, v, hu * 0.55, LEAF_CELLS.side[k & 1], shade);
    else {
      const nrm = new THREE.Vector3(_rv(), 1, _rv()).normalize(), uu = new THREE.Vector3(_rv(), 0, _rv()).cross(nrm).normalize(), vv = new THREE.Vector3().crossVectors(nrm, uu);
      addLeafCard(B.leaf, P.clone().addScaledVector(uu, -hu * 0.8), uu, hu * 1.6, vv, hu * 0.8, LEAF_CELLS.top, shade);
    }
  }
}

function makeTreeMesh(d, mat, depth) {
  if (!d.idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(d.pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(d.nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(d.uv, 2));
  g.setAttribute("color", new THREE.Float32BufferAttribute(d.col, 3));
  g.setIndex(d.idx);
  g.computeBoundingSphere();
  Object.values(g.attributes).forEach(a => a.onUpload(freeUploadedArray));
  g.index.onUpload(freeUploadedArray);
  const m = new THREE.Mesh(g, mat);
  if (depth) m.customDepthMaterial = depth;
  m.castShadow = mat.visible;
  m.receiveShadow = true;
  m.matrixAutoUpdate = false;
  scene.add(m);
  return m;
}
// 远处的贴图树：地图生成完一次建好
function flushTreeImpostors() {
  treeCells.forEach(c => {
    c.far = makeTreeMesh(c.imp, treeImpMat, treeImpDepthMat);
    c.imp = null;
    if (c.far) treeAlphaMeshes.push(c.far);
  });
  treeBuckets.clear();
}
// 近处的立体树：方格进入范围时现场生成（每次最多生成 2 格，避免卡顿），离远了释放
function buildTreeCellNear(c) {
  const leaf = mkGeoArrays(), bark = mkGeoArrays();
  for (const t of c.trees) {
    seedTree(t.x, t.z);
    if (t.kind === "broad") addBroadleaf3D({ leaf, bark }, t.x, t.gy, t.z, t.s, t.tint);
    else if (t.kind === "fir") addFir3D({ leaf, bark }, t.x, t.gy, t.z, t.H, t.s, t.tint);
    else addBush3D({ leaf, bark }, t.x, t.gy, t.z, t.s, t.tint);
  }
  const lm = makeTreeMesh(leaf, leafMat, leafDepthMat), bm = makeTreeMesh(bark, treeBarkMat, null);
  if (lm) treeAlphaMeshes.push(lm);
  c.near = [lm, bm].filter(Boolean);
}
function disposeTreeCellNear(c) {
  c.near.forEach(m => {
    scene.remove(m);
    m.geometry.dispose();
    const k = treeAlphaMeshes.indexOf(m);
    if (k >= 0) treeAlphaMeshes.splice(k, 1);
  });
  c.near = null;
}
let treeLODAt = null;
function updateTreeLOD(px, pz) {
  let built = 0, pending = false;
  for (const c of treeCells) {
    const dc = Math.hypot(c.cx - px, c.cz - pz);
    const wantNear = dc < TREE_LOD_DIST;
    if (wantNear && !c.near) {
      if (built < 2) { buildTreeCellNear(c); built++; } else pending = true;
    } else if (!wantNear && c.near && dc > TREE_LOD_DIST + 220) disposeTreeCellNear(c);
    const nearOn = wantNear && !!c.near;
    if (c.near) c.near.forEach(m => { m.visible = nearOn; });
    if (c.far) {
      const s = c.far.geometry.boundingSphere;
      c.far.visible = !nearOn && Math.hypot(s.center.x - px, s.center.z - pz) - s.radius < BATCH_VIEW_DIST;
    }
  }
  return pending;
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
const treeList = []; // { x, z, broad }（调试 / 测试用）
function plantTree(tx, tz, forest = false) {
  const gy = propBaseY(tx, tz, 0.5);
  const type = TREE_TYPES[Math.random() < (forest ? 0.8 : 0.45) ? (Math.random() < 0.5 ? 0 : 1) : 2];
  const scale = type.s0 + Math.random() * (type.s1 - type.s0);
  const t = 0.88 + Math.random() * 0.2;
  const tint = [t * (0.96 + Math.random() * 0.08), t, t * (0.94 + Math.random() * 0.08)];
  addTreeImpostor(tx, gy, tz, type, scale, Math.random() * Math.PI * 2, tint);
  // 近处的立体模型（大小和远处的贴图树一致，切换时不会突然变样）
  treeList.push({ x: tx, z: tz, broad: type === TREE_TYPES[2] });
  const cell = treeBucket(tx, tz);
  if (type === TREE_TYPES[2]) cell.trees.push({ kind: "broad", x: tx, gy, z: tz, s: scale / 1.8, tint });
  else cell.trees.push({ kind: "fir", x: tx, gy, z: tz, H: type.views[0].h * scale * 0.85, s: scale, tint: tint.map(c => c * 1.3) }); // 冷杉枝条贴图偏暗
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
  const tint = [t, t * (0.98 + Math.random() * 0.06), t * 0.95];
  addTreeImpostor(bx, gy, bz, BUSH_TYPE, s, Math.random() * Math.PI * 2, tint, 0.3 * s);
  treeBucket(bx, bz).trees.push({ kind: "bush", x: bx, gy, z: bz, s: s * 1.15, tint });
}

// 地形定型（房子底下都压平了）→ 生成地形网格与贴着地形的路面
buildTerrainMesh();
buildRoadRibbons();
// 全部静态物体生成完毕 → 一次性合批上传 GPU
flushStaticBatches();
flushTreeImpostors();
flushGlass();
syncColliderGrid();
