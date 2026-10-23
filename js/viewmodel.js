// viewmodel.js：第一人称枪械模型
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const fpGunGroup = new THREE.Group();
camera.add(fpGunGroup);
let muzzleFlashMesh;

const WOOD_GUNS = ["akm", "kar98k", "s1897", "s686", "sks", "dragunov", "dp28", "mini14"];
const _limbUp = new THREE.Vector3(0, 0, 1);

function rebuildFPGunModel() {
  // 清理旧枪模并释放显存（原版切枪会不断泄漏几何体与材质）
  while (fpGunGroup.children.length > 0) {
    const old = fpGunGroup.children[0];
    fpGunGroup.remove(old);
    old.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
  const activeWep = player.weapons[player.activeSlot];
  if (!activeWep || player.phase !== "ground") return;

  const wData = WEAPONS_DATA[activeWep.id];
  const type = wData.type;
  const isWood = WOOD_GUNS.includes(wData.id);
  const matMain = new THREE.MeshPhongMaterial({ color: wData.color || 0x2c2f33, specular: isWood ? 0x1c1a18 : 0x4a4f55, shininess: isWood ? 14 : 46 });
  const matDark = new THREE.MeshPhongMaterial({ color: 0x17191b, specular: 0x5a5f66, shininess: 60 });
  const matGlove = new THREE.MeshLambertMaterial({ color: 0x1f211e });
  const matSleeve = new THREE.MeshLambertMaterial({ color: 0x4b5338 });

  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.x = rx;
    fpGunGroup.add(m);
    return m;
  };
  const addLimb = (from, to, thick, mat) => {
    const dir = to.clone().sub(from);
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, dir.length()), mat);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(_limbUp, dir.normalize());
    fpGunGroup.add(m);
    return m;
  };

  const longGun = type === "SR" || type === "DMR";
  const barrelLen = longGun ? 0.6 : (type === "SMG" ? 0.3 : (type === "SG" ? 0.5 : 0.46));
  const barrelZ = -0.19 - barrelLen / 2;
  const muzzleZ = barrelZ - barrelLen / 2;

  // 机匣 + 上导轨
  add(new THREE.BoxGeometry(0.074, 0.105, 0.42), matMain, 0, 0, -0.02);
  add(new THREE.BoxGeometry(0.05, 0.022, 0.34), matDark, 0, 0.062, -0.04);
  // 护木 / 泵动握把 / 长木托
  if (type === "SG") {
    add(new THREE.BoxGeometry(0.06, 0.06, 0.18), matMain, 0, -0.03, -0.36);
  } else if (type === "SR") {
    add(new THREE.BoxGeometry(0.068, 0.07, 0.42), matMain, 0, -0.012, -0.38);
  } else {
    add(new THREE.BoxGeometry(0.066, 0.078, 0.24), isWood ? matMain : matDark, 0, 0.004, -0.33);
  }
  // 枪管（S686 双管）
  if (wData.id === "s686") {
    add(new THREE.CylinderGeometry(0.017, 0.017, barrelLen, 10), matDark, -0.018, 0.022, barrelZ, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.017, 0.017, barrelLen, 10), matDark, 0.018, 0.022, barrelZ, Math.PI / 2);
  } else {
    add(new THREE.CylinderGeometry(0.014, 0.017, barrelLen, 10), matDark, 0, 0.022, barrelZ, Math.PI / 2);
  }
  // 准星 / 照门
  add(new THREE.BoxGeometry(0.01, 0.04, 0.01), matDark, 0, 0.06, muzzleZ + 0.05);
  add(new THREE.BoxGeometry(0.034, 0.024, 0.02), matDark, 0, 0.083, 0.1);
  // 弹匣
  const hasExt = activeWep.attachments.mag === "ext_mag";
  if (wData.id === "dp28") {
    add(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 18), matDark, 0, 0.1, -0.06);
  } else if (type === "LMG") {
    add(new THREE.BoxGeometry(0.1, 0.11, 0.12), matDark, 0.03, -0.1, -0.08);
  } else if (type === "AR" || type === "SMG" || type === "DMR" || (type === "SR" && wData.id !== "kar98k")) {
    const magH = (type === "SR" ? 0.08 : 0.16) * (hasExt ? 1.35 : 1);
    add(new THREE.BoxGeometry(0.048, magH, 0.085), matDark, 0, -0.05 - magH / 2, -0.11, wData.ironType === "ak" ? 0.28 : 0.14);
  }
  // 握把与枪托
  if (isWood && (type === "SR" || type === "SG" || type === "DMR")) {
    add(new THREE.BoxGeometry(0.058, 0.11, 0.34), matMain, 0, -0.05, 0.32, -0.1);
  } else {
    add(new THREE.BoxGeometry(0.042, 0.11, 0.055), matDark, 0, -0.1, 0.1, -0.35);
    add(new THREE.BoxGeometry(0.055, 0.09, 0.22), isWood ? matMain : matDark, 0, -0.03, 0.3);
  }

  if (activeWep.attachments.muzzle || activeWep.attachments.sg_muzzle) {
    const mz = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.12, 10), matDark);
    mz.rotation.x = Math.PI / 2; mz.position.set(0, 0.022, muzzleZ - 0.05);
    fpGunGroup.add(mz);
  }
  if (activeWep.attachments.grip) {
    const gr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.04), matDark);
    gr.position.set(0, -0.09, -0.3);
    fpGunGroup.add(gr);
  }
  if (activeWep.attachments.scope) {
    const big = ["3x", "4x", "6x", "8x"].includes(activeWep.attachments.scope);
    add(new THREE.CylinderGeometry(big ? 0.03 : 0.024, big ? 0.03 : 0.024, big ? 0.22 : 0.12, 14), matDark, 0, 0.105, -0.03, Math.PI / 2);
    add(new THREE.BoxGeometry(0.03, 0.03, 0.05), matDark, 0, 0.08, -0.03);
    add(new THREE.CircleGeometry(big ? 0.022 : 0.017, 14),
      new THREE.MeshBasicMaterial({ color: 0x1d3446 }), 0, 0.105, -0.03 + (big ? 0.111 : 0.061));
  }

  // 双手持枪（手套 + 袖子），让第一人称更有端游质感
  const rHand = new THREE.Vector3(0.012, -0.12, 0.12);
  const lHand = new THREE.Vector3(-0.012, -0.06, type === "SG" ? -0.36 : -0.32);
  addLimb(rHand, new THREE.Vector3(0.06, -0.2, 0.26), 0.07, matGlove);
  addLimb(new THREE.Vector3(0.06, -0.2, 0.26), new THREE.Vector3(0.2, -0.38, 0.62), 0.095, matSleeve);
  addLimb(lHand, new THREE.Vector3(-0.07, -0.14, -0.22), 0.068, matGlove);
  addLimb(new THREE.Vector3(-0.07, -0.14, -0.22), new THREE.Vector3(-0.3, -0.36, 0.08), 0.092, matSleeve);

  // 枪口火焰：加法混合的星芒精灵
  const flashMat = new THREE.SpriteMaterial({ map: flashTex, color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  muzzleFlashMesh = new THREE.Sprite(flashMat);
  muzzleFlashMesh.scale.setScalar(0.3);
  muzzleFlashMesh.position.set(0, 0.022, muzzleZ - (activeWep.attachments.muzzle ? 0.16 : 0.08));
  fpGunGroup.add(muzzleFlashMesh);

  // 第一人称模型只在第二遍（图层1）渲染，并且先清深度 → 贴墙也不会穿模
  fpGunGroup.traverse(o => { o.layers.set(1); });
  fpGunGroup.position.set(0.24, -0.22, -0.48);
}
