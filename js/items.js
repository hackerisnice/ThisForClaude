// items.js：地面物资模型与随机刷新
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ---------------------------------------------------------------------------
// 3.13 物资模型与刷新
// ---------------------------------------------------------------------------
// 物资模型：零件合并成一个带顶点色的网格，同类物资共享几何体与材质
// （原版每个物资新建 3~5 个网格+材质且拾取后从不释放，会持续占用显存）
const lootMergedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const lootGeoCache = new Map();

function mergeColoredParts(group) {
  group.updateMatrixWorld(true);
  const pos = [], nor = [], col = [];
  const c = new THREE.Color(), p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  group.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    nm.getNormalMatrix(o.matrixWorld);
    c.copy(o.material.color);
    for (let i = 0; i < g.attributes.position.count; i++) {
      p.fromBufferAttribute(g.attributes.position, i).applyMatrix4(o.matrixWorld);
      n.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
    }
    if (g !== o.geometry) g.dispose();
    o.geometry.dispose();
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  merged.computeBoundingSphere();
  return merged;
}

function createDetailedLootMesh(item) {
  const group = new THREE.Group();
  const cacheKey = `${item.kind}:${item.id || ""}:${item.sub || ""}:${item.lv || ""}`;
  let geo = lootGeoCache.get(cacheKey);
  if (!geo) {
    geo = mergeColoredParts(buildLootPartsGroup(item));
    lootGeoCache.set(cacheKey, geo);
  }
  group.add(new THREE.Mesh(geo, lootMergedMat));
  if (item.kind === "weapon") group.rotation.y = Math.random() * Math.PI * 2;
  return group;
}

// 投掷物外观（地面物资、手里、飞行中共用）
function buildThrowablePartsGroup(id) {
  const group = new THREE.Group();
  const td = THROWABLES_DATA[id];
  const body = new THREE.MeshLambertMaterial({ color: td.color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1b1d1f });
  if (id === "frag") {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), body));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.05, 8), dark);
    top.position.y = 0.08;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.03), dark);
    lever.position.set(0.04, 0.04, 0);
    group.add(top, lever);
  } else if (id === "molotov") {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 10), body));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.04, 0.08, 8), body);
    neck.position.y = 0.11;
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), new THREE.MeshLambertMaterial({ color: 0xd9c9a3 }));
    rag.position.y = 0.17;
    group.add(neck, rag);
  } else {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.15, 10), body));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), new THREE.MeshLambertMaterial({ color: id === "smoke" ? 0xe8e8e8 : 0xd8c040 }));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.04, 8), dark);
    top.position.y = 0.095;
    group.add(band, top);
  }
  return group;
}

function buildLootPartsGroup(item) {
  const group = new THREE.Group();

  if (item.kind === "weapon") {
    const wData = WEAPONS_DATA[item.id] || {};
    const gunMat = new THREE.MeshLambertMaterial({ color: wData.color || 0x2c2f33 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x141618 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.68), gunMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), darkMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.45);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.10), darkMat);
    mag.position.set(0, -0.14, -0.05); mag.rotation.x = 0.25;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.28), gunMat);
    stock.position.set(0, -0.02, 0.42);
    const body = new THREE.Group();
    body.add(receiver, barrel, mag, stock);
    body.rotation.z = Math.PI / 2;
    // 地面橙色光圈（原版光圈被枪身旋转带成了竖直的，这里修正为平铺在地面，并与枪身合并为一次绘制）
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.46, 20), new THREE.MeshLambertMaterial({ color: 0xffa500 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.1;
    group.add(body, ring);
  } else if (item.kind === "throwable") {
    const g = buildThrowablePartsGroup(item.id);
    g.scale.setScalar(1.6);
    g.position.y = -0.02;
    group.add(g);
  } else if (item.kind === "ammo") {
    const boxCols = { "5.56mm": 0x3b7a38, "7.62mm": 0x8f5629, "9mm": 0xb8860b, ".45ACP": 0x465b6e, "12Gauge": 0xa82820, ".50BMG": 0x8b0000 };
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.20, 0.24), new THREE.MeshLambertMaterial({ color: boxCols[item.id] || 0xcca300 }));
    const brass = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.25), new THREE.MeshLambertMaterial({ color: 0xffcc33 }));
    brass.position.y = 0.08;
    group.add(box, brass);
  } else if (item.kind === "med") {
    if (item.id === "drink" || item.id === "painkiller") {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.30, 10), new THREE.MeshLambertMaterial({ color: item.id === "drink" ? 0x1e66d0 : 0xe67e22 }));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.04, 10), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      top.position.y = 0.16;
      group.add(can, top);
    } else {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.30), new THREE.MeshLambertMaterial({ color: item.id === "medkit" ? 0x26734d : 0xeeeeee }));
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.18), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      cross1.position.y = 0.095; cross2.position.y = 0.095;
      group.add(bag, cross1, cross2);
    }
  } else if (item.kind === "attachment") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.30), new THREE.MeshLambertMaterial({ color: 0x22262b }));
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 10), new THREE.MeshLambertMaterial({ color: 0x00b8e6 }));
    tube.rotation.x = Math.PI / 2; tube.position.y = 0.09;
    group.add(base, tube);
  } else if (item.kind === "gear") {
    const lvColors = { 1: 0x7d8778, 2: 0x4b5746, 3: 0x26282a };
    const col = lvColors[item.lv] || 0x666666;
    if (item.sub === "helm") {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), new THREE.MeshLambertMaterial({ color: col }));
      if (item.lv === 3) {
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.14, 0.12), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        visor.position.set(0, 0.06, 0.18);
        group.add(visor);
      }
      group.add(dome);
    } else if (item.sub === "vest") {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.22), new THREE.MeshLambertMaterial({ color: col }));
      group.add(torso);
    } else {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.26), new THREE.MeshLambertMaterial({ color: col }));
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.10), new THREE.MeshLambertMaterial({ color: 0x3b352c }));
      pouch.position.set(0, -0.05, 0.16);
      group.add(pack, pouch);
    }
  }

  return group;
}

// y = 物资所在表面的高度（地面 0、楼层地板、屋顶等）
function spawnRandomGroundLoot(x, z, forcedItem = null, y = 0) {
  let item = forcedItem;
  if (!item) {
    const r = Math.random();
    if (r < 0.34) {
      const wKeys = Object.keys(WEAPONS_DATA).filter(k => !WEAPONS_DATA[k].airdropOnly);
      const wKey = wKeys[Math.floor(Math.random() * wKeys.length)];
      const wep = WEAPONS_DATA[wKey];
      item = { kind: "weapon", id: wKey, name: wep.name, ammoInMag: wep.mag, attachments: {} };
      spawnRandomGroundLoot(x + 0.65, z + 0.45, {
        kind: "ammo", id: wep.ammoType, name: `${wep.ammoType} 子弹`, count: wep.type === "SG" ? 15 : 40
      }, y);
    } else if (r < 0.60) {
      const aKeys = Object.keys(ATTACHMENTS_DATA);
      const aKey = aKeys[Math.floor(Math.random() * aKeys.length)];
      const att = ATTACHMENTS_DATA[aKey];
      item = { kind: "attachment", id: aKey, name: att.name, slot: att.slot };
    } else if (r < 0.78) {
      const mKeys = Object.keys(MEDS_DATA);
      const mKey = mKeys[Math.floor(Math.random() * mKeys.length)];
      item = { kind: "med", id: mKey, name: MEDS_DATA[mKey].name, count: 1 };
    } else if (r < 0.88) {
      const tr = Math.random();
      const tKey = tr < 0.4 ? "frag" : (tr < 0.65 ? "smoke" : (tr < 0.85 ? "stun" : "molotov"));
      item = { kind: "throwable", id: tKey, name: THROWABLES_DATA[tKey].name, count: 1 };
    } else {
      const lv = Math.random() < 0.18 ? 3 : (Math.random() < 0.55 ? 2 : 1);
      const gearTypes = [
        { sub: "helm", name: `${lv}级头盔`, lv, maxDur: lv * 80 },
        { sub: "vest", name: `${lv}级防弹衣`, lv, maxDur: lv * 100 },
        { sub: "bag",  name: `${lv}级背包`, lv, capBonus: lv * 70 }
      ];
      const g = gearTypes[Math.floor(Math.random() * gearTypes.length)];
      item = { kind: "gear", sub: g.sub, name: g.name, lv: g.lv, dur: g.maxDur, maxDur: g.maxDur, capBonus: g.capBonus };
    }
  }

  const mesh = createDetailedLootMesh(item);
  mesh.position.set(x, y + 0.12, z);
  scene.add(mesh);
  freezeObject(mesh);
  worldLootItems.push({ x, y, z, mesh, item });
}
