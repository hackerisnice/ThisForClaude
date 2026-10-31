// render.js：渲染器、程序化贴图、天空、光照、画质档位、静态合批
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 3. 场景、碰撞与 7向触须智能避障寻路引擎
// ============================================================================
const container = document.getElementById("canvas-container");
const scene = new THREE.Scene();
// 场景根节点永不移动：关闭其矩阵自动更新，静态物体冻结矩阵后每帧可省掉上千次矩阵运算
scene.matrixAutoUpdate = false;

// 天空 / 雾色统一取地平线颜色，远景与天空无缝融合
const SKY_TOP_COLOR = new THREE.Color(0x3f7cc8);
const SKY_HORIZON_COLOR = new THREE.Color(0xc3d5e3);
const SKY_BELOW_COLOR = new THREE.Color(0xb6c8d4); // 地平线以下接近雾色，高空俯视时远处不会出现色带
const SUN_DIR = new THREE.Vector3(160, 260, 120).normalize();
scene.background = null; // 由天空球绘制背景（Color 背景会强制清屏，影响第二遍持枪渲染）
scene.fog = new THREE.FogExp2(SKY_HORIZON_COLOR.getHex(), 0.0013);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1100);
const playerRig = new THREE.Group();
playerRig.add(camera);
scene.add(playerRig);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setClearColor(SKY_HORIZON_COLOR, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // 阴影按需刷新（中档隔帧刷新）
renderer.autoClear = false;            // 手动清屏：先画世界，再清深度画第一人称枪械（防止枪穿墙）
container.appendChild(renderer.domElement);
const MAX_ANISO = Math.min(4, renderer.capabilities.getMaxAnisotropy());

// ---------------------------------------------------------------------------
// 3.1 程序化贴图（全部运行时生成，无需任何图片文件，生成一次常驻显存）
// ---------------------------------------------------------------------------
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y, seed, period = 0) {
  let ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  let ix1 = ix + 1, iy1 = iy + 1;
  if (period > 0) {
    ix = ((ix % period) + period) % period; iy = ((iy % period) + period) % period;
    ix1 = (ix + 1) % period; iy1 = (iy + 1) % period;
  }
  const a = hash2(ix, iy, seed), b = hash2(ix1, iy, seed);
  const c = hash2(ix, iy1, seed), d = hash2(ix1, iy1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, seed, octaves = 4, period = 0) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 17, period ? period * f : 0) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function makeCanvasTexture(size, painter, repeat = true) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  painter(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = MAX_ANISO;
  return tex;
}
function paintPixels(ctx, size, fn) {
  const img = ctx.createImageData(size, size);
  const d = img.data, out = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[3] = 255;
      fn(x, y, out);
      const i = (y * size + x) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
}
// 在贴图边缘自动镜像绘制，保证笔触可无缝平铺
function strokeWrapped(ctx, size, x, y, drawFn) {
  for (let ox = -size; ox <= size; ox += size) {
    for (let oy = -size; oy <= size; oy += size) {
      if (x + ox < -12 || x + ox > size + 12 || y + oy < -12 || y + oy > size + 12) continue;
      drawFn(x + ox, y + oy);
    }
  }
}

// 写实照片贴图（assets_tex.js 内嵌的 CC0 贴图）：先用程序生成的贴图顶上，图片解码完后原地换成照片
// （同一个贴图对象，用到它的材质都不用改）；overlay 在照片上再补画东西（路面标线 / 车辙）
function upgradeToPhoto(tex, key, overlay) {
  if (typeof TEX_DATA === "undefined" || !TEX_DATA[key]) return tex;
  const img = new Image();
  img.onload = () => {
    const cv = tex.image, ctx = cv.getContext("2d");
    cv.width = img.width; cv.height = img.height;
    ctx.drawImage(img, 0, 0);
    if (overlay) overlay(ctx, cv.width);
    tex.needsUpdate = true;
  };
  img.src = TEX_DATA[key];
  return tex;
}
// 没有程序生成版本的照片贴图：解码完成前先用纯色
function photoTexture(key, fallback) {
  return upgradeToPhoto(makeCanvasTexture(4, (ctx, s) => { ctx.fillStyle = fallback; ctx.fillRect(0, 0, s, s); }), key);
}

const grassTex = makeCanvasTexture(256, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n1 = fbm(u * 8, v * 8, 11, 4, 8);
    const n2 = valueNoise(u * 64, v * 64, 5, 64);
    const k = 0.78 + n1 * 0.3 + (n2 - 0.5) * 0.14 + (hash2(x, y, 3) - 0.5) * 0.12;
    const dry = smoothstep(0.62, 0.8, n1) * 0.45;
    o[0] = (84 + dry * 26) * k; o[1] = (110 + dry * 6) * k; o[2] = (58 - dry * 6) * k;
  });
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const len = 2 + Math.random() * 4, ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const light = Math.random() < 0.5;
    ctx.strokeStyle = light ? "rgba(150,170,85,0.35)" : "rgba(40,62,30,0.35)";
    ctx.lineWidth = 1;
    strokeWrapped(ctx, s, x, y, (px, py) => {
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); ctx.stroke();
    });
  }
});

const plasterTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n = fbm(u * 4, v * 4, 21, 4, 4);
    const stain = smoothstep(0.62, 0.8, fbm(u * 2, v * 2, 29, 3, 2)) * 0.1;
    const k = Math.min(1, 0.84 + n * 0.16 - stain + (hash2(x, y, 7) - 0.5) * 0.07);
    o[0] = o[1] = o[2] = 255 * k;
  });
});

const woodTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const plank = Math.floor(v * 4);
    const base = 0.72 + hash2(plank, 1, 13) * 0.2;
    const grain = 0.5 + 0.5 * Math.sin((u * 48 + fbm(u * 4, v * 16, 17, 3, 4) * 6) * Math.PI);
    const seam = (v * 4) % 1 < 0.05 ? 0.55 : 1;
    const k = (base + grain * 0.1) * seam;
    o[0] = 255 * k; o[1] = 228 * k; o[2] = 196 * k;
  });
});

const rockTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n = fbm(u * 6, v * 6, 31, 5, 6);
    const crack = Math.abs(fbm(u * 3, v * 3, 37, 3, 3) - 0.5) < 0.018 ? 0.6 : 1;
    const k = Math.min(1, (0.6 + n * 0.5 + (hash2(x, y, 9) - 0.5) * 0.12) * crack);
    o[0] = o[1] = o[2] = 255 * k;
  });
});

const barkTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n = valueNoise(u * 24, v * 3, 41, 0) * 0.5 + valueNoise(u * 48, v * 6, 43, 0) * 0.5;
    const k = 0.55 + n * 0.45;
    o[0] = 255 * k; o[1] = 236 * k; o[2] = 214 * k;
  });
});


// 道路标线：两侧白色边线 + 中间黄色虚线（带磨损）
function paintRoadLines(ctx, s, vertical) {
  const line = (a0, a1, b0, b1, color) => {
    ctx.fillStyle = color;
    if (vertical) ctx.fillRect(b0 * s, a0 * s, (b1 - b0) * s, (a1 - a0) * s);
    else ctx.fillRect(a0 * s, b0 * s, (a1 - a0) * s, (b1 - b0) * s);
  };
  line(0, 1, 0.055, 0.075, "rgba(225,225,215,0.78)");
  line(0, 1, 0.925, 0.945, "rgba(225,225,215,0.78)");
  line(0, 0.32, 0.488, 0.512, "rgba(222,184,60,0.85)");
  // 磨损：标线上零星的斑驳
  for (let i = 0; i < s * 3; i++) {
    ctx.fillStyle = `rgba(48,48,50,${0.25 + Math.random() * 0.4})`;
    ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * s / 85, 1 + Math.random() * s / 85);
  }
}
upgradeToPhoto(grassTex, "grass");
upgradeToPhoto(plasterTex, "plaster");
upgradeToPhoto(woodTex, "wood");
upgradeToPhoto(rockTex, "rock");
upgradeToPhoto(barkTex, "bark");
const dirtTex = photoTexture("dirt", "#7a6c4a");      // 地形：村镇 / 河岸的泥土
const brickTex = photoTexture("brick", "#9e6656");    // 红砖墙
const stoneTex = photoTexture("stone", "#d8d8d4");    // 遗迹石块墙
const roofTex = photoTexture("roof", "#cfcfcf");      // 坡屋顶瓦片（屋脊沿 X 方向）
const roofTexR = photoTexture("roof", "#cfcfcf");     // 坡屋顶瓦片（屋脊沿 Z 方向，贴图转 90°）
roofTexR.rotation = Math.PI / 2;
const metalTex = photoTexture("metal", "#d8d8d8");    // 仓库 / 谷仓的波纹铁皮
const concreteTex = photoTexture("concrete", "#d8d8d8"); // 平屋顶水泥

function makeAsphaltTexture(vertical) {
  const tex = makeCanvasTexture(256, (ctx, s) => {
    paintPixels(ctx, s, (x, y, o) => {
      const n = fbm(x / s * 8, y / s * 8, 61, 3, 8);
      const k = 52 + n * 22 + (hash2(x, y, 15) - 0.5) * 16;
      o[0] = k; o[1] = k * 1.01; o[2] = k * 1.04;
    });
    paintRoadLines(ctx, s, vertical);
  });
  return upgradeToPhoto(tex, "asphalt", (ctx, s) => paintRoadLines(ctx, s, vertical));
}

// 水面波纹法线贴图（可无缝平铺；拉长一点，像顺流的水纹）
const waterNormalTex = makeCanvasTexture(256, (ctx, s) => {
  const hf = new Float32Array(s * s);
  for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) hf[y * s + x] = fbm(x / s * 4, y / s * 8, 71, 5, 4) + 0.35 * fbm(x / s * 16, y / s * 16, 73, 3, 16);
  const h = (x, y) => hf[y * s + x];
  paintPixels(ctx, s, (x, y, o) => {
    const dx = (h((x + 1) % s, y) - h((x - 1 + s) % s, y)) * 9;
    const dy = (h(x, (y + 1) % s) - h(x, (y - 1 + s) % s)) * 9;
    const len = Math.hypot(dx, dy, 1);
    o[0] = (-dx / len * 0.5 + 0.5) * 255; o[1] = (-dy / len * 0.5 + 0.5) * 255; o[2] = (1 / len * 0.5 + 0.5) * 255;
  });
});

const cloudTex = makeCanvasTexture(256, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const n = fbm(x / s * 4, y / s * 4, 81, 5, 4);
    o[0] = o[1] = o[2] = 255 * smoothstep(0.47, 0.78, n);
  });
});

const softDotTex = makeCanvasTexture(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
}, false);

const flashTex = makeCanvasTexture(64, (ctx, s) => {
  ctx.translate(s / 2, s / 2);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    const g = ctx.createLinearGradient(0, 0, s / 2, 0);
    g.addColorStop(0, "rgba(255,240,190,0.95)"); g.addColorStop(1, "rgba(255,150,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(s / 2, 0); ctx.lineTo(0, 3); ctx.fill();
  }
  const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 3);
  g2.addColorStop(0, "rgba(255,255,230,1)"); g2.addColorStop(0.4, "rgba(255,190,80,0.8)"); g2.addColorStop(1, "rgba(255,120,20,0)");
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, s / 3, 0, Math.PI * 2); ctx.fill();
}, false);

const holeTex = makeCanvasTexture(32, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(8,8,8,1)"); g.addColorStop(0.45, "rgba(20,20,20,0.95)");
  g.addColorStop(0.7, "rgba(60,58,55,0.55)"); g.addColorStop(1, "rgba(60,58,55,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
}, false);

const chuteTex = makeCanvasTexture(64, (ctx, s) => {
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#5d7a45" : "#c9b98a";
    ctx.fillRect(i * s / 8, 0, s / 8, s);
  }
});

// ---------------------------------------------------------------------------
// 3.2 天空球（渐变 + 太阳光晕 + 飘动云层，一次贴图采样，手机也很轻）
// ---------------------------------------------------------------------------
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    topColor: { value: SKY_TOP_COLOR },
    horizonColor: { value: SKY_HORIZON_COLOR },
    belowColor: { value: SKY_BELOW_COLOR },
    sunDir: { value: SUN_DIR },
    cloudMap: { value: cloudTex },
    time: { value: 0 }
  },
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 belowColor; uniform vec3 sunDir;
    uniform sampler2D cloudMap; uniform float time;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
      col = mix(col, belowColor, smoothstep(0.0, -0.35, h));
      float s = max(dot(d, sunDir), 0.0);
      if (h > 0.015) {
        vec2 cuv = d.xz / (h + 0.12) * 0.2 + vec2(time * 0.004, time * 0.0016);
        float c = texture2D(cloudMap, cuv).r * smoothstep(0.015, 0.22, h);
        vec3 cloudCol = mix(vec3(0.84, 0.87, 0.92), vec3(1.0, 0.97, 0.92), pow(s, 6.0));
        col = mix(col, cloudCol, c * 0.85);
      }
      col += vec3(1.0, 0.9, 0.72) * (pow(s, 700.0) * 1.5 + pow(s, 10.0) * 0.16);
      gl_FragColor = vec4(col, 1.0);
    }`,
  side: THREE.BackSide,
  depthWrite: false
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1080, 32, 16), skyMat);
skyDome.renderOrder = 1000;   // 最后绘制不透明物体：被建筑/地面挡住的天空像素直接被深度测试跳过
skyDome.frustumCulled = false;
scene.add(skyDome);

// ---------------------------------------------------------------------------
// 3.3 光照：天光半球光 + 太阳平行光（阴影只覆盖玩家周围，跟随玩家移动）
// ---------------------------------------------------------------------------
const hemiLight = new THREE.HemisphereLight(0xd8e8ff, 0x5c5240, 0.64);
hemiLight.layers.enable(1);
scene.add(hemiLight);
const fillLight = new THREE.AmbientLight(0xffffff, 0.12);
fillLight.layers.enable(1);
scene.add(fillLight);
const sunLight = new THREE.DirectionalLight(0xfff1d8, 0.95);
sunLight.position.set(160, 260, 120);
sunLight.layers.enable(1);
sunLight.shadow.bias = -0.0006;
sunLight.shadow.normalBias = 0.04;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 720;
scene.add(sunLight);
scene.add(sunLight.target);

const SUN_SHADOW_OFFSET = SUN_DIR.clone().multiplyScalar(340);
let shadowCenterX = 1e9, shadowCenterZ = 1e9;
function updateSunShadowCenter() {
  const px = playerRig.position.x, pz = playerRig.position.z;
  // 玩家每移动 6 米才平移一次阴影相机，静止时阴影边缘完全不闪烁
  if (Math.abs(px - shadowCenterX) < 6 && Math.abs(pz - shadowCenterZ) < 6) return;
  shadowCenterX = px; shadowCenterZ = pz;
  // 阴影盒子跟着脚下地面的高度走（站在山上时阴影范围不会偏到山脚）
  const gy = terrainH(px, pz);
  sunLight.target.position.set(px, gy, pz);
  sunLight.position.set(px + SUN_SHADOW_OFFSET.x, gy + SUN_SHADOW_OFFSET.y, pz + SUN_SHADOW_OFFSET.z);
}

// ---------------------------------------------------------------------------
// 3.4 画质档位 + 自动动态分辨率（帧率低自动降分辨率/关阴影，保证手机不卡）
// ---------------------------------------------------------------------------
const QUALITY_PRESETS = {
  low:  { maxPR: 1.0, minPR: 0.7,  shadows: false, shadowSize: 512,  shadowType: THREE.BasicShadowMap,   shadowRange: 40, shadowEvery: 2, lootDist: 50, detailDist: 45 },
  mid:  { maxPR: 1.5, minPR: 0.85, shadows: true,  shadowSize: 1024, shadowType: THREE.PCFShadowMap,     shadowRange: 55, shadowEvery: 2, lootDist: 65, detailDist: 70 },
  high: { maxPR: 2.0, minPR: 1.0,  shadows: true,  shadowSize: 2048, shadowType: THREE.PCFSoftShadowMap, shadowRange: 75, shadowEvery: 1, lootDist: 90, detailDist: 110 }
};
const quality = {
  tier: "mid", pr: 1, maxPR: 1, minPR: 1, lootDist: 65, detailDist: 70,
  frames: 0, accum: 0, warmup: 3.0, lowStreak: 0, highStreak: 0, fps: 0, frameCounter: 0
};

function defaultAutoTier() {
  return IS_MOBILE ? "mid" : "high";
}

function setRenderPixelRatio(pr) {
  quality.pr = Math.max(quality.minPR, Math.min(quality.maxPR, pr));
  renderer.setPixelRatio(quality.pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function applyQualityTier(tier, keepPR) {
  const p = QUALITY_PRESETS[tier] || QUALITY_PRESETS.mid;
  const prevTier = quality.tier;
  quality.tier = tier;
  quality.lootDist = p.lootDist;
  quality.detailDist = p.detailDist;
  const dpr = window.devicePixelRatio || 1;
  quality.maxPR = Math.min(dpr, p.maxPR);
  quality.minPR = Math.min(quality.maxPR, p.minPR);
  setRenderPixelRatio(keepPR ? quality.pr : quality.maxPR);

  sunLight.castShadow = p.shadows;
  if (sunLight.shadow.mapSize.x !== p.shadowSize) {
    sunLight.shadow.mapSize.set(p.shadowSize, p.shadowSize);
    if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
  }
  const sc = sunLight.shadow.camera;
  sc.left = -p.shadowRange; sc.right = p.shadowRange; sc.top = p.shadowRange; sc.bottom = -p.shadowRange;
  sc.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;

  if (renderer.shadowMap.type !== p.shadowType || prevTier !== tier) {
    renderer.shadowMap.type = p.shadowType;
    // 阴影类型变化需要重新编译着色器（只在切换档位时发生一次）
    scene.traverse(o => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; });
    });
  }
  quality.frames = 0; quality.accum = 0; quality.lowStreak = 0; quality.highStreak = 0;
  quality.warmup = 2.0;
}

function updateAutoQuality(rawDt) {
  if (quality.warmup > 0) { quality.warmup -= rawDt; return; }
  quality.frames++;
  quality.accum += rawDt;
  if (quality.accum < 2.0) return;
  quality.fps = quality.frames / quality.accum;
  quality.frames = 0; quality.accum = 0;
  const fpsEl = document.getElementById("fps-readout");
  if (fpsEl && document.getElementById("ui-cfg-panel").style.display === "block") {
    fpsEl.innerText = `FPS ${Math.round(quality.fps)} · 渲染倍率 ${quality.pr.toFixed(2)}`;
  }
  if (gameSettings.quality !== "auto" || document.hidden) return;

  if (quality.fps < 42) {
    quality.highStreak = 0;
    if (quality.pr > quality.minPR + 0.01) {
      setRenderPixelRatio(quality.pr - 0.15);
    } else if (++quality.lowStreak >= 2) {
      quality.lowStreak = 0;
      if (quality.tier === "high") applyQualityTier("mid", true);
      else if (quality.tier === "mid") applyQualityTier("low", true);
    }
  } else if (quality.fps > 56) {
    quality.lowStreak = 0;
    if (++quality.highStreak >= 3 && quality.pr < quality.maxPR - 0.01) {
      quality.highStreak = 0;
      setRenderPixelRatio(quality.pr + 0.1);
    }
  } else {
    quality.lowStreak = 0;
    quality.highStreak = 0;
  }
}

applyQualityTier(gameSettings.quality === "auto" ? defaultAutoTier() : gameSettings.quality, false);

// ---------------------------------------------------------------------------
// 3.5 静态场景合批：上千个房屋/树木/岩石网格合并成几十个绘制批次（DrawCall 从 3000+ 降到几十）
//     原始网格对象原样保留，继续用于子弹命中与视线射线检测 —— 判定结果与原版完全一致
// ---------------------------------------------------------------------------
const BATCH_CELL = 250;
const BATCH_MAX_VERTS = 65000;     // 每个批次不超过 16 位索引上限，所有手机 GPU 都支持
const BATCH_VIEW_DIST = 950;       // 超出该距离的批次整体不绘制（远处已被雾气完全吞没）
const DETAIL_VIEW_DIST = 320;      // 窗框、窗台、落水管这类小细节：只在 320 米内画（再远就不到一个像素了）
const staticBatchMaterials = {
  plaster: new THREE.MeshLambertMaterial({ vertexColors: true, map: plasterTex }),
  wood:    new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex }),
  rock:    new THREE.MeshLambertMaterial({ vertexColors: true, map: rockTex }),
  bark:    new THREE.MeshLambertMaterial({ vertexColors: true, map: barkTex }),
  brick:   new THREE.MeshLambertMaterial({ vertexColors: true, map: brickTex }),
  stone:   new THREE.MeshLambertMaterial({ vertexColors: true, map: stoneTex }),
  roof:    new THREE.MeshLambertMaterial({ vertexColors: true, map: roofTex }),
  roofR:   new THREE.MeshLambertMaterial({ vertexColors: true, map: roofTexR }),
  metal:   new THREE.MeshLambertMaterial({ vertexColors: true, map: metalTex }),
  concrete: new THREE.MeshLambertMaterial({ vertexColors: true, map: concreteTex })
};
// 每米多少张贴图（世界坐标投影 UV）：按照片里砖块 / 瓦片 / 木板的真实尺寸定
const STATIC_BATCH_UV_SCALE = { plaster: 0.36, wood: 0.7, rock: 0.3, bark: 0.6, brick: 0.9, stone: 0.45, roof: 0.6, roofR: 0.6, metal: 0.4, concrete: 0.25 };
const staticBatchBuckets = new Map();
const sealedBatchBuckets = [];
const staticBatchMeshes = [];
const _bp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _bn = new THREE.Vector3(), _bFace = new THREE.Vector3(), _bE1 = new THREE.Vector3(), _bE2 = new THREE.Vector3();
const _bNormalMat = new THREE.Matrix3();
const _bColor = new THREE.Color();
const _bRemap = new Int32Array(256);
const nonIndexedCache = new WeakMap();

// 共享的单位立方体：所有墙体/楼板代理网格都用它 + 缩放，不再每块墙 new 一个几何体（大地图省下大量内存）
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
UNIT_BOX.userData.flatIndexed = true;

function newBatchBucket(matKey) {
  return {
    matKey, n: 0, ni: 0,
    pos: new Float32Array(4096 * 3), nor: new Float32Array(4096 * 3),
    uv: new Float32Array(4096 * 2), col: new Float32Array(4096 * 3), idx: new Uint16Array(8192)
  };
}
function growTyped(arr, need) {
  if (need <= arr.length) return arr;
  let cap = arr.length;
  while (cap < need) cap *= 2;
  const out = new arr.constructor(cap);
  out.set(arr);
  return out;
}
function reserveBatch(b, verts, idx) {
  b.pos = growTyped(b.pos, (b.n + verts) * 3);
  b.nor = growTyped(b.nor, (b.n + verts) * 3);
  b.col = growTyped(b.col, (b.n + verts) * 3);
  b.uv = growTyped(b.uv, (b.n + verts) * 2);
  b.idx = growTyped(b.idx, b.ni + idx);
}
function getBatchBucket(key, matKey, addVerts) {
  let b = staticBatchBuckets.get(key);
  if (b && b.n + addVerts > BATCH_MAX_VERTS) {
    sealedBatchBuckets.push(b);
    b = null;
  }
  if (!b) { b = newBatchBucket(matKey); b.detail = key.startsWith("d|"); staticBatchBuckets.set(key, b); }
  return b;
}

// 写入一个顶点：世界坐标投影 UV（贴图密度与物体大小无关）+ 墙根/天花板压暗（零成本环境光遮蔽）
function emitBatchVertex(b, p, n, axisX, axisY, axisZ, uvs, useAO, opts) {
  const i = b.n++;
  b.pos[i * 3] = p.x; b.pos[i * 3 + 1] = p.y; b.pos[i * 3 + 2] = p.z;
  b.nor[i * 3] = n.x; b.nor[i * 3 + 1] = n.y; b.nor[i * 3 + 2] = n.z;
  if (axisY >= axisX && axisY >= axisZ) { b.uv[i * 2] = p.x * uvs; b.uv[i * 2 + 1] = p.z * uvs; }
  else if (axisX >= axisZ) { b.uv[i * 2] = p.z * uvs; b.uv[i * 2 + 1] = p.y * uvs; }
  else { b.uv[i * 2] = p.x * uvs; b.uv[i * 2 + 1] = p.y * uvs; }
  let shade = 1;
  if (useAO) {
    if (n.y < -0.5) shade = 0.62;
    else if (Math.abs(n.y) < 0.5) shade = 0.7 + 0.3 * Math.min(1, Math.max(0, (p.y - (opts.aoBase || 0)) / 2.6));
  }
  if (opts.shadeFn) shade *= opts.shadeFn(p, n);
  // 墙朝屋里的那一面用室内颜色（外墙刷外墙漆，屋里刷浅色墙漆）
  const c = opts.inColor && n.x * opts.inN[0] + n.z * opts.inN[1] > 0.5 ? opts.inColor : _bColor;
  b.col[i * 3] = c.r * shade; b.col[i * 3 + 1] = c.g * shade; b.col[i * 3 + 2] = c.b * shade;
  return i;
}

function addToStaticBatch(mesh, matKey, colorHex, opts = {}) {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry;
  const mw = mesh.matrixWorld;
  _bNormalMat.getNormalMatrix(mw);
  // 细节件按 2 倍大的格子合批（反正只在附近画，格子大一点绘制次数少）
  const cell = opts.detail ? BATCH_CELL * 2 : BATCH_CELL;
  const cx = Math.floor(mw.elements[12] / cell), cz = Math.floor(mw.elements[14] / cell);
  const key = (opts.detail ? "d|" : "") + matKey + "|" + cx + "|" + cz;
  _bColor.setHex(colorHex);
  const uvs = STATIC_BATCH_UV_SCALE[matKey] || 0.4;
  const useAO = opts.ao !== false;

  if (geo.userData.flatIndexed) {
    // 立方体：保留索引（每面 4 个顶点而不是 6 个），可选跳过贴地的底面
    const pos = geo.attributes.position, nor = geo.attributes.normal, index = geo.index;
    const b = getBatchBucket(key, matKey, pos.count);
    reserveBatch(b, pos.count, index.count);
    _bRemap.fill(-1, 0, pos.count);
    for (let t = 0; t < index.count; t += 3) {
      const a0 = index.getX(t);
      _bn.fromBufferAttribute(nor, a0).applyMatrix3(_bNormalMat).normalize();
      if (opts.skipBottom && _bn.y < -0.9) continue;
      for (let k = 0; k < 3; k++) {
        const v = index.getX(t + k);
        if (_bRemap[v] < 0) {
          _bp[0].fromBufferAttribute(pos, v).applyMatrix4(mw);
          _bn.fromBufferAttribute(nor, v).applyMatrix3(_bNormalMat).normalize();
          _bRemap[v] = emitBatchVertex(b, _bp[0], _bn, Math.abs(_bn.x), Math.abs(_bn.y), Math.abs(_bn.z), uvs, useAO, opts);
        }
        b.idx[b.ni++] = _bRemap[v];
      }
    }
    return;
  }

  // 其它几何体：按三角面朝向选择投影轴
  let srcGeo = geo;
  if (geo.index) {
    srcGeo = nonIndexedCache.get(geo);
    if (!srcGeo) { srcGeo = geo.toNonIndexed(); if (geo.userData.shared) nonIndexedCache.set(geo, srcGeo); }
  }
  const pos = srcGeo.attributes.position, nor = srcGeo.attributes.normal;
  const b = getBatchBucket(key, matKey, pos.count);
  reserveBatch(b, pos.count, pos.count);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    for (let k = 0; k < 3; k++) _bp[k].fromBufferAttribute(pos, i + k).applyMatrix4(mw);
    _bE1.subVectors(_bp[1], _bp[0]); _bE2.subVectors(_bp[2], _bp[0]);
    _bFace.crossVectors(_bE1, _bE2);
    const ax = Math.abs(_bFace.x), ay = Math.abs(_bFace.y), az = Math.abs(_bFace.z);
    for (let k = 0; k < 3; k++) {
      _bn.fromBufferAttribute(nor, i + k).applyMatrix3(_bNormalMat).normalize();
      b.idx[b.ni++] = emitBatchVertex(b, _bp[k], _bn, ax, ay, az, uvs, useAO, opts);
    }
  }
  if (srcGeo !== geo && !geo.userData.shared) srcGeo.dispose();
}

// 上传 GPU 后释放 CPU 端的顶点数组（大地图的合批数据只需要在显存里保留一份）
function freeUploadedArray() { this.array = null; }

function flushStaticBatches() {
  const all = sealedBatchBuckets.concat(Array.from(staticBatchBuckets.values()));
  all.forEach(b => {
    if (b.ni === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(b.pos.subarray(0, b.n * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(b.nor.subarray(0, b.n * 3), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(b.uv.subarray(0, b.n * 2), 2));
    g.setAttribute("color", new THREE.BufferAttribute(b.col.subarray(0, b.n * 3), 3));
    g.setIndex(new THREE.BufferAttribute(b.idx.subarray(0, b.ni), 1));
    g.computeBoundingSphere();
    Object.values(g.attributes).forEach(a => a.onUpload(freeUploadedArray));
    g.index.onUpload(freeUploadedArray);
    const m = new THREE.Mesh(g, staticBatchMaterials[b.matKey]);
    if (b.detail) m.userData.viewDist = DETAIL_VIEW_DIST;
    m.castShadow = !b.detail; // 窗框窗台这些小东西的影子看不出来，省掉阴影那一遍的绘制
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
    m.updateMatrixWorld(true);
    staticBatchMeshes.push(m);
  });
  staticBatchBuckets.clear();
  sealedBatchBuckets.length = 0;
}

// 远处批次整体隐藏（玩家每移动 25 米重新判断一次，开销可忽略）
let lastBatchCullX = Infinity, lastBatchCullZ = Infinity;
let treeLODPending = false;
function cullStaticBatches() {
  const px = playerRig.position.x, pz = playerRig.position.z;
  if (Math.abs(px - lastBatchCullX) + Math.abs(pz - lastBatchCullZ) < 25 && !treeLODPending) return;
  treeLODPending = updateTreeLOD(px, pz);
  lastBatchCullX = px; lastBatchCullZ = pz;
  for (let i = 0; i < staticBatchMeshes.length; i++) {
    const m = staticBatchMeshes[i];
    const s = m.geometry.boundingSphere;
    m.visible = Math.hypot(s.center.x - px, s.center.z - pz) - s.radius < (m.userData.viewDist || BATCH_VIEW_DIST);
  }
}

// 冻结静态物体矩阵（物资、弹孔、盒子等放下后不再移动）
function freezeObject(obj) {
  obj.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  obj.updateMatrixWorld(true);
}
