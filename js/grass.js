// grass.js：玩家周围的草丛 —— 一丛草 = 两张交叉的草叶贴图面片，全部草丛一个 InstancedMesh（一次绘制）。
// 按 12 米的地块生成（同一块地每次生成的草都一样），只保留镜头附近一圈；草随风轻轻摆，最外圈慢慢缩进地里（不会突然冒出来）。
// 路面、房子里、河里、陡坡 / 岩石上不长草，村镇里稀一些。纯外观：不挡子弹、不挡视线（和端游一样）
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const GRASS_TILE = 12;
const GRASS_SETTINGS = { low: { r: 24, per: 34 }, mid: { r: 34, per: 40 }, high: { r: 46, per: 58 } }; // r：半径（米），per：每块地多少丛

// 草叶贴图：几十片弯曲的草叶，根部深、叶尖浅黄绿
const grassBladeTex = (() => {
  const W = 256, H = 128;
  const cv = document.createElement("canvas");
  cv.width = W; cv.height = H;
  const ctx = cv.getContext("2d");
  let seed = 7;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 46; i++) {
    const x0 = 16 + rnd() * (W - 32), len = H * (0.5 + rnd() * 0.5), lean = (rnd() - 0.5) * 80, bw = 4.5 + rnd() * 4.5;
    const tipX = x0 + lean, tipY = H - len, cx = x0 + lean * 0.25, cy = H - len * 0.6;
    const g = ctx.createLinearGradient(0, H, 0, tipY);
    const l = 0.7 + rnd() * 0.3, dry = rnd() < 0.2;
    g.addColorStop(0, `rgb(${Math.round(46 * l)},${Math.round(66 * l)},${Math.round(26 * l)})`);
    g.addColorStop(0.5, dry ? `rgb(${Math.round(150 * l)},${Math.round(146 * l)},${Math.round(76 * l)})` : `rgb(${Math.round(96 * l)},${Math.round(138 * l)},${Math.round(52 * l)})`);
    g.addColorStop(1, dry ? `rgb(${Math.round(206 * l)},${Math.round(194 * l)},${Math.round(120 * l)})` : `rgb(${Math.round(150 * l)},${Math.round(184 * l)},${Math.round(84 * l)})`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0 - bw, H);
    ctx.quadraticCurveTo(cx - bw * 0.5, cy, tipX, tipY);
    ctx.quadraticCurveTo(cx + bw * 0.5, cy, x0 + bw, H);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.anisotropy = MAX_ANISO;
  return tex;
})();

// 一丛草的几何：三片草叶面片绕中心 60° 张开、叶尖往外斜（侧看是一丛，从上往下看也是散开的草叶，
// 不会是一个个“X”）（局部高 1、宽 1，底边在 y = 0），法线朝上（正反面受光一样）
const grassGeo = (() => {
  const pos = [], uv = [], nor = [], idx = [];
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5, b = pos.length / 3;
    const lean = (k === 1 ? -1 : 1) * 0.22, lx = -Math.sin(a) * lean, lz = Math.cos(a) * lean;
    pos.push(-cx, 0, -cz, cx, 0, cz, cx + lx, 1, cz + lz, -cx + lx, 1, -cz + lz);
    uv.push(0, 0, 1, 0, 1, 1, 0, 1);
    for (let i = 0; i < 4; i++) nor.push(0, 1, 0);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3, b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
})();

// 注意：three r128 不给 Lambert 材质传 cameraPosition，镜头位置用自己的 uniform
const grassUniforms = { time: { value: 0 }, fadeR: { value: 40 }, camPos: { value: new THREE.Vector3() } };
const grassMat = new THREE.MeshLambertMaterial({ map: grassBladeTex, alphaTest: 0.38, vertexColors: false });
grassMat.onBeforeCompile = sh => {
  sh.uniforms.time = grassUniforms.time;
  sh.uniforms.fadeR = grassUniforms.fadeR;
  sh.uniforms.camPos = grassUniforms.camPos;
  sh.vertexShader = "uniform float time;\nuniform float fadeR;\nuniform vec3 camPos;\n" + sh.vertexShader.replace("#include <begin_vertex>", `
    vec3 transformed = vec3(position);
    #ifdef USE_INSTANCING
      vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      // 风：每丛草相位不同，叶尖摆得多、根部不动
      float sw = sin(time * 1.8 + ip.x * 0.37 + ip.z * 0.29) * 0.7 + sin(time * 3.3 + ip.x * 1.3 - ip.z * 0.8) * 0.3;
      transformed.x += sw * 0.1 * position.y * position.y;
      // 最外圈慢慢缩进地里
      transformed.y *= 1.0 - smoothstep(fadeR * 0.72, fadeR, distance(ip.xz, camPos.xz));
    #endif`);
};

let grassMesh = null;
const grassTiles = new Map(); // "i|j" → Float32Array（每丛 16 个矩阵元素 + 3 个颜色）
let grassCenter = null, grassTier = null, grassGenQueue = [];
const _grM = new THREE.Matrix4(), _grQ = new THREE.Quaternion(), _grP = new THREE.Vector3(), _grS = new THREE.Vector3(), _grY = new THREE.Vector3(0, 1, 0);

// 生成一块地的草（确定性的伪随机：同一块地每次都一样）
function buildGrassTile(ti, tj, per) {
  let seed = (Math.imul(ti, 73856093) ^ Math.imul(tj, 19349663)) >>> 0 || 1;
  const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const out = [];
  const x0 = ti * GRASS_TILE, z0 = tj * GRASS_TILE;
  for (let n = 0; n < per; n++) {
    const x = x0 + rnd() * GRASS_TILE, z = z0 + rnd() * GRASS_TILE;
    const r1 = rnd(), r2 = rnd(), r3 = rnd(), r4 = rnd();
    if (Math.abs(x) > MAP_LIMIT || Math.abs(z) > MAP_LIMIT) continue;
    if (Math.abs(z - RIVER_Z) < RIVER_HALF + 1.5) continue;
    const h = terrainH(x, z);
    if (h > 78) continue;
    // 陡坡上是岩石
    const sl = Math.hypot(terrainH(x + 1.5, z) - terrainH(x - 1.5, z), terrainH(x, z + 1.5) - terrainH(x, z - 1.5)) / 3;
    if (sl > 0.42) continue;
    // 村镇、遗迹附近草稀
    let thin = 0;
    for (let i = 0; i < POIS.length; i++) {
      const p = POIS[i], d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r) thin = Math.max(thin, 0.7 * (1 - smoothstep(p.r * 0.5, p.r, d)));
    }
    if (r4 < thin) continue;
    if (roadEdgeDistance(x, z, 3) < 0.6) continue;
    if (getBuildingContainingPoint(x, z, 0.6) || isPointBlocked2D(x, z, 0.3, h)) continue;
    const s = 0.75 + r1 * 0.7;
    _grP.set(x, h - 0.04, z);
    _grQ.setFromAxisAngle(_grY, r2 * Math.PI);
    _grS.set(1.0 * s + 0.3, (0.42 + r3 * 0.38) * s, 1.0 * s + 0.3);
    _grM.compose(_grP, _grQ, _grS);
    const e = _grM.elements;
    // 颜色：和地面一样，有的地方偏枯黄
    const dry = smoothstep(0.58, 0.74, fbm(x / 170, z / 170, 3, 4));
    const k = 0.7 + r3 * 0.28;
    out.push(...e, k * (1 + dry * 0.25), k * (1 - dry * 0.05), k * (1 - dry * 0.25));
  }
  return new Float32Array(out);
}

function ensureGrassMesh(cap) {
  if (grassMesh && grassMesh.userData.cap >= cap) return;
  if (grassMesh) { scene.remove(grassMesh); grassMesh.dispose(); }
  grassMesh = new THREE.InstancedMesh(grassGeo, grassMat, cap);
  grassMesh.userData.cap = cap;
  grassMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  grassMesh.frustumCulled = false;
  grassMesh.receiveShadow = true;
  grassMesh.count = 0;
  scene.add(grassMesh);
}

// 每帧调用：镜头每移动 4 米重新挑一次附近的地块（新地块每帧最多生成 3 块，避免卡顿）
const _grCam = new THREE.Vector3();
function updateGrass(elapsed) {
  grassUniforms.time.value = elapsed;
  const cam = camera.getWorldPosition(_grCam);
  grassUniforms.camPos.value.copy(cam);
  const cfg = GRASS_SETTINGS[quality.tier] || GRASS_SETTINGS.mid;
  // 在天上（飞机 / 跳伞）不画草
  if (cam.y - terrainH(cam.x, cam.z) > 60) { if (grassMesh) grassMesh.visible = false; return; }
  const tierChanged = grassTier !== quality.tier;
  if (tierChanged) { grassTier = quality.tier; grassTiles.clear(); grassCenter = null; }
  grassUniforms.fadeR.value = cfg.r;
  const moved = !grassCenter || Math.hypot(cam.x - grassCenter.x, cam.z - grassCenter.z) > 4;
  if (!moved && !grassGenQueue.length) { if (grassMesh) grassMesh.visible = true; return; }
  if (moved) grassCenter = { x: cam.x, z: cam.z };
  const R = cfg.r, c = grassCenter;
  const i0 = Math.floor((c.x - R) / GRASS_TILE), i1 = Math.floor((c.x + R) / GRASS_TILE);
  const j0 = Math.floor((c.z - R) / GRASS_TILE), j1 = Math.floor((c.z + R) / GRASS_TILE);
  const want = [];
  let built = 0, pending = false;
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const cxT = (i + 0.5) * GRASS_TILE, czT = (j + 0.5) * GRASS_TILE;
      if (Math.hypot(cxT - c.x, czT - c.z) > R + GRASS_TILE * 0.71) continue;
      const key = i + "|" + j;
      let t = grassTiles.get(key);
      if (!t) {
        if (built >= 3) { pending = true; continue; }
        t = buildGrassTile(i, j, cfg.per);
        grassTiles.set(key, t);
        built++;
      }
      want.push(t);
    }
  }
  grassGenQueue = pending ? [1] : [];
  // 离得远的地块扔掉（再回来时重新生成，结果一样）
  if (grassTiles.size > want.length * 3) {
    for (const [key, t] of grassTiles) {
      const [i, j] = key.split("|").map(Number);
      if (Math.hypot((i + 0.5) * GRASS_TILE - c.x, (j + 0.5) * GRASS_TILE - c.z) > R * 2.5) grassTiles.delete(key);
    }
  }
  let n = 0;
  want.forEach(t => { n += t.length / 19; });
  ensureGrassMesh(Math.max(512, Math.ceil(n * 1.25)));
  const M = grassMesh.instanceMatrix.array, C = grassMesh.instanceColor.array;
  let k = 0;
  for (const t of want) {
    for (let q = 0; q < t.length; q += 19) {
      M.set(t.subarray(q, q + 16), k * 16);
      C[k * 3] = t[q + 16]; C[k * 3 + 1] = t[q + 17]; C[k * 3 + 2] = t[q + 18];
      k++;
    }
  }
  grassMesh.count = k;
  grassMesh.instanceMatrix.needsUpdate = true;
  grassMesh.instanceColor.needsUpdate = true;
  grassMesh.visible = true;
}
