// terrain.js：地形高度场 —— 城镇 / 学校 / 河岸是平地，野外是起伏的丘陵和平原，遗迹建在一座小山的山顶；
// 公路顺着地形起伏（路面底下的地形沿路方向抹平，路面不会横着歪），丘陵在公路附近变缓。
// 渲染、走路、子弹、视线全部用同一张高度网格（20 米一格，每格沿同一条对角线切成两个三角形），结果完全一致。
// 盖房子时把房子底下压平（buildBuilding 调 terrainFlattenRect）；植被、物资都贴着地形放
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const TER_CELL = 20;
const TER_N = TERRAIN_SIZE / TER_CELL;  // 每边格子数
const TER_V = TER_N + 1;                // 每边顶点数
const TER_HALF = TERRAIN_SIZE / 2;
const terrainHeights = new Float32Array(TER_V * TER_V);
const terrainFixed = new Uint8Array(TER_V * TER_V); // 限坡度时不能动的点：路面、平地、遗迹山顶、房子地基
const RUINS_HILL_H = 26;                // 遗迹所在山顶比四周平地高多少
const RUINS_PLATEAU_R = 84;             // 山顶平台半径（遗迹全部建在 50 米内，再留一个三角形的余量）

// 任意一点的地形高度：所在格子按对角线 (0,0)-(1,1) 切成两个三角形，在三角形平面上插值（和渲染网格一模一样）
function terrainH(x, z) {
  let fx = (x + TER_HALF) / TER_CELL, fz = (z + TER_HALF) / TER_CELL;
  if (fx < 0) fx = 0; else if (fx > TER_N - 1e-6) fx = TER_N - 1e-6;
  if (fz < 0) fz = 0; else if (fz > TER_N - 1e-6) fz = TER_N - 1e-6;
  const ix = fx | 0, iz = fz | 0, u = fx - ix, v = fz - iz;
  const i = iz * TER_V + ix, H = terrainHeights;
  const h00 = H[i], h11 = H[i + TER_V + 1];
  return u >= v ? h00 + (H[i + 1] - h00) * u + (h11 - H[i + 1]) * v
                : h00 + (H[i + TER_V] - h00) * v + (h11 - H[i + TER_V]) * u;
}
// 地形法线（贴花、路面、物体朝向用）
function terrainNormalAt(x, z, out) {
  const e = 2.5;
  const dx = terrainH(x + e, z) - terrainH(x - e, z), dz = terrainH(x, z + e) - terrainH(x, z - e);
  return out.set(-dx, 2 * e, -dz).normalize();
}
// 某点离地多高（AI 判断“在地面层还是楼上”用：山坡上也是地面层）
function heightAboveTerrain(x, y, z) { return y - terrainH(x, z); }

// 线段（a + dir * t，t ∈ [0, len]）第一次钻进地面的位置，没有返回 -1
function terrainSegmentHit(ax, ay, az, dx, dy, dz, len) {
  if (len <= 0) return -1;
  const step = Math.min(2, len);
  let prevT = 0, prevD = ay - terrainH(ax, az);
  if (prevD < 0) return 0;
  for (let t = step; ; t += step) {
    if (t > len) t = len;
    const d = ay + dy * t - terrainH(ax + dx * t, az + dz * t);
    if (d < 0) {
      // 二分逼近交点
      let lo = prevT, hi = t;
      for (let k = 0; k < 8; k++) {
        const m = (lo + hi) / 2;
        if (ay + dy * m - terrainH(ax + dx * m, az + dz * m) < 0) hi = m; else lo = m;
      }
      return hi;
    }
    prevT = t; prevD = d;
    if (t >= len) return -1;
  }
}
// 两点之间的视线有没有被山挡住（两端各留 1.5 米不算，免得趴在坡上自己挡自己）
function terrainBlocksSegment(ax, ay, az, bx, by, bz) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 4) return false;
  const n = Math.ceil(L / 3);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (t * L < 1.5 || (1 - t) * L < 1.5) continue;
    if (ay + dy * t < terrainH(ax + dx * t, az + dz * t) - 0.05) return true;
  }
  return false;
}

// 点到矩形的平面距离（在矩形里为 0）
function rectDist(x, z, x0, z0, x1, z1) {
  const dx = Math.max(x0 - x, 0, x - x1), dz = Math.max(z0 - z, 0, z - z1);
  return Math.hypot(dx, dz);
}
// 遍历矩形范围内的地形顶点
function forTerrainVertices(x0, z0, x1, z1, fn) {
  const i0 = Math.max(0, Math.floor((x0 + TER_HALF) / TER_CELL)), i1 = Math.min(TER_N, Math.ceil((x1 + TER_HALF) / TER_CELL));
  const j0 = Math.max(0, Math.floor((z0 + TER_HALF) / TER_CELL)), j1 = Math.min(TER_N, Math.ceil((z1 + TER_HALF) / TER_CELL));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) fn(j * TER_V + i, i * TER_CELL - TER_HALF, j * TER_CELL - TER_HALF);
  }
}
// 一块矩形范围内地形离某个高度最多差多少（盖房子前看看这里平不平）
function terrainMaxDeviation(x0, z0, x1, z1, level = 0) {
  let m = 0;
  forTerrainVertices(x0, z0, x1, z1, (k) => { m = Math.max(m, Math.abs(terrainHeights[k] - level)); });
  return m;
}
// 把矩形范围压平到 level 高度：外扩 1.5 格（保证盖住这块地的三角形全部是平的），再往外 ramp 米慢慢过渡回原地形
function terrainFlattenRect(x0, z0, x1, z1, level = 0, ramp = 40) {
  const pad = TER_CELL * 1.5;
  const X0 = x0 - pad, X1 = x1 + pad, Z0 = z0 - pad, Z1 = z1 + pad;
  forTerrainVertices(X0 - ramp, Z0 - ramp, X1 + ramp, Z1 + ramp, (k, x, z) => {
    const d = rectDist(x, z, X0, Z0, X1, Z1);
    const w = d <= 0 ? 1 : 1 - smoothstep(0, ramp, d);
    terrainHeights[k] += (level - terrainHeights[k]) * w;
    if (d <= 0) terrainFixed[k] = 1;
  });
}
// 坡度限制：相邻两点高差超过 0.5 倍水平距离（约 27°）就削高补低（固定点不动，只动旁边的），
// 人和 AI 都能走上去，看起来也不像悬崖
function terrainRelaxSlopes() {
  const H = terrainHeights, fixed = terrainFixed, maxD = 0.5 * TER_CELL;
  for (let pass = 0; pass < 60; pass++) {
    let moved = 0;
    for (let j = 0; j < TER_V; j++) {
      for (let i = 0; i < TER_V; i++) {
        const k = j * TER_V + i;
        for (let a = 0; a < 2; a++) {
          const di = a === 0 ? 1 : 0, dj = 1 - di;
          if (i + di > TER_N || j + dj > TER_N) continue;
          const q = (j + dj) * TER_V + i + di, d = H[k] - H[q];
          if (Math.abs(d) <= maxD || (fixed[k] && fixed[q])) continue;
          const ex = (Math.abs(d) - maxD) * Math.sign(d);
          if (fixed[k]) H[q] += ex;
          else if (fixed[q]) H[k] -= ex;
          else { H[k] -= ex / 2; H[q] += ex / 2; }
          moved++;
        }
      }
    }
    if (!moved) break;
  }
}

// ---------------------------------------------------------------------------
// 高度场生成
// ---------------------------------------------------------------------------
// 野外：大尺度噪声决定哪里是丘陵（约六成）、哪里是平原；丘陵上叠山包和山脊（最高 60 米左右）；平原有一两米的缓坡；
// 再加上几座远离城镇和公路的大山（见 TERRAIN_MOUNTAINS）
function terrainWild(x, z) {
  const n = fbm(x / 600 + 11.3, z / 600 - 4.1, 731, 4);
  const hill = smoothstep(0.4, 0.62, n);
  let h = 0;
  if (hill > 0) {
    const m = fbm(x / 240 - 2.2, z / 240 + 7.5, 737, 3);
    const r = 1 - Math.abs(fbm(x / 400 + 5.1, z / 400 + 1.7, 743, 3) * 2 - 1);
    h = hill * (8 + 64 * m * m + 14 * r * r);
  }
  for (let i = 0; i < TERRAIN_MOUNTAINS.length; i++) {
    const M = TERRAIN_MOUNTAINS[i], dx = x - M.x, dz = z - M.z, d2 = dx * dx + dz * dz;
    if (d2 > 9 * M.s * M.s) continue;
    // 钟形山体，山坡上叠一点起伏（不是光溜溜的馒头）
    const k = Math.exp(-d2 / (M.s * M.s));
    h = Math.max(h, M.h * k * (0.82 + 0.36 * fbm(x / 140 + i * 3.1, z / 140 - i * 1.7, 771, 3)));
  }
  return h + fbm(x / 160 + 3.7, z / 160 - 8.2, 751, 2) * 2;
}
// 大山：在 100 米网格上找离城镇、学校、遗迹、河、公路都最远的几处（每次开局位置一样，地图有辨识度）
const TERRAIN_MOUNTAINS = (() => {
  const cands = [];
  for (let x = -1150; x <= 1150; x += 100) {
    for (let z = -1150; z <= 1150; z += 100) {
      let room = Math.min(Math.abs(z - RIVER_Z) - RIVER_HALF - 60, roadEdgeDistance(x, z, 420) - 30);
      POIS.forEach(p => { room = Math.min(room, Math.hypot(x - p.x, z - p.z) - p.r - (p.key === "ruins" ? 260 : 120)); });
      if (room > 130) cands.push({ x, z, room });
    }
  }
  cands.sort((a, b) => b.room - a.room);
  const out = [];
  for (const c of cands) {
    if (out.length >= 5) break;
    if (out.some(o => Math.hypot(o.x - c.x, o.z - c.z) < 600)) continue;
    // 山脚半径受周围空地限制；高度 = 半径 × 0.42（最陡处约 20°，人和 AI 都爬得上去）
    const s = Math.min(230, c.room * 0.6);
    out.push({ x: c.x, z: c.z, s, h: Math.min(105, s * 0.42) });
  }
  return out;
})();
// 遗迹那座山：山顶平台 + 四周缓坡（坡上有点起伏，不是一个圆锥）
function ruinsHillHeight(dr, x, z) {
  if (dr >= 220) return 0;
  const k = 1 - smoothstep(RUINS_PLATEAU_R, 215, dr);
  return RUINS_HILL_H * Math.pow(k, 0.85) + (fbm(x / 70, z / 70, 761, 2) - 0.5) * 7 * k * (1 - k);
}
// 农场的位置在生成地形之前就选好（每局随机），那一片留成平地（丘陵变多以后，随便找很难找到能盖农场的平地）
const TERRAIN_FARM_SITES = (() => {
  const out = [];
  for (let i = 0; i < 600 && out.length < 24; i++) {
    const x = (Math.random() - 0.5) * (MAP_SIZE - 260), z = (Math.random() - 0.5) * (MAP_SIZE - 260);
    if (POIS.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 90)) continue;
    if (Math.abs(z + 7 - RIVER_Z) < RIVER_HALF + 70 || roadEdgeDistance(x + 13, z + 7, 80) < 45) continue;
    if (out.some(o => Math.hypot(o.x - x, o.z - z) < 220)) continue;
    if (TERRAIN_MOUNTAINS.some(m => Math.hypot(m.x - x, m.z - z) < m.s * 1.6)) continue;
    out.push({ x, z });
  }
  return out;
})();
// 必须是平地的地方（1 = 完全平）：城镇（方形范围盖住整片房子）、学校、河两岸、农场
const TERRAIN_TOWNS = POIS.filter(p => p.key.endsWith("city")).map(p => ({ x: p.x, z: p.z, core: (p.key === "pcity" ? 4 : 2) * 46 + 45 }));
function terrainFlatMask(x, z) {
  let f = 1 - smoothstep(RIVER_HALF + 20, RIVER_HALF + 110, Math.abs(z - RIVER_Z));
  for (let i = 0; i < TERRAIN_TOWNS.length; i++) {
    const t = TERRAIN_TOWNS[i];
    const d = Math.max(Math.abs(x - t.x), Math.abs(z - t.z));
    if (d < t.core + 130) f = Math.max(f, 1 - smoothstep(t.core, t.core + 130, d));
  }
  const s = POI_BY_KEY.school;
  f = Math.max(f, 1 - smoothstep(30, 150, rectDist(x, z, s.x - 46, s.z - 44, s.x + 64, s.z + 40)));
  for (let i = 0; i < TERRAIN_FARM_SITES.length; i++) {
    const fs = TERRAIN_FARM_SITES[i], d = Math.hypot(x - fs.x - 13, z - fs.z - 7);
    if (d < 190) f = Math.max(f, 1 - smoothstep(58, 190, d));
  }
  return f;
}

(function generateTerrain() {
  const H = terrainHeights, ruins = POI_BY_KEY.ruins;
  const edgeStart = MAP_SIZE / 2 + 30;
  // 1) 离公路有多远（把每段公路光栅化到网格上），公路附近的丘陵压低一些
  const roadD = new Float32Array(H.length).fill(1e9), roadHW = new Float32Array(H.length);
  const rasterRoads = (R, fn) => {
    roadPolylines.forEach(poly => {
      const pts = poly.pts, hw = poly.w / 2;
      for (let i = 0; i < pts.length - 1; i++) {
        const ax = pts[i][0], az = pts[i][1], bx = pts[i + 1][0], bz = pts[i + 1][1];
        const sx = bx - ax, sz = bz - az, L2 = sx * sx + sz * sz || 1;
        forTerrainVertices(Math.min(ax, bx) - R, Math.min(az, bz) - R, Math.max(ax, bx) + R, Math.max(az, bz) + R, (k, x, z) => {
          const t = Math.max(0, Math.min(1, ((x - ax) * sx + (z - az) * sz) / L2));
          const d = Math.hypot(x - ax - sx * t, z - az - sz * t);
          fn(k, d, hw, poly, i, t);
        });
      }
    });
  };
  rasterRoads(160, (k, d, hw) => { if (d < roadD[k]) { roadD[k] = d; roadHW[k] = hw; } });

  for (let j = 0; j < TER_V; j++) {
    for (let i = 0; i < TER_V; i++) {
      const k = j * TER_V + i, x = i * TER_CELL - TER_HALF, z = j * TER_CELL - TER_HALF;
      let h = terrainWild(x, z) * (0.35 + 0.65 * smoothstep(10, 150, roadD[k]));
      // 遗迹周围别的山包压低，让遗迹那座山更显眼
      const dr = Math.hypot(x - ruins.x, z - ruins.z);
      h = Math.max(h * smoothstep(220, 420, dr), ruinsHillHeight(dr, x, z));
      h *= 1 - terrainFlatMask(x, z);
      // 地图外的远山：沿河流与公路留出山谷，让河与路一直延伸到地平线
      const edge = Math.max(Math.abs(x), Math.abs(z));
      if (edge > edgeStart) {
        const valley = Math.min(smoothstep(30, 110, Math.abs(z - RIVER_Z) - RIVER_HALF), smoothstep(8, 80, roadD[k] - roadHW[k]));
        h = Math.max(h, smoothstep(edgeStart, edgeStart + 380, edge) * (35 + fbm(x / 260, z / 260, 7, 4) * 170) * valley);
      }
      H[k] = h;
    }
  }

  // 2) 公路：沿路方向取地面高度做平滑（两头不平滑，保证接上城镇 / 山顶），路面两侧 34 米内过渡到这个高度
  const roadPtsH = roadPolylines.map(poly => {
    const pts = poly.pts, n = pts.length, s = [0];
    for (let i = 1; i < n; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const raw = pts.map(p => terrainH(p[0], p[1]));
    const total = s[n - 1];
    return raw.map((_, i) => {
      const W = Math.min(70, s[i], total - s[i]);
      let sum = 0, cnt = 0;
      for (let j = i; j >= 0 && s[i] - s[j] <= W; j--) { sum += raw[j]; cnt++; }
      for (let j = i + 1; j < n && s[j] - s[i] <= W; j++) { sum += raw[j]; cnt++; }
      return sum / cnt;
    });
  });
  const bestD = new Float32Array(H.length).fill(1e9), bestH = new Float32Array(H.length), bestHW = new Float32Array(H.length);
  const polyIdx = new Map(roadPolylines.map((p, i) => [p, i]));
  rasterRoads(40, (k, d, hw, poly, i, t) => {
    if (d >= bestD[k]) return;
    const hs = roadPtsH[polyIdx.get(poly)];
    bestD[k] = d; bestHW[k] = hw; bestH[k] = hs[i] + (hs[i + 1] - hs[i]) * t;
  });
  const fixed = terrainFixed;
  for (let k = 0; k < H.length; k++) {
    if (bestD[k] > 1e8) continue;
    const w = 1 - smoothstep(bestHW[k] + 4, bestHW[k] + 34, bestD[k]);
    H[k] += (bestH[k] - H[k]) * w;
    if (w > 0.98) fixed[k] = 1;
  }

  // 3) 必须平的地方压成准确的 0（城镇 / 学校 / 河岸），遗迹山顶压成平台
  for (let j = 0; j < TER_V; j++) {
    for (let i = 0; i < TER_V; i++) {
      const k = j * TER_V + i, x = i * TER_CELL - TER_HALF, z = j * TER_CELL - TER_HALF;
      if (Math.max(Math.abs(x), Math.abs(z)) < edgeStart && terrainFlatMask(x, z) > 0.999) H[k] = 0;
      const dr = Math.hypot(x - ruins.x, z - ruins.z);
      if (dr < RUINS_PLATEAU_R) H[k] = RUINS_HILL_H;
      else if (dr < RUINS_PLATEAU_R + 20) H[k] += (RUINS_HILL_H - H[k]) * (1 - smoothstep(RUINS_PLATEAU_R, RUINS_PLATEAU_R + 20, dr));
      if (H[k] < 0) H[k] = 0;
    }
  }

  // 4) 坡度限制（盖完房子压平地基后还会再做一遍，见 mapgen.js 末尾）
  for (let j = 0; j < TER_V; j++) {
    for (let i = 0; i < TER_V; i++) {
      const k = j * TER_V + i, x = i * TER_CELL - TER_HALF, z = j * TER_CELL - TER_HALF;
      if (Math.max(Math.abs(x), Math.abs(z)) > edgeStart - 40 || terrainFlatMask(x, z) > 0.999 ||
          Math.hypot(x - ruins.x, z - ruins.z) < RUINS_PLATEAU_R + 20) fixed[k] = 1;
    }
  }
  terrainRelaxSlopes();
})();

// ---------------------------------------------------------------------------
// 渲染：5×5 块（每块 1000 米见方，视野外的块自动不画），顶点颜色按坡度 / 地点上色
// ---------------------------------------------------------------------------
const TERRAIN_CHUNKS = 5;
// 地面三层照片贴图混合：草地（两种尺度叠加，远看不出重复）/ 泥土 / 岩石，混合比例存在每个顶点上
const terrainMaterial = new THREE.MeshLambertMaterial({ map: grassTex, vertexColors: true });
terrainMaterial.onBeforeCompile = sh => {
  sh.uniforms.rockMap = { value: rockTex };
  sh.uniforms.dirtMap = { value: dirtTex };
  sh.vertexShader = "attribute vec2 tblend;\nvarying vec2 vTBlend;\n" +
    sh.vertexShader.replace("#include <uv_vertex>", "#include <uv_vertex>\n  vTBlend = tblend;");
  sh.fragmentShader = "uniform sampler2D rockMap;\nuniform sampler2D dirtMap;\nvarying vec2 vTBlend;\n" +
    sh.fragmentShader.replace("#include <map_fragment>", [
      "vec3 tGrass = mix(texture2D(map, vUv).rgb, texture2D(map, vUv * 0.231 + vec2(0.37, 0.61)).rgb, 0.45);",
      "vec3 tDirt = texture2D(dirtMap, vUv * 0.83).rgb;",
      // 岩石不吃顶点染色（顶点颜色是给草地做明暗 / 枯黄变化的，染到岩石上会变成一片土黄）
      "vec3 tRock = texture2D(rockMap, vUv * 0.57).rgb * vec3(0.44, 0.44, 0.46) / max(vColor, vec3(0.5));",
      "diffuseColor.rgb *= mix(mix(tGrass, tDirt, vTBlend.y), tRock, vTBlend.x);"
    ].join("\n"));
};
const terrainChunks = [];
grassTex.repeat.set(TERRAIN_SIZE / 7, TERRAIN_SIZE / 7);
// out：[r, g, b（顶点染色）, 岩石比例, 泥土比例]
function terrainColorAt(x, z, h, slope, out) {
  const n = fbm(x / 170, z / 170, 3, 4);
  const n2 = valueNoise(x / 42, z / 42, 9);
  const dry = smoothstep(0.58, 0.74, n);
  const bank = 1 - smoothstep(RIVER_HALF - 4, RIVER_HALF + 8, Math.abs(z - RIVER_Z));
  // 陡坡和高山上露出岩石（加一点噪声，岩石和草地的边界不是一条直线）
  const rock = Math.min(1, Math.max(smoothstep(65, 115, h) * 0.75, smoothstep(0.3, 0.56, slope)) * (0.8 + n2 * 0.4));
  let r = 0.96 + (n - 0.5) * 0.3 + (n2 - 0.5) * 0.12 + dry * 0.2;
  let g = 0.98 + (n - 0.5) * 0.26 + (n2 - 0.5) * 0.1 + dry * 0.05;
  let b = 0.95 + (n - 0.5) * 0.2 - dry * 0.08;
  // 山坡上略黄（看得出起伏）
  const hk = smoothstep(4, 36, h) * (1 - smoothstep(45, 90, h));
  r += hk * 0.1; g += hk * 0.04; b -= hk * 0.04;
  // 村镇地面、河岸、干燥的草地露出泥土；遗迹周边是碎石泥土
  let dirt = Math.max(bank * 0.85, dry * 0.3 * n2);
  let stony = 0;
  for (let i = 0; i < POIS.length; i++) {
    const p = POIS[i];
    const k = 1 - smoothstep(p.r * 0.55, p.r * 1.05, Math.hypot(x - p.x, z - p.z));
    if (k <= 0) continue;
    if (p.key === "ruins") { dirt = Math.max(dirt, k * 0.55); stony = Math.max(stony, k * 0.35); }
    else dirt = Math.max(dirt, k * (0.35 + 0.3 * n2));
  }
  out[0] = r; out[1] = g; out[2] = b; out[3] = Math.max(rock, stony); out[4] = Math.min(1, dirt);
}
function buildTerrainMesh() {
  const H = terrainHeights, per = TER_N / TERRAIN_CHUNKS, side = per + 1;
  const col = [0, 0, 0, 0, 0], nrm = new THREE.Vector3();
  for (let cj = 0; cj < TERRAIN_CHUNKS; cj++) {
    for (let ci = 0; ci < TERRAIN_CHUNKS; ci++) {
      const pos = new Float32Array(side * side * 3), nor = new Float32Array(side * side * 3);
      const uv = new Float32Array(side * side * 2), cols = new Float32Array(side * side * 3), blend = new Float32Array(side * side * 2);
      for (let j = 0; j < side; j++) {
        for (let i = 0; i < side; i++) {
          const gi = ci * per + i, gj = cj * per + j, v = j * side + i;
          const x = gi * TER_CELL - TER_HALF, z = gj * TER_CELL - TER_HALF, h = H[gj * TER_V + gi];
          pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
          // 法线：相邻顶点的高度差（块与块之间接缝处法线一致，不会出现明暗分界线）
          const hl = H[gj * TER_V + Math.max(0, gi - 1)], hr = H[gj * TER_V + Math.min(TER_N, gi + 1)];
          const hd = H[Math.max(0, gj - 1) * TER_V + gi], hu = H[Math.min(TER_N, gj + 1) * TER_V + gi];
          nrm.set(hl - hr, 2 * TER_CELL, hd - hu).normalize();
          nor[v * 3] = nrm.x; nor[v * 3 + 1] = nrm.y; nor[v * 3 + 2] = nrm.z;
          uv[v * 2] = (x + TER_HALF) / TERRAIN_SIZE; uv[v * 2 + 1] = (z + TER_HALF) / TERRAIN_SIZE;
          terrainColorAt(x, z, h, Math.sqrt(1 - nrm.y * nrm.y) / Math.max(0.2, nrm.y), col);
          cols[v * 3] = col[0]; cols[v * 3 + 1] = col[1]; cols[v * 3 + 2] = col[2];
          blend[v * 2] = col[3]; blend[v * 2 + 1] = col[4];
        }
      }
      const idx = new Uint16Array(per * per * 6);
      let n = 0;
      for (let j = 0; j < per; j++) {
        for (let i = 0; i < per; i++) {
          const a = j * side + i, b = a + 1, d = a + side, c = d + 1;
          // 与 terrainH 一致：沿 (0,0)-(1,1) 对角线切开，法线朝上
          idx[n++] = a; idx[n++] = c; idx[n++] = b;
          idx[n++] = a; idx[n++] = d; idx[n++] = c;
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
      g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      g.setAttribute("color", new THREE.BufferAttribute(cols, 3));
      g.setAttribute("tblend", new THREE.BufferAttribute(blend, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, terrainMaterial);
      m.receiveShadow = true;
      scene.add(m);
      freezeObject(m);
      terrainChunks.push(m);
    }
  }
}
// 所有路面条带（主干道 / 土路 / 城镇街道）：等地形全部定型后再生成
// （城镇街道纵横交叉：横街比纵街高 2 厘米、主干道再高一点，路口重叠处不会闪烁）
function buildRoadRibbons() {
  let n = 0;
  roadPolylines.forEach(poly => buildRoadRibbon(poly, poly.street === "v" ? 0.08 : (poly.street === "h" ? 0.1 : 0.13 + 0.004 * n++)));
  flushRoadBatches();
}
