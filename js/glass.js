// glass.js：窗玻璃 —— 每个窗洞一块玻璃，反射天空（斜着看像镜子，正对着看得见屋里），
// 子弹（玩家和 AI 的）打穿、人翻窗、手雷飞过都会把它打碎（碎了就没了，和端游一样）。
// 玻璃不挡子弹、不挡视线（打碎之前也一样），只是外观；所有玻璃一个 InstancedMesh（一次绘制）
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const glassPanes = [];
const GLASS_CELL = 16;
const glassGrid = new Map();

// axis "x"：玻璃在 z = fixed 的竖直平面上，沿 x 从 a 到 b；axis "z"：在 x = fixed 的平面上，沿 z 从 a 到 b
function registerGlassPane(axis, fixed, a, b, y0, y1) {
  const p = { id: glassPanes.length, axis, fixed, a, b, y0, y1, broken: false, slot: -1 };
  glassPanes.push(p);
  const lo = Math.floor(a / GLASS_CELL), hi = Math.floor(b / GLASS_CELL), f = Math.floor(fixed / GLASS_CELL);
  for (let i = lo; i <= hi; i++) {
    const k = axis === "x" ? gridKey(i, f) : gridKey(f, i);
    let arr = glassGrid.get(k);
    if (!arr) { arr = []; glassGrid.set(k, arr); }
    arr.push(p);
  }
  return p;
}

const glassMat = new THREE.ShaderMaterial({
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    sunDir: { value: SUN_DIR }, skyTop: { value: SKY_TOP_COLOR }, skyHorizon: { value: SKY_HORIZON_COLOR }
  }]),
  vertexShader: `
    varying vec3 vWorld; varying vec3 vN;
    #include <fog_pars_vertex>
    void main() {
      mat4 m = modelMatrix;
      #ifdef USE_INSTANCING
        m = m * instanceMatrix;
      #endif
      vec4 wp = m * vec4(position, 1.0);
      vWorld = wp.xyz;
      vN = normalize(mat3(m) * normal);
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      #include <fog_vertex>
    }`,
  fragmentShader: `
    uniform vec3 sunDir; uniform vec3 skyTop; uniform vec3 skyHorizon;
    varying vec3 vWorld; varying vec3 vN;
    #include <fog_pars_fragment>
    void main() {
      vec3 V = normalize(cameraPosition - vWorld);
      vec3 n = normalize(vN);
      if (dot(n, V) < 0.0) n = -n;
      float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
      vec3 R = reflect(-V, n);
      // 反射：上半是天空，下半是地面（偏暗的灰绿）
      vec3 refl = mix(skyHorizon, skyTop, pow(clamp(R.y, 0.0, 1.0), 0.5));
      refl = mix(vec3(0.28, 0.31, 0.27), refl, smoothstep(-0.06, 0.1, R.y));
      float spec = pow(max(dot(R, sunDir), 0.0), 260.0) * 4.0;
      vec3 col = mix(vec3(0.09, 0.12, 0.13), refl, 0.3 + 0.7 * fres) + spec;
      gl_FragColor = vec4(col, clamp(0.2 + 0.62 * fres + spec, 0.0, 0.95));
      #include <fog_fragment>
    }`,
  transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true
});
let glassMesh = null;
const _gm = new THREE.Matrix4(), _gq = new THREE.Quaternion(), _gp = new THREE.Vector3(), _gs = new THREE.Vector3(), _gy = new THREE.Vector3(0, 1, 0);
const _gZero = new THREE.Matrix4().makeScale(0, 0, 0);
// 只画镜头 300 米内的玻璃（镜头每移动 15 米重新挑一次放进前面的实例槽，一次绘制）
const GLASS_DRAW_DIST = 300;
let glassSlotsAt = null;
const _gCam = new THREE.Vector3();
function writeGlassMatrix(p) {
  if (p.slot < 0) return;
  if (p.broken) { glassMesh.setMatrixAt(p.slot, _gZero); return; }
  if (p.axis === "x") { _gp.set((p.a + p.b) / 2, (p.y0 + p.y1) / 2, p.fixed); _gq.identity(); }
  else { _gp.set(p.fixed, (p.y0 + p.y1) / 2, (p.a + p.b) / 2); _gq.setFromAxisAngle(_gy, Math.PI / 2); }
  _gs.set(p.b - p.a, p.y1 - p.y0, 1);
  _gm.compose(_gp, _gq, _gs);
  glassMesh.setMatrixAt(p.slot, _gm);
}
function refreshGlassSlots() {
  if (!glassMesh) return;
  const wp = camera.getWorldPosition(_gCam);
  if (glassSlotsAt && Math.hypot(wp.x - glassSlotsAt.x, wp.z - glassSlotsAt.z) < 15) return;
  glassSlotsAt = { x: wp.x, z: wp.z };
  let n = 0;
  for (let i = 0; i < glassPanes.length; i++) {
    const p = glassPanes[i];
    p.slot = -1;
    if (p.broken) continue;
    const px = p.axis === "x" ? (p.a + p.b) / 2 : p.fixed, pz = p.axis === "x" ? p.fixed : (p.a + p.b) / 2;
    if (Math.abs(px - wp.x) > GLASS_DRAW_DIST || Math.abs(pz - wp.z) > GLASS_DRAW_DIST) continue;
    p.slot = n++;
    writeGlassMatrix(p);
  }
  glassMesh.count = n;
  glassMesh.instanceMatrix.needsUpdate = true;
}
// 地图生成完后建网格（nature.js 末尾调用）
function flushGlass() {
  if (!glassPanes.length) return;
  glassMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), glassMat, glassPanes.length);
  glassMesh.frustumCulled = false;
  glassMesh.renderOrder = 3;
  glassMesh.count = 0;
  scene.add(glassMesh);
}

function breakGlassPane(p) {
  if (p.broken) return;
  p.broken = true;
  if (glassMesh) { writeGlassMatrix(p); glassMesh.instanceMatrix.needsUpdate = true; }
  const cx = p.axis === "x" ? (p.a + p.b) / 2 : p.fixed, cz = p.axis === "x" ? p.fixed : (p.a + p.b) / 2, cy = (p.y0 + p.y1) / 2;
  const dd = Math.hypot(cx - playerRig.position.x, cz - playerRig.position.z);
  if (dd < 120) {
    // 碎玻璃往下掉
    for (let i = 0; i < 6; i++) {
      const u = Math.random() - 0.5;
      spawnFx({ pos: new THREE.Vector3(p.axis === "x" ? cx + u * (p.b - p.a) : cx, cy + (Math.random() - 0.5) * (p.y1 - p.y0), p.axis === "x" ? cz : cz + u * (p.b - p.a)),
        color: 0xdde8ec, s0: 0.12 + Math.random() * 0.1, s1: 0.05, a0: 0.9, a1: 0.2, life: 0.5 + Math.random() * 0.3, rise: -3.5 - Math.random() * 2, spin: 6 });
    }
    sfx.playGlass(dd, stereoPanFor(cx, cz));
  }
}
// 线段（a + dir * t，t ∈ [0, len]）穿过的玻璃全部打碎
function glassSegmentBreak(ax, ay, az, dx, dy, dz, len) {
  if (!glassPanes.length || len <= 0) return;
  const bx = ax + dx * len, bz = az + dz * len;
  const i0 = Math.floor(Math.min(ax, bx) / GLASS_CELL), i1 = Math.floor(Math.max(ax, bx) / GLASS_CELL);
  const j0 = Math.floor(Math.min(az, bz) / GLASS_CELL), j1 = Math.floor(Math.max(az, bz) / GLASS_CELL);
  if ((i1 - i0 + 1) * (j1 - j0 + 1) > 64) return; // 子弹每帧只走十几米，正常不会超过
  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      const arr = glassGrid.get(gridKey(i, j));
      if (!arr) continue;
      for (let k = 0; k < arr.length; k++) {
        const p = arr[k];
        if (p.broken) continue;
        const dn = p.axis === "x" ? dz : dx, o = p.axis === "x" ? az : ax;
        if (Math.abs(dn) < 1e-6) continue;
        const t = (p.fixed - o) / dn;
        if (t < 0 || t > len) continue;
        const u = p.axis === "x" ? ax + dx * t : az + dz * t, y = ay + dy * t;
        if (u >= p.a && u <= p.b && y >= p.y0 && y <= p.y1) breakGlassPane(p);
      }
    }
  }
}
