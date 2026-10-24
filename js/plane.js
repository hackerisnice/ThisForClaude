// plane.js：运输机、随机航线、空投
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// 开局跳伞运输机
const planeGroup = new THREE.Group();
{
  // 运输机外观：圆形机身 + 机头机尾 + 四发螺旋桨引擎 + 尾翼（合并成单个网格，1 次绘制）
  const parts = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x59625c });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2c312e });
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x48504b });
  const addPart = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; parts.add(m);
  };
  addPart(new THREE.CylinderGeometry(2.4, 2.4, 22, 16), bodyMat, 0, 0, 0, Math.PI / 2);
  addPart(new THREE.CylinderGeometry(0.9, 2.4, 4.5, 16), bodyMat, 0, -0.2, 13.2, Math.PI / 2);
  addPart(new THREE.CylinderGeometry(2.4, 0.7, 7, 16), bodyMat, 0, 0.7, -14.5, Math.PI / 2);
  addPart(new THREE.BoxGeometry(2.4, 0.7, 1.2), darkMat, 0, 1.25, 13.6);
  addPart(new THREE.BoxGeometry(34, 0.5, 4.5), wingMat, 0, 1.2, 1.5);
  [-11, -6, 6, 11].forEach(ex => {
    addPart(new THREE.CylinderGeometry(0.75, 0.6, 3.4, 10), darkMat, ex, 0.6, 3.6, Math.PI / 2);
    addPart(new THREE.BoxGeometry(3.2, 0.12, 0.25), darkMat, ex, 0.6, 5.35);
  });
  addPart(new THREE.BoxGeometry(0.45, 5.2, 3.6), wingMat, 0, 3.6, -16.2);
  addPart(new THREE.BoxGeometry(11, 0.35, 2.6), wingMat, 0, 1.6, -16.6);
  const planeMesh = new THREE.Mesh(mergeColoredParts(parts), lootMergedMat);
  planeGroup.add(planeMesh);
}
// 航线：每局随机方向、随机偏离中心，横穿整张地图（端游同款），飞行高度 300 米
const PLANE_ALT = 300;
const PLANE_SPEED = 85;
const flightPath = { sx: 0, sz: 0, dx: 1, dz: 0, len: 1, travel: 0 };
(function planFlightPath() {
  const ang = Math.random() * Math.PI * 2;
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const off = (Math.random() - 0.5) * 900;
  const ox = -dz * off, oz = dx * off;
  const half = MAP_SIZE / 2 - 100;
  let t0 = -Infinity, t1 = Infinity;
  [[ox, dx], [oz, dz]].forEach(([o, d]) => {
    if (Math.abs(d) < 1e-6) return;
    const a = (-half - o) / d, b = (half - o) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  });
  flightPath.sx = ox + dx * t0; flightPath.sz = oz + dz * t0;
  flightPath.dx = dx; flightPath.dz = dz;
  flightPath.len = t1 - t0;
})();
function flightPointAt(s) {
  return { x: flightPath.sx + flightPath.dx * s, z: flightPath.sz + flightPath.dz * s };
}
planeGroup.position.set(flightPath.sx, PLANE_ALT, flightPath.sz);
planeGroup.lookAt(flightPath.sx + flightPath.dx * 50, PLANE_ALT, flightPath.sz + flightPath.dz * 50);
scene.add(planeGroup);

// ============================================================================
// 4. 空投补给系统
// ============================================================================
const airdrops = [];
let nextAirdropTime = 80;

function spawnAirdropEvent() {
  // 落点避开房顶和河面（落在楼顶上谁都拿不到）
  let dropX = 0, dropZ = 0;
  for (let tries = 0; tries < 20; tries++) {
    dropX = zoneState.cx + (Math.random() - 0.5) * zoneState.targetR * 1.1;
    dropZ = zoneState.cz + (Math.random() - 0.5) * zoneState.targetR * 1.1;
    dropX = Math.max(-MAP_LIMIT + 30, Math.min(MAP_LIMIT - 30, dropX));
    dropZ = Math.max(-MAP_LIMIT + 30, Math.min(MAP_LIMIT - 30, dropZ));
    if (!getBuildingContainingPoint(dropX, dropZ, 4) && Math.abs(dropZ - RIVER_Z) > RIVER_HALF + 6 && !isPointBlocked2D(dropX, dropZ, 2.5, 0)) break;
  }
  const landY = getGroundHeight(dropX, dropZ, 1e9);

  const crateGroup = new THREE.Group();
  const redBox = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), new THREE.MeshLambertMaterial({ color: 0xb81d13 }));
  redBox.position.y = 0.55;
  const blueTarp = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.35, 1.46), new THREE.MeshLambertMaterial({ color: 0x1a4b8c }));
  blueTarp.position.y = 0.95;

  const chute = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: chuteTex, side: THREE.DoubleSide })
  );
  chute.position.y = 5.5;
  crateGroup.add(redBox, blueTarp, chute);
  crateGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
  crateGroup.position.set(dropX, 165, dropZ);
  scene.add(crateGroup);

  // 红色信号烟：柔边粒子精灵（比实心小球真实得多，且始终面向镜头）
  const smokeParticles = [];
  for (let i = 0; i < 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDotTex, color: 0xff3a22, transparent: true, opacity: 0, depthWrite: false
    }));
    sp.scale.setScalar(1.8 + Math.random() * 1.4);
    sp.position.set(dropX, landY + 1.2 + i * 0.9, dropZ);
    scene.add(sp);
    smokeParticles.push(sp);
  }

  airdrops.push({
    x: dropX, z: dropZ, landY,
    crateGroup, chute, smokeParticles,
    landed: false,
    smokeEndTime: 0,
    lootEntries: null // 落地后生成的物资（AI 据此判断空投还有没有东西）
  });

  showToast("✈️ 空投补给箱已投放在安全区附近，注意抬头查看红色浓烟！");
}

// 返回这次生成的全部物资条目
function populateAirdropLoot(ax, az, ay = 0) {
  const first = worldLootItems.length;
  const airdropWeps = ["awm", "amr", "aug", "mk14", "m249"];
  const wKey = airdropWeps[Math.floor(Math.random() * airdropWeps.length)];
  const wep = WEAPONS_DATA[wKey];

  spawnRandomGroundLoot(ax + 0.9, az, {
    kind: "weapon", id: wKey, name: `🔥${wep.name}`, ammoInMag: wep.mag, attachments: {}
 }, ay);
  spawnRandomGroundLoot(ax + 1.3, az + 0.5, {
    kind: "ammo", id: wep.ammoType, name: `${wep.ammoType} 子弹`, count: wep.ammoType === ".50BMG" ? 20 : 60
 }, ay);
  spawnRandomGroundLoot(ax - 0.9, az + 0.4, {
    kind: "gear", sub: "helm", name: "🔥3级头盔", lv: 3, dur: 240, maxDur: 240
 }, ay);
  spawnRandomGroundLoot(ax - 0.9, az - 0.4, {
    kind: "gear", sub: "vest", name: "🔥3级防弹衣", lv: 3, dur: 300, maxDur: 300
 }, ay);
  spawnRandomGroundLoot(ax, az + 1.0, {
    kind: "attachment", id: "8x", name: ATTACHMENTS_DATA["8x"].name, slot: "scope"
 }, ay);
  spawnRandomGroundLoot(ax, az - 1.0, {
    kind: "med", id: "adrenaline", name: MEDS_DATA["adrenaline"].name, count: 1
 }, ay);
  const entries = worldLootItems.slice(first);
  entries.forEach(e => { e.item.airdrop = true; });
  return entries;
}
