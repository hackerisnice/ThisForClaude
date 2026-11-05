// soldier.js：写实士兵（骨骼蒙皮模型 + 动作捕捉动画）
// 模型数据在 assets_soldier.js（MakeHuman CC0 人体 / 衣服 / 头盔，离线拼装、减面、绑定骨骼）；
// 动作是 Quaternius Universal Animation Library（CC0）的动捕动画，离线重定向到同一套骨骼。
// 运行时：每个士兵一套骨骼，三档细节模型（近 / 中 / 远）共用；下半身按移动速度混合 走 / 跑 / 冲刺 / 蹲走，
// 横移和后退时腿朝移动方向、上半身扭回来朝着瞄准方向；拿枪时双手用 IK 握在枪上，枪口真的对着瞄准方向；
// 跳伞 / 开伞 / 扔雷 / 打药 / 换弹 / 中弹 / 倒地都有对应动作。命中盒挂在骨骼上，跟着动作走（看到哪打到哪）
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const SOLDIER = (() => {
  const A = SOLDIER_ASSET;
  const b64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; };
  const nb = A.bones.length;
  const boneIdx = {};
  A.bones.forEach((n, i) => { boneIdx[n] = i; });
  const rest = A.rest;
  const anis = typeof MAX_ANISO !== "undefined" ? MAX_ANISO : 1;
  const loadTex = url => {
    const t = new THREE.TextureLoader().load(url);
    t.anisotropy = anis;
    return t;
  };

  function geo(m, skinned) {
    const g = new THREE.BufferGeometry();
    const vi = new Int16Array(b64(m.v)), pos = new Float32Array(vi.length);
    for (let i = 0; i < vi.length; i++) pos[i] = vi[i] / A.posQ;
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(new Int8Array(b64(m.n)), 3, true));
    g.setAttribute("uv", new THREE.BufferAttribute(new Uint16Array(b64(m.t)), 2, true));
    if (skinned) {
      g.setAttribute("skinIndex", new THREE.BufferAttribute(new Uint8Array(b64(m.si)), 4));
      g.setAttribute("skinWeight", new THREE.BufferAttribute(new Uint8Array(b64(m.sw)), 4, true));
    }
    g.setIndex(new THREE.BufferAttribute(m.i32 ? new Uint32Array(b64(m.i)) : new Uint16Array(b64(m.i)), 1));
    if (m.groups) m.groups.forEach(gr => g.addGroup(gr[0], gr[1], gr[2]));
    // 骨骼动画会让人弯腰、蹲下、倒地：包围球放大，免得被视锥误剔除
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.8, 0), 2.1);
    return g;
  }
  // 两套衣服（T 恤 + 工装裤 / 长袖作训服），每套三档细节模型 + 一件贴身防弹衣
  const outfitGeos = A.outfits.map(o => o.lods.map(m => geo(m, true)));
  const vestGeos = A.outfits.map(o => geo(o.vest, true));
  const gearGeo = {};
  for (const k in A.gear) gearGeo[k] = geo(A.gear[k], false);
  gearGeo.helm1.boundingSphere = gearGeo.helm2.boundingSphere = gearGeo.pack.boundingSphere = null;
  gearGeo.helm1.computeBoundingSphere(); gearGeo.helm2.computeBoundingSphere(); gearGeo.pack.computeBoundingSphere();

  // 外观：每种外观 = 一套衣服 + 一张贴图（迷彩配色 + 肤色）
  const variantOutfit = A.variants.map(v => v.outfit);
  const charTex = A.variants.map(v => loadTex(v.tex));
  const hairTex = loadTex(A.hairTex), gearTex = loadTex(A.gearTex);
  const charMats = charTex.map(t => new THREE.MeshLambertMaterial({ map: t, skinning: true }));
  // 近处的高模：逐像素光照（脸、衣服褶皱更平滑，不会看到一块块三角面），带一点点皮肤 / 布料高光
  const charMatsHi = charTex.map(t => new THREE.MeshPhongMaterial({ map: t, skinning: true, specular: 0x161616, shininess: 18 }));
  const hairMat = new THREE.MeshLambertMaterial({ map: hairTex, skinning: true, alphaTest: 0.45, side: THREE.DoubleSide });
  const helmMats = [
    new THREE.MeshLambertMaterial({ map: gearTex, color: 0xffffff, side: THREE.DoubleSide }),      // 1 级：摩托头盔
    new THREE.MeshLambertMaterial({ map: gearTex, color: 0xe8ead8, side: THREE.DoubleSide }),      // 2 级：军用头盔
    new THREE.MeshLambertMaterial({ map: gearTex, color: 0x4a4e52, side: THREE.DoubleSide })       // 3 级：特种头盔（深色）
  ];
  const vestMats = [0xb5ad93, 0x66704a, 0x2f3236].map(c => new THREE.MeshLambertMaterial({ map: gearTex, color: c, skinning: true }));
  const packMats = [0x8c7a58, 0x5b6443, 0x3c3f42].map(c => new THREE.MeshLambertMaterial({ map: gearTex, color: c }));

  // 动作：四元数 int16 → float
  const clips = {};
  for (const name in A.clips) {
    const c = A.clips[name];
    const qi = new Int16Array(b64(c.q)), q = new Float32Array(qi.length);
    for (let i = 0; i < qi.length; i++) q[i] = qi[i] / 32767;
    const pi = new Int16Array(b64(c.p)), p = new Float32Array(pi.length);
    for (let i = 0; i < pi.length; i++) p[i] = pi[i] / 8000 + A.rest[i % 3]; // 存的是相对静止姿势骨盆的位移
    clips[name] = { n: c.n, fps: c.fps, loop: c.loop, dur: c.dur, q, p, speed: c.speed };
  }

  // 枪模（按枪种：突击步枪 / 冲锋枪 / 霰弹枪 / 射手步枪 / 狙击枪 / 轻机枪）：几个方块合成一个网格，
  // 原点在枪托抵肩处，+Z 指向枪口
  function mergeBoxes(list) {
    const pos = [], nrm = [], idx = [];
    list.forEach(([cx, cy, cz, sx, sy, sz, rx]) => {
      const g = new THREE.BoxGeometry(sx, sy, sz);
      if (rx) g.rotateX(rx);
      g.translate(cx, cy, cz);
      const b = pos.length / 3;
      pos.push(...g.attributes.position.array); nrm.push(...g.attributes.normal.array);
      for (let i = 0; i < g.index.count; i++) idx.push(g.index.array[i] + b);
      g.dispose();
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setIndex(idx);
    return g;
  }
  const GUN_SPECS = {
    AR:  { L: 0.92, grip: 0.3, fore: 0.55, parts: [[0, 0, 0.12, 0.05, 0.12, 0.24], [0, 0.02, 0.38, 0.065, 0.1, 0.3], [0, 0.025, 0.66, 0.05, 0.06, 0.26], [0, 0.03, 0.85, 0.022, 0.022, 0.16], [0, -0.1, 0.43, 0.035, 0.14, 0.07, -0.25], [0, -0.07, 0.3, 0.03, 0.1, 0.04, 0.35], [0, 0.085, 0.4, 0.02, 0.02, 0.28]] },
    SMG: { L: 0.66, grip: 0.24, fore: 0.42, parts: [[0, 0.02, 0.08, 0.04, 0.08, 0.16], [0, 0.02, 0.3, 0.06, 0.1, 0.28], [0, 0.025, 0.55, 0.03, 0.03, 0.2], [0, -0.11, 0.33, 0.03, 0.16, 0.045], [0, -0.07, 0.22, 0.03, 0.1, 0.04, 0.3], [0, 0.08, 0.3, 0.018, 0.018, 0.2]] },
    SG:  { L: 1.0, grip: 0.3, fore: 0.6, parts: [[0, -0.01, 0.13, 0.05, 0.12, 0.26], [0, 0.02, 0.4, 0.06, 0.09, 0.28], [0, 0.03, 0.72, 0.04, 0.04, 0.56], [0, -0.01, 0.62, 0.05, 0.05, 0.22], [0, -0.07, 0.3, 0.03, 0.1, 0.04, 0.35]] },
    DMR: { L: 1.06, grip: 0.3, fore: 0.6, parts: [[0, 0, 0.13, 0.05, 0.12, 0.26], [0, 0.02, 0.4, 0.065, 0.1, 0.3], [0, 0.025, 0.7, 0.05, 0.06, 0.3], [0, 0.03, 0.95, 0.022, 0.022, 0.22], [0, -0.08, 0.44, 0.035, 0.1, 0.08], [0, -0.07, 0.3, 0.03, 0.1, 0.04, 0.35], [0, 0.085, 0.42, 0.02, 0.02, 0.28]] },
    SR:  { L: 1.18, grip: 0.3, fore: 0.62, parts: [[0, -0.01, 0.15, 0.055, 0.13, 0.3], [0, 0.015, 0.45, 0.06, 0.085, 0.3], [0, 0.0, 0.7, 0.055, 0.06, 0.3], [0, 0.03, 0.98, 0.024, 0.024, 0.42], [0, -0.07, 0.31, 0.03, 0.1, 0.04, 0.35]] },
    LMG: { L: 1.1, grip: 0.32, fore: 0.62, parts: [[0, 0, 0.13, 0.055, 0.12, 0.26], [0, 0.025, 0.42, 0.08, 0.12, 0.34], [0, 0.03, 0.75, 0.055, 0.065, 0.32], [0, 0.035, 0.98, 0.026, 0.026, 0.2], [0, -0.1, 0.44, 0.1, 0.1, 0.12], [0, -0.07, 0.31, 0.03, 0.1, 0.04, 0.35]] }
  };
  const gunGeos = {};
  for (const k in GUN_SPECS) gunGeos[k] = mergeBoxes(GUN_SPECS[k].parts);
  const gunMetal = new THREE.MeshLambertMaterial({ color: 0x1d1f21 });
  const gunWood = new THREE.MeshLambertMaterial({ color: 0x5b3b22 });
  const scopeGeo = mergeBoxes([[0, 0.12, 0.38, 0.045, 0.05, 0.2], [0, 0.12, 0.28, 0.06, 0.06, 0.03], [0, 0.12, 0.49, 0.065, 0.065, 0.035], [0, 0.09, 0.38, 0.02, 0.03, 0.05]]);
  const hitGeo = new THREE.BoxGeometry(1, 1, 1);
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  const noMat = new THREE.MeshBasicMaterial({ visible: false }); // 戴头盔时把头发藏起来（不然短发会从贴头皮的头盔里扎出来）

  return { A, nb, boneIdx, rest, outfitGeos, vestGeos, variantOutfit, gearGeo, charMats, charMatsHi, hairMat, helmMats, vestMats, packMats, clips,
    GUN_SPECS, gunGeos, gunMetal, gunWood, scopeGeo, hitGeo, hitMat, noMat, variants: charMats.length };
})();

const SB = SOLDIER.boneIdx;
const SOLDIER_UPPER = ["spine_01", "spine_02", "spine_03", "neck_01", "head", "clavicle_l", "upperarm_l", "lowerarm_l", "hand_l",
  "clavicle_r", "upperarm_r", "lowerarm_r", "hand_r"].map(n => SB[n]);
const SOLDIER_LOD_DIST = [26, 85];

// ---------------------------------------------------------------------------
// 一个士兵：骨骼 + 三档模型 + 装备 + 枪 + 降落伞 + 命中盒
// ---------------------------------------------------------------------------
function createSoldierRig(variant, owner) {
  const S = SOLDIER, nb = S.nb;
  const root = new THREE.Group();
  root.rotation.order = "YXZ";
  const bones = [];
  for (let i = 0; i < nb; i++) { const b = new THREE.Bone(); b.name = S.A.bones[i]; bones.push(b); }
  for (let i = 0; i < nb; i++) {
    const p = S.A.par[i], r = S.rest;
    if (p < 0) { bones[i].position.set(r[i * 3], r[i * 3 + 1], r[i * 3 + 2]); root.add(bones[i]); }
    else { bones[i].position.set(r[i * 3] - r[p * 3], r[i * 3 + 1] - r[p * 3 + 1], r[i * 3 + 2] - r[p * 3 + 2]); bones[p].add(bones[i]); }
  }
  root.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  const v = ((variant % S.variants) + S.variants) % S.variants;
  const outfit = S.variantOutfit[v];
  const lods = S.outfitGeos[outfit].map((g, i) => {
    const m = new THREE.SkinnedMesh(g, [i === 0 ? S.charMatsHi[v] : S.charMats[v], S.hairMat]);
    m.bind(skel);
    m.castShadow = i < 2; m.receiveShadow = true;
    m.visible = i === 0;
    root.add(m);
    return m;
  });
  // 装备
  const helm = [new THREE.Mesh(S.gearGeo.helm1, S.helmMats[0]), new THREE.Mesh(S.gearGeo.helm2, S.helmMats[1])];
  helm.forEach(h => { h.visible = false; h.castShadow = true; h.scale.setScalar(1.05); bones[SB.head].add(h); });
  const vest = new THREE.SkinnedMesh(S.vestGeos[outfit], S.vestMats[0]);
  vest.bind(skel); vest.visible = false; vest.castShadow = true;
  root.add(vest);
  const pack = new THREE.Mesh(S.gearGeo.pack, S.packMats[0]);
  pack.visible = false; pack.castShadow = true;
  bones[SB.spine_03].add(pack);
  // 枪（位置每帧按瞄准方向摆，双手 IK 握上去）
  const gun = new THREE.Group();
  const gunMesh = new THREE.Mesh(S.gunGeos.AR, S.gunMetal);
  gunMesh.castShadow = true;
  const scope = new THREE.Mesh(S.scopeGeo, S.gunMetal);
  scope.visible = false;
  const muzzle = new THREE.Object3D();
  gun.add(gunMesh, scope, muzzle);
  gun.visible = false;
  root.add(gun);
  // 降落伞
  let chute = null;
  if (typeof BOT_GEO !== "undefined" && BOT_GEO.chute) {
    chute = new THREE.Mesh(BOT_GEO.chute, BOT_MAT.chute);
    chute.position.y = 3.9;
    chute.visible = false;
    root.add(chute);
  }
  // 命中盒（不画出来，只给子弹判定用）
  const hitboxes = S.A.hit.map(h => {
    const m = new THREE.Mesh(S.hitGeo, S.hitMat);
    m.position.set(h.c[0], h.c[1], h.c[2]);
    m.quaternion.set(h.q[0], h.q[1], h.q[2], h.q[3]);
    m.scale.set(h.s[0], h.s[1], h.s[2]);
    const zone = h.head ? "head" : (/^(thigh|calf)/.test(h.name) ? "legs" : (/arm/.test(h.name) ? "arms" : "body"));
    m.userData = { isAI: !!owner, isHead: h.head, bot: owner, zone };
    bones[h.bone].add(m);
    return m;
  });
  root.visible = false;
  if (typeof scene !== "undefined") scene.add(root);
  return {
    root, bones, skel, lods, helm, vest, pack, gun, gunMesh, scope, muzzle, chute, hitboxes, variant: v,
    lod: 0, gunType: "AR", gunL: 0.92, helmLv: 0, vestLv: 0, packLv: 0,
    // 动画内部状态
    gait: Math.random(), idleT: Math.random() * 3, crT: Math.random() * 3, legYaw: 0, back: 0,
    Q: new Float32Array(nb * 4), T: new Float32Array(nb * 4), U: new Float32Array(nb * 4), pel: new Float32Array(3), pel2: new Float32Array(3),
    frame: 0, acc: 0, posed: false,
    st: { air: 0, speed: 0, moveRel: 0, crouch: 0, prone: 0, armed: false, aim: 0, ads: 0, pitch: 0, action: null, actionT: 0, dead: -1, gait: undefined }
  };
}

// 换手上的枪：枪种决定枪模长短，装了倍镜就显示倍镜
const SOLDIER_WOOD = { akm: 1, kar98k: 1, s1897: 1, s686: 1, sks: 1, dragunov: 1, dp28: 1, mini14: 1 };
function soldierSetGun(rig, weaponKey, hasScope) {
  if (!weaponKey) { rig.gun.visible = false; rig.gunType = null; return; }
  const w = WEAPONS_DATA[weaponKey];
  const t = SOLDIER.GUN_SPECS[w.type] ? w.type : "AR";
  rig.gunType = t;
  rig.gunMesh.geometry = SOLDIER.gunGeos[t];
  rig.gunMesh.material = SOLDIER_WOOD[weaponKey] ? SOLDIER.gunWood : SOLDIER.gunMetal;
  rig.gunL = SOLDIER.GUN_SPECS[t].L;
  rig.muzzle.position.set(0, 0.03, rig.gunL);
  rig.scope.visible = !!hasScope;
}
function soldierSetGear(rig, helmLv, vestLv, packLv) {
  if (helmLv !== rig.helmLv) {
    rig.helmLv = helmLv;
    rig.helm[0].visible = helmLv === 1;
    rig.helm[1].visible = helmLv >= 2;
    if (helmLv >= 2) rig.helm[1].material = SOLDIER.helmMats[helmLv - 1];
    const hairM = helmLv > 0 ? SOLDIER.noMat : SOLDIER.hairMat;
    rig.lods.forEach(m => { if (m.material[1] !== hairM) m.material = [m.material[0], hairM]; });
  }
  if (vestLv !== rig.vestLv) {
    rig.vestLv = vestLv;
    rig.vest.visible = vestLv > 0;
    if (vestLv > 0) rig.vest.material = SOLDIER.vestMats[vestLv - 1];
  }
  if (packLv !== rig.packLv) {
    rig.packLv = packLv;
    rig.pack.visible = packLv > 0;
    if (packLv > 0) { rig.pack.material = SOLDIER.packMats[packLv - 1]; rig.pack.scale.setScalar(0.8 + packLv * 0.12); }
  }
}

// ---------------------------------------------------------------------------
// 动画采样与混合（四元数线性插值，同号后再插值）
// ---------------------------------------------------------------------------
function soldierSample(clip, t, outQ, outP) {
  const n = clip.n, nb = SOLDIER.nb;
  let f = t * clip.fps;
  if (clip.loop) { f %= (n - 1); if (f < 0) f += n - 1; } else f = Math.max(0, Math.min(n - 1, f));
  const f0 = Math.floor(f), f1 = Math.min(n - 1, f0 + 1), u = f - f0;
  const q = clip.q, o0 = f0 * nb * 4, o1 = f1 * nb * 4;
  for (let i = 0; i < nb * 4; i += 4) {
    let x1 = q[o1 + i], y1 = q[o1 + i + 1], z1 = q[o1 + i + 2], w1 = q[o1 + i + 3];
    const x0 = q[o0 + i], y0 = q[o0 + i + 1], z0 = q[o0 + i + 2], w0 = q[o0 + i + 3];
    if (x0 * x1 + y0 * y1 + z0 * z1 + w0 * w1 < 0) { x1 = -x1; y1 = -y1; z1 = -z1; w1 = -w1; }
    outQ[i] = x0 + (x1 - x0) * u; outQ[i + 1] = y0 + (y1 - y0) * u; outQ[i + 2] = z0 + (z1 - z0) * u; outQ[i + 3] = w0 + (w1 - w0) * u;
  }
  if (outP) {
    const p = clip.p;
    for (let k = 0; k < 3; k++) outP[k] = p[f0 * 3 + k] + (p[f1 * 3 + k] - p[f0 * 3 + k]) * u;
  }
}
// dst = dst*(1-w) + src*w （按骨骼子集）
function soldierBlend(dst, src, w, list) {
  if (w <= 0) return;
  const n = list ? list.length : SOLDIER.nb;
  for (let k = 0; k < n; k++) {
    const i = (list ? list[k] : k) * 4;
    let x = src[i], y = src[i + 1], z = src[i + 2], ww = src[i + 3];
    if (dst[i] * x + dst[i + 1] * y + dst[i + 2] * z + dst[i + 3] * ww < 0) { x = -x; y = -y; z = -z; ww = -ww; }
    dst[i] += (x - dst[i]) * w; dst[i + 1] += (y - dst[i + 1]) * w; dst[i + 2] += (z - dst[i + 2]) * w; dst[i + 3] += (ww - dst[i + 3]) * w;
  }
}

// 局部旋转左乘一个轴角（在父骨骼坐标系里转）
const _sq = new THREE.Quaternion(), _sq2 = new THREE.Quaternion(), _sv = new THREE.Vector3();
function soldierPreRot(Q, bi, ax, ay, az, ang) {
  if (Math.abs(ang) < 1e-5) return;
  _sv.set(ax, ay, az);
  _sq.setFromAxisAngle(_sv, ang);
  _sq2.set(Q[bi * 4], Q[bi * 4 + 1], Q[bi * 4 + 2], Q[bi * 4 + 3]);
  _sq2.premultiply(_sq);
  Q[bi * 4] = _sq2.x; Q[bi * 4 + 1] = _sq2.y; Q[bi * 4 + 2] = _sq2.z; Q[bi * 4 + 3] = _sq2.w;
}

// ---------------------------------------------------------------------------
// 双臂 IK：在模型坐标系里算出骨骼的世界姿态，把上臂 / 前臂甩到目标方向（保留原来的扭转）
// ---------------------------------------------------------------------------
const _ikW = [], _ikP = [];
for (let i = 0; i < 40; i++) { _ikW.push(new THREE.Quaternion()); _ikP.push(new THREE.Vector3()); }
const _iv1 = new THREE.Vector3(), _iv2 = new THREE.Vector3(), _iv3 = new THREE.Vector3(), _iv4 = new THREE.Vector3(), _iv5 = new THREE.Vector3();
const _iq = new THREE.Quaternion(), _iq2 = new THREE.Quaternion();
function soldierFK(rig, Q, pel) {
  // 每根骨骼在模型（root）坐标系里的旋转 / 关节位置
  const S = SOLDIER, par = S.A.par, r = S.rest;
  for (let i = 0; i < S.nb; i++) {
    const q = _ikW[i].set(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]).normalize();
    const p = par[i];
    if (p < 0) { _ikP[i].set(pel[0], pel[1], pel[2]); }
    else {
      _ikP[i].set(r[i * 3] - r[p * 3], r[i * 3 + 1] - r[p * 3 + 1], r[i * 3 + 2] - r[p * 3 + 2]).applyQuaternion(_ikW[p]).add(_ikP[p]);
      q.premultiply(_ikW[p]);
    }
  }
}
const SOLDIER_BONE_DIR = (() => {
  // 每根骨骼静止时（A 字姿势）从关节指向子关节的方向
  const S = SOLDIER, out = [];
  const child = { upperarm_l: "lowerarm_l", lowerarm_l: "hand_l", upperarm_r: "lowerarm_r", lowerarm_r: "hand_r" };
  for (const n in child) {
    const a = SB[n], b = SB[child[n]], r = S.rest;
    out[a] = new THREE.Vector3(r[b * 3] - r[a * 3], r[b * 3 + 1] - r[a * 3 + 1], r[b * 3 + 2] - r[a * 3 + 2]);
  }
  return out;
})();
function soldierSetWorldRot(Q, bi, worldQ) {
  // local = parentWorld^-1 * world
  const p = SOLDIER.A.par[bi];
  _iq2.copy(_ikW[p]).invert().multiply(worldQ);
  Q[bi * 4] = _iq2.x; Q[bi * 4 + 1] = _iq2.y; Q[bi * 4 + 2] = _iq2.z; Q[bi * 4 + 3] = _iq2.w;
  _ikW[bi].copy(worldQ);
}
const _hQ = new THREE.Quaternion();
function soldierArmIK(Q, side, target, pole) {
  const ua = SB["upperarm_" + side], la = SB["lowerarm_" + side], ha = SB["hand_" + side];
  const sh = _ikP[ua];
  const l1 = SOLDIER_BONE_DIR[ua].length(), l2 = SOLDIER_BONE_DIR[la].length();
  const toT = _iv1.subVectors(target, sh);
  let d = toT.length();
  d = Math.max(0.05, Math.min(l1 + l2 - 0.002, d));
  toT.normalize();
  // 肘的位置：在“肩-目标”连线和 pole 方向构成的平面里
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const a = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const pl = _iv2.copy(pole).addScaledVector(toT, -pole.dot(toT)).normalize();
  const upDir = _iv3.copy(toT).multiplyScalar(Math.cos(a)).addScaledVector(pl, Math.sin(a)).normalize();
  // 上臂：当前方向 → upDir
  const cur = _iv4.copy(SOLDIER_BONE_DIR[ua]).normalize().applyQuaternion(_ikW[ua]);
  _iq.setFromUnitVectors(cur, upDir);
  soldierSetWorldRot(Q, ua, _iq.multiply(_ikW[ua]));
  const elbow = _iv5.copy(sh).addScaledVector(upDir, l1);
  // 前臂：父骨骼刚改过，重新算它的世界旋转后再甩到 肘→目标
  _ikW[la].set(Q[la * 4], Q[la * 4 + 1], Q[la * 4 + 2], Q[la * 4 + 3]).normalize().premultiply(_ikW[ua]);
  const cur2 = _iv4.copy(SOLDIER_BONE_DIR[la]).normalize().applyQuaternion(_ikW[la]);
  const lowDir = _iv3.subVectors(target, elbow).normalize();
  _iq.setFromUnitVectors(cur2, lowDir);
  soldierSetWorldRot(Q, la, _iq.multiply(_ikW[la]));
  _ikW[ha].set(Q[ha * 4], Q[ha * 4 + 1], Q[ha * 4 + 2], Q[ha * 4 + 3]).normalize().premultiply(_ikW[la]);
}

// ---------------------------------------------------------------------------
// 摆姿势。st：{ air(0 地面 / 1 自由落体 / 2 开伞), speed, moveRel（移动方向相对朝向）, crouch, prone, armed, aim, ads, pitch,
//              action（"throw" / "heal" / "reload" / "swap" / "hit"）, actionT（0~1）, dead（倒地动画进度秒，<0 = 活着）,
//              gait（可选：回放里指定的步态相位） }
// ---------------------------------------------------------------------------
const _sgP = new THREE.Vector3(), _sgD = new THREE.Vector3(), _sgU = new THREE.Vector3(), _sgR = new THREE.Vector3();
const _sgQ = new THREE.Quaternion(), _sgM = new THREE.Matrix4(), _tR = new THREE.Vector3(), _tL = new THREE.Vector3();
const _poleR = new THREE.Vector3(), _poleL = new THREE.Vector3(), _sgP2 = new THREE.Vector3(), _sgD2 = new THREE.Vector3();
const SOLDIER_GAIT = [["Idle_Loop", 0], ["Walk_Loop", 1.4], ["Jog_Fwd_Loop", 4.2], ["Sprint_Loop", 8.2]];
function poseSoldier(rig, st, dt) {
  const S = SOLDIER, C = S.clips, Q = rig.Q, T = rig.T, nb = S.nb, pel = rig.pel;
  rig.idleT += dt; rig.crT += dt;
  // ---- 倒地 ----
  if (st.dead >= 0) {
    soldierSample(C.Death01, Math.min(st.dead * 1.4, C.Death01.dur), Q, pel);
    rig.gun.visible = false;
    if (rig.chute) rig.chute.visible = false;
    soldierApply(rig, Q, pel);
    return;
  }
  // ---- 空中 ----
  if (st.air) {
    soldierSample(C.Idle_Loop, rig.idleT, Q, pel);
    if (st.air === 1) {
      // 自由落体：脸朝下趴平，四肢张开
      soldierPreRot(Q, SB.pelvis, 1, 0, 0, 1.35);
      soldierPreRot(Q, SB.upperarm_l, 0, 0, 1, 0.95); soldierPreRot(Q, SB.upperarm_r, 0, 0, 1, -0.95);
      soldierPreRot(Q, SB.upperarm_l, 1, 0, 0, -0.35); soldierPreRot(Q, SB.upperarm_r, 1, 0, 0, -0.35);
      soldierPreRot(Q, SB.lowerarm_l, 0, 1, 0, 0.9); soldierPreRot(Q, SB.lowerarm_r, 0, 1, 0, -0.9);
      soldierPreRot(Q, SB.thigh_l, 0, 0, 1, 0.22); soldierPreRot(Q, SB.thigh_r, 0, 0, 1, -0.22);
      soldierPreRot(Q, SB.calf_l, 1, 0, 0, -0.8); soldierPreRot(Q, SB.calf_r, 1, 0, 0, -0.65);
      soldierPreRot(Q, SB.head, 1, 0, 0, -0.55);
      pel[1] += 0.25;
    } else {
      // 开伞：双手举过头顶拉操纵绳，双腿自然下垂微微晃
      soldierPreRot(Q, SB.upperarm_l, 0, 0, 1, 2.0); soldierPreRot(Q, SB.upperarm_r, 0, 0, 1, -2.0);
      soldierPreRot(Q, SB.upperarm_l, 1, 0, 0, -0.35); soldierPreRot(Q, SB.upperarm_r, 1, 0, 0, -0.35);
      soldierPreRot(Q, SB.lowerarm_l, 0, 0, 1, 0.6); soldierPreRot(Q, SB.lowerarm_r, 0, 0, 1, -0.6);
      const sw = Math.sin(rig.idleT * 1.7) * 0.08;
      soldierPreRot(Q, SB.thigh_l, 1, 0, 0, -0.18 + sw); soldierPreRot(Q, SB.thigh_r, 1, 0, 0, -0.1 - sw);
      soldierPreRot(Q, SB.calf_l, 1, 0, 0, 0.25); soldierPreRot(Q, SB.calf_r, 1, 0, 0, 0.3);
    }
    rig.gun.visible = false;
    if (rig.chute) rig.chute.visible = st.air === 2;
    soldierApply(rig, Q, pel);
    return;
  }
  if (rig.chute) rig.chute.visible = false;

  // ---- 下半身：按速度混合 站 / 走 / 跑 / 冲刺，或 蹲 / 蹲走 ----
  const spd = st.speed || 0;
  const moving = spd > 0.25;
  // 横移 / 后退：腿转向移动方向，后退时动作倒放
  let rel = moving ? (st.moveRel || 0) : 0;
  let back = 0;
  if (Math.abs(rel) > 1.75) { back = 1; rel = rel > 0 ? rel - Math.PI : rel + Math.PI; }
  rel = Math.max(-1.25, Math.min(1.25, rel));
  const k = Math.min(1, dt * 8);
  rig.legYaw += (rel - rig.legYaw) * k;
  rig.back += (back - rig.back) * Math.min(1, dt * 10);
  // 步态相位：按速度 / 步长推进（四个动作同相位，互相混合时脚步对得上）
  let stride = 0, wsum = 0;
  const gw = [0, 0, 0, 0];
  for (let i = 1; i < 4; i++) {
    const s0 = SOLDIER_GAIT[i - 1][1], s1 = SOLDIER_GAIT[i][1];
    if (spd >= s0 && spd <= s1) { const u = (spd - s0) / (s1 - s0); gw[i - 1] = 1 - u; gw[i] = u; }
  }
  if (spd > SOLDIER_GAIT[3][1]) gw[3] = 1;
  for (let i = 1; i < 4; i++) { const c = C[SOLDIER_GAIT[i][0]]; stride += gw[i] * c.speed * c.dur; wsum += gw[i]; }
  if (wsum > 0) stride /= wsum;
  if (st.gait !== undefined) rig.gait = st.gait;
  else if (stride > 0) rig.gait = (rig.gait + (back ? -1 : 1) * spd * dt / stride + 1) % 1;
  // 站姿
  soldierSample(C.Idle_Loop, rig.idleT, Q, pel);
  let accW = gw[0] > 0 ? gw[0] : 0;
  for (let i = 1; i < 4; i++) {
    if (gw[i] <= 0.001) continue;
    const c = C[SOLDIER_GAIT[i][0]];
    soldierSample(c, rig.gait * c.dur, T, rig.pel2);
    accW += gw[i];
    const w = gw[i] / Math.max(1e-4, accW);
    soldierBlend(Q, T, w);
    for (let j = 0; j < 3; j++) pel[j] += (rig.pel2[j] - pel[j]) * w;
  }
  // 蹲姿
  const cr = st.crouch || 0;
  if (cr > 0.01) {
    const cf = C.Crouch_Fwd_Loop, ci = C.Crouch_Idle_Loop;
    const cm = Math.min(1, spd / 1.0);
    soldierSample(ci, rig.crT, T, rig.pel2);
    if (cm > 0.01) {
      soldierSample(cf, rig.gait * cf.dur, rig.U, _crP);
      soldierBlend(T, rig.U, cm);
      for (let j = 0; j < 3; j++) rig.pel2[j] += (_crP[j] - rig.pel2[j]) * cm;
    }
    soldierBlend(Q, T, cr);
    for (let j = 0; j < 3; j++) pel[j] += (rig.pel2[j] - pel[j]) * cr;
  }
  // 腿朝移动方向转，上半身转回来
  const ly = rig.legYaw;
  soldierPreRot(Q, SB.pelvis, 0, 1, 0, ly);
  soldierPreRot(Q, SB.spine_01, 0, 1, 0, -ly * 0.4);
  soldierPreRot(Q, SB.spine_02, 0, 1, 0, -ly * 0.3);
  soldierPreRot(Q, SB.spine_03, 0, 1, 0, -ly * 0.3);

  // ---- 趴下（只有回放里的玩家会趴）：整个人放平，腿伸直 ----
  const pr = st.prone || 0;
  if (pr > 0.01) {
    soldierSample(C.Idle_Loop, 0, T, null);
    soldierBlend(Q, T, pr);
    soldierPreRot(Q, SB.pelvis, 1, 0, 0, 1.5 * pr);
    soldierPreRot(Q, SB.head, 1, 0, 0, -1.1 * pr);
    soldierPreRot(Q, SB.neck_01, 1, 0, 0, -0.3 * pr);
    pel[1] += (0.18 - pel[1]) * pr;
  }

  // ---- 上半身：特殊动作（扔雷 / 打药 / 中弹）用动捕片段覆盖 ----
  const act = st.action, at = st.actionT || 0;
  let actW = 0, actClip = null, actTime = 0;
  if (act === "throw") { actClip = C.OverhandThrow; actTime = (0.2 + at * 0.6) * actClip.dur; actW = Math.min(1, at * 6, (1 - at) * 6 + 0.3); }
  else if (act === "heal") { actClip = C.Consume; actTime = (rig.idleT % actClip.dur); actW = 1; }
  else if (act === "hit") { actClip = C.Hit_Chest; actTime = at * actClip.dur; actW = Math.sin(at * Math.PI) * 0.8; }

  // ---- 拿枪：瞄准方向俯仰分到腰背 / 脖子，双手用 IK 握在枪上 ----
  const armed = st.armed && act !== "throw" && act !== "heal" && pr < 0.5;
  const aim = st.aim || 0, ads = (st.ads || 0) * aim, pitch = Math.max(-1.1, Math.min(1.1, st.pitch || 0));
  if (armed) {
    // 举枪时腰背稳住，不跟着跑步大幅摆动
    soldierSample(C.Idle_Loop, 0.4, T, null);
    soldierBlend(Q, T, 0.55 * aim + 0.25, SOLDIER_UPPER);
    const pa = -pitch * aim;
    soldierPreRot(Q, SB.spine_01, 1, 0, 0, pa * 0.3 + 0.05 * aim);
    soldierPreRot(Q, SB.spine_02, 1, 0, 0, pa * 0.3);
    soldierPreRot(Q, SB.spine_03, 1, 0, 0, pa * 0.25);
    soldierPreRot(Q, SB.neck_01, 1, 0, 0, pa * 0.15);
    soldierPreRot(Q, SB.head, 0, 0, 1, -0.16 * ads);
  }
  if (actClip && actW > 0) {
    soldierSample(actClip, actTime, T, null);
    soldierBlend(Q, T, actW, SOLDIER_UPPER);
  }
  rig.gun.visible = !!st.armed && rig.gunType !== null && act !== "throw" && act !== "heal" && !(act === "swap" && at > 0.35 && at < 0.65);
  if (armed && rig.gunType) {
    soldierFK(rig, Q, pel);
    const shR = _ikP[SB.upperarm_r], shL = _ikP[SB.upperarm_l], neck = _ikP[SB.neck_01];
    // 瞄准方向（模型坐标，面朝 +Z）；腰射 / 开镜：枪托抵右肩，开镜时枪抬到眼前
    const fwdYaw = 0; // 上半身已朝正前方
    _sgD.set(Math.sin(fwdYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(fwdYaw) * Math.cos(pitch));
    _sgP.set(shR.x * 0.55 + neck.x * 0.45 - 0.01 * ads, shR.y - 0.03 + 0.07 * ads, shR.z + 0.03);
    // 放低戒备（没在瞄）：枪口朝前下方、略偏左，托在右胸前
    _sgD2.set(0.28, -0.55, 0.8).normalize();
    _sgP2.set(shR.x * 0.7 + neck.x * 0.3 + 0.02, shR.y - 0.13, shR.z + 0.06);
    _sgD.lerpVectors(_sgD2, _sgD, aim).normalize();
    _sgP.lerpVectors(_sgP2, _sgP, aim);
    // 换弹：枪口压低一点
    if (act === "reload") { _sgD.y -= 0.25 * Math.sin(at * Math.PI); _sgD.normalize(); }
    _sgU.set(0, 1, 0); _sgR.crossVectors(_sgU, _sgD).normalize(); _sgU.crossVectors(_sgD, _sgR).normalize();
    _sgM.makeBasis(_sgR, _sgU, _sgD);
    rig.gun.quaternion.setFromRotationMatrix(_sgM);
    rig.gun.position.copy(_sgP);
    const spec = SOLDIER.GUN_SPECS[rig.gunType];
    // 右手握把，左手托护木（换弹时左手去拿弹匣）
    _tR.copy(_sgP).addScaledVector(_sgD, spec.grip).addScaledVector(_sgU, -0.075).addScaledVector(_sgR, 0.012);
    let fore = spec.fore;
    let down = -0.04;
    if (act === "reload") { const r = Math.sin(at * Math.PI); fore += (spec.grip + 0.12 - fore) * r; down -= 0.14 * r; }
    _tL.copy(_sgP).addScaledVector(_sgD, fore).addScaledVector(_sgU, down - 0.05).addScaledVector(_sgR, 0.012);
    _poleR.set(-0.75, -0.6, -0.2); _poleL.set(0.6, -0.8, 0.0);
    soldierArmIK(Q, "r", _tR, _poleR);
    soldierArmIK(Q, "l", _tL, _poleL);
    // 手掌朝向：取动捕“双手握枪”姿势里两只手相对瞄准方向的角度，套到步枪上
    // （右手握住握把、左手托住前面），不再是前臂顺下来的随意角度
    _hQ.setFromRotationMatrix(_sgM);
    soldierSetWorldRot(Q, SB.hand_r, _hd3.copy(_hQ).multiply(SOLDIER_GRIP.r));
    if (act !== "reload") soldierSetWorldRot(Q, SB.hand_l, _hd3.copy(_hQ).multiply(SOLDIER_GRIP.l));
  }
  soldierApply(rig, Q, pel);
}
const _crP = new Float32Array(3);
const _hd3 = new THREE.Quaternion();
// 动捕“双手握枪”待机姿势第一帧里两只手的朝向（模型坐标，人面朝 +Z、枪口朝前）
const SOLDIER_GRIP = (() => {
  const Q = new Float32Array(SOLDIER.nb * 4), P = new Float32Array(3);
  soldierSample(SOLDIER.clips.Pistol_Idle_Loop, 0, Q, P);
  soldierFK(null, Q, P);
  // 左手：右手握把姿势左右镜像（像握前握把一样握在护木下面）
  const r = _ikW[SB.hand_r].clone();
  return { r, l: new THREE.Quaternion(r.x, -r.y, -r.z, r.w) };
})();

function soldierApply(rig, Q, pel) {
  const b = rig.bones, nb = SOLDIER.nb;
  for (let i = 0; i < nb; i++) {
    const q = b[i].quaternion;
    q.set(Q[i * 4], Q[i * 4 + 1], Q[i * 4 + 2], Q[i * 4 + 3]).normalize();
  }
  b[0].position.set(pel[0], pel[1], pel[2]);
}

// 远近换模型（近处高模、远处简模）
function soldierLOD(rig, dist) {
  const lod = dist < SOLDIER_LOD_DIST[0] ? 0 : (dist < SOLDIER_LOD_DIST[1] ? 1 : 2);
  if (lod !== rig.lod) {
    rig.lods[rig.lod].visible = false;
    rig.lods[lod].visible = true;
    rig.lod = lod;
  }
}

// ---------------------------------------------------------------------------
// 每帧：相机位置 / 视锥（远处、屏幕外的士兵少算几次动作），按距离换模型
// ---------------------------------------------------------------------------
const soldierCam = { pos: new THREE.Vector3(), frustum: new THREE.Frustum(), m: new THREE.Matrix4(), sph: new THREE.Sphere() };
function soldierFrameBegin() {
  camera.getWorldPosition(soldierCam.pos);
  soldierCam.m.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  soldierCam.frustum.setFromProjectionMatrix(soldierCam.m);
}
function soldierDrive(rig, st, dt) {
  const p = rig.root.position;
  const d = p.distanceTo(soldierCam.pos);
  soldierLOD(rig, d);
  rig.acc += dt;
  rig.frame++;
  const every = d < 50 ? 1 : (d < 140 ? 2 : (d < 300 ? 3 : 5));
  if (rig.posed && rig.frame % every !== 0) return;
  soldierCam.sph.center.set(p.x, p.y + 0.9, p.z); soldierCam.sph.radius = 1.6;
  if (rig.posed && d > 25 && !soldierCam.frustum.intersectsSphere(soldierCam.sph)) return; // 屏幕外：不算
  poseSoldier(rig, st, Math.min(0.25, rig.acc));
  rig.acc = 0; rig.posed = true;
}

// 中枪倒地：播放倒地动作，约 2.4 秒后人消失（只剩死亡盒）
const soldierDying = [];
function soldierDie(rig) {
  rig.st.dead = 0;
  rig.gun.visible = false;
  soldierDying.push(rig);
}
function updateSoldierDying(dt) {
  for (let i = soldierDying.length - 1; i >= 0; i--) {
    const rig = soldierDying[i];
    rig.st.dead += dt;
    soldierLOD(rig, rig.root.position.distanceTo(soldierCam.pos));
    poseSoldier(rig, rig.st, dt);
    if (rig.st.dead > 2.4) { rig.root.visible = false; soldierDying.splice(i, 1); }
  }
}
