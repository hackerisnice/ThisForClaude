// mapgen.js：地图内容生成：桥、城镇、学校、遗迹、农场、路边民房
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ---------------------------------------------------------------------------
// 3.14 地图内容：桥梁、各城镇（多样楼型）、学校、遗迹、农场、路边民房
// ---------------------------------------------------------------------------
BRIDGE_XS.forEach(bx => {
  const z0 = RIVER_Z - 30, z1 = RIVER_Z + 30;
  addSolidBox(bx, 0.2, RIVER_Z, 20, 0.4, 60, 0x7c8084, { collider: false, los: false, ao: false });
  addWalkRect(bx - 10, z0, bx + 10, z1, 0.4);
  addSolidBox(bx - 9.7, 1.0, RIVER_Z, 0.5, 1.2, 60, 0x6e7276, { aoBase: 0.4 });
  addSolidBox(bx + 9.7, 1.0, RIVER_Z, 0.5, 1.2, 60, 0x6e7276, { aoBase: 0.4 });
  [-14, 0, 14].forEach(dz => addVisualBox(bx, -1.2, RIVER_Z + dz, 14, 2.6, 2.2, 0x6a6e70, "rock", { ao: false }));
  reserveRect(bx - 11, z0, bx + 11, z1);
});

// 按楼型生成建筑参数
function makeBuildingSpec(type, x, z, poi) {
  const r = Math.random;
  if (type === "house") return { cx: x, cz: z, w: 9 + r() * 3.5, d: 9 + r() * 3, floors: 1, roof: r() < 0.6 ? "gable" : "flat", poi, kind: "house" };
  if (type === "house2") return { cx: x, cz: z, w: 11 + r() * 3.5, d: 11 + r() * 2.5, floors: 2, roof: r() < 0.45 ? "gable" : "flat", poi, kind: "house2" };
  if (type === "apartment") return { cx: x, cz: z, w: 15 + r() * 4, d: 12 + r() * 2.5, floors: 3, roof: "flat", poi, kind: "apartment", lootMul: 0.85 };
  if (type === "warehouse") {
    return { cx: x, cz: z, w: 16 + r() * 6, d: 13 + r() * 4, floors: 1, wallH: 6, roof: "flat", poi, kind: "warehouse", catwalk: true,
      color: pickColor([0x7d8a8f, 0x8a7560, 0x6f7a6a, 0x9a8f7f]), doorW: 4.2, doorH: 4.2, roofProps: false, lootMul: 1.2 };
  }
  return null;
}
function buildingFits(spec, margin) {
  return isRectBuildable(spec.cx - spec.w / 2, spec.cz - spec.d / 2, spec.cx + spec.w / 2, spec.cz + spec.d / 2, margin);
}
// L 形组合：主楼 + 侧翼（两栋相贴，共用墙上开通道）
function tryBuildLHouse(x, z, poi) {
  const main = makeBuildingSpec(Math.random() < 0.6 ? "house2" : "house", x, z, poi);
  const ww = 6.5 + Math.random() * 2.5, wd = 7 + Math.random() * 2;
  const north = Math.random() < 0.5;
  main.color = pickColor(FACADE_COLORS);
  const wing = {
    cx: x + main.w / 2 + 0.4 + ww / 2, cz: north ? z - main.d / 2 + wd / 2 : z + main.d / 2 - wd / 2,
    w: ww, d: wd, floors: 1, roof: "flat", poi, kind: "wing", color: main.color, lootMul: 0.8
  };
  const x0 = x - main.w / 2, x1 = wing.cx + ww / 2;
  if (!isRectBuildable(x0, z - main.d / 2, x1, z + main.d / 2, 4)) return false;
  main.sideOpenings = [{ side: "east", z: wing.cz, width: 1.8, floors: [0] }];
  wing.sideOpenings = [{ side: "west", z: wing.cz, width: 1.8, floors: [0] }];
  buildBuilding(main);
  buildBuilding(wing);
  return true;
}

function pickWeighted(mix) {
  let s = 0;
  for (const k in mix) s += mix[k];
  let r = Math.random() * s;
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return Object.keys(mix)[0];
}

function generateTown(poi, gridR, spacing, mix, occupancy = 0.78) {
  for (let gx = -gridR; gx <= gridR; gx++) {
    for (let gz = -gridR; gz <= gridR; gz++) {
      if (gx === 0 && gz === 0) continue; // 镇中心留作广场
      if (Math.random() > occupancy) continue;
      const x = poi.x + gx * spacing + (Math.random() - 0.5) * 10;
      const z = poi.z + gz * spacing + (Math.random() - 0.5) * 10;
      const type = pickWeighted(mix);
      if (type === "lhouse") { tryBuildLHouse(x, z, poi.key); continue; }
      const spec = makeBuildingSpec(type, x, z, poi.key);
      if (buildingFits(spec, 4)) buildBuilding(spec);
    }
  }
}

// 学校：三段相连的两层教学楼 + 体育馆 + 操场跑道 + 篮球场 + 旗杆 + 断续围墙
function buildSchool(poi) {
  const px = poi.x, pz = poi.z;
  const mw = 18, md = 14, gap = 0.4;
  const bz = pz - 26;
  const wallColor = 0xd9cfb4;
  [-1, 0, 1].forEach(i => {
    // 相邻教学楼之间的连通门（开在南半边，避开贴西墙的楼梯井）
    const so = [];
    if (i > -1) so.push({ side: "west", z: bz + 4.5, width: 2.4, floors: [0, 1] });
    if (i < 1) so.push({ side: "east", z: bz + 4.5, width: 2.4, floors: [0, 1] });
    buildBuilding({ cx: px + i * (mw + gap), cz: bz, w: mw, d: md, floors: 2, roof: "flat", color: wallColor, roofColor: 0x6b3a2e,
      poi: "school", kind: "school", sideOpenings: so, lootMul: 1.2, floorColor: 0x8a7a66 });
  });
  // 体育馆
  buildBuilding({ cx: px + 48, cz: pz + 12, w: 20, d: 16, floors: 1, wallH: 7, roof: "flat", color: 0xa8b4bc, poi: "school", kind: "gym", catwalk: true,
    doorW: 4.2, doorH: 4.2, roofProps: false, lootMul: 1.0 });
  // 操场跑道（椭圆环）+ 草坪
  const track = new THREE.Mesh(new THREE.RingGeometry(10.5, 13.5, 48), new THREE.MeshLambertMaterial({ color: 0xa4503c, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  track.rotation.x = -Math.PI / 2; track.scale.set(2.0, 1.0, 1);
  track.position.set(px - 10, 0.05, pz + 17);
  const field = new THREE.Mesh(new THREE.CircleGeometry(10.5, 48), new THREE.MeshLambertMaterial({ color: 0x4f7d3a, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  field.rotation.x = -Math.PI / 2; field.scale.set(2.0, 1.0, 1);
  field.position.set(px - 10, 0.05, pz + 17);
  [track, field].forEach(m => { m.receiveShadow = true; scene.add(m); freezeObject(m); });
  // 篮球场
  const court = new THREE.Mesh(new THREE.PlaneGeometry(13, 24), new THREE.MeshLambertMaterial({ color: 0x7a7f86, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  court.rotation.x = -Math.PI / 2;
  court.position.set(px + 48, 0.05, pz - 26);
  court.receiveShadow = true;
  scene.add(court); freezeObject(court);
  [-1, 1].forEach(s => {
    addSolidBox(px + 48, 1.6, pz - 26 + s * 11.5, 0.15, 3.2, 0.15, 0x9a9da0, { los: false });
    addVisualBox(px + 48, 3.1, pz - 26 + s * 11.1, 1.8, 1.05, 0.08, 0xeeeeee, "plaster", { ao: false });
  });
  // 旗杆 + 红旗
  addSolidBox(px - 10, 4.5, pz - 8, 0.14, 9, 0.14, 0xc8c8c8, { los: false });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshLambertMaterial({ color: 0xc8102e, side: THREE.DoubleSide }));
  flag.position.set(px - 9.05, 8.2, pz - 8);
  scene.add(flag); freezeObject(flag);
  // 断续围墙（留出多处缺口，AI 和玩家都能进出）
  const wx0 = px - 46, wx1 = px + 64, wz0 = pz - 44, wz1 = pz + 40;
  const fenceSeg = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (ax === bx) addSolidBox(ax, 0.7, (az + bz) / 2, 0.3, 1.4, len, 0xb8ad98, { skipBottom: true });
    else addSolidBox((ax + bx) / 2, 0.7, az, len, 1.4, 0.3, 0xb8ad98, { skipBottom: true });
  };
  for (let x = wx0; x < wx1 - 1; x += 22) {
    fenceSeg(x, wz0, Math.min(x + 15, wx1), wz0);
    if (!(x < px + 4 && x + 15 > px - 4)) fenceSeg(x, wz1, Math.min(x + 15, wx1), wz1); // 南门对着学校支路
  }
  for (let z = wz0; z < wz1 - 1; z += 22) {
    fenceSeg(wx0, z, wx0, Math.min(z + 15, wz1));
    fenceSeg(wx1, z, wx1, Math.min(z + 15, wz1));
  }
  // 操场边的器材箱与散落物资
  for (let i = 0; i < 6; i++) {
    const lx = px - 30 + Math.random() * 40, lz = pz + 4 + Math.random() * 26;
    spawnRandomGroundLoot(lx, lz, null, 0);
  }
  reserveRect(wx0, wz0, wx1, wz1);
}

// 遗迹：建在一座小山的山顶平台上（见 terrain.js）——古神庙台基（可登上）+ 石柱阵 + 残垣断壁 + 拱门 +
// 残破石塔（三层，可上楼，远处就能看见）+ 碎石。所有高度都从山顶平台 by 算起
function buildRuins(poi) {
  const px = poi.x, pz = poi.z, by = terrainH(px, pz);
  const stone = () => pickColor([0x9a9384, 0x8c8676, 0xa39c8b, 0x857f70]);
  const sk = "rock";
  // 石铺地面
  addVisualBox(px, by + 0.02, pz, 64, 0.04, 56, 0x8f8a7c, sk, { ao: false });
  // 台基 + 南侧台阶坡道
  addSolidBox(px, by + 0.7, pz, 24, 1.4, 18, stone(), { key: sk, aoBase: by });
  addWalkRect(px - 12, pz - 9, px + 12, pz + 9, by + 1.4);
  addWalkRampZ(px - 4, px + 4, pz + 9, pz + 13.5, by + 1.4, by);
  for (let k = 0; k < 6; k++) {
    const top = 1.4 * (6 - k) / 6;
    addVisualBox(px, by + top / 2, pz + 9 + 4.5 * (k + 0.5) / 6, 8, top, 4.5 / 6, 0x9a9384, sk, { ao: false, skipBottom: true });
  }
  addSolidBox(px, by + 0.7, pz + 11.25, 8, 0.2, Math.hypot(4.5, 1.4), 0, { visual: false, los: false, collider: false, rotX: Math.atan2(1.4, 4.5) });
  // 石柱阵（部分断裂）
  const colGeo = new THREE.CylinderGeometry(0.55, 0.62, 1, 10);
  colGeo.userData.shared = true;
  const columnTops = [];
  for (let i = 0; i < 5; i++) {
    for (const row of [-1, 1]) {
      const x = px - 9 + i * 4.5, z = pz + row * 6;
      const h = Math.random() < 0.35 ? 1.2 + Math.random() * 2.5 : 5.5 + Math.random() * 1.2;
      const m = new THREE.Mesh(colGeo, PROXY_MAT);
      m.position.set(x, by + 1.4 + h / 2, z);
      m.scale.set(1, h, 1);
      addToStaticBatch(m, sk, stone(), { aoBase: by + 1.4 });
      shootableEnvironment.push(m);
      wallMeshesForLOS.push(m);
      addCollider(x - 0.6, x + 0.6, z - 0.6, z + 0.6, by + 1.4, by + 1.4 + h);
      columnTops.push({ x, z, h, row, i });
    }
  }
  // 完整石柱之间搭着的残存横梁
  columnTops.forEach(c => {
    const nb = columnTops.find(o => o.row === c.row && o.i === c.i + 1);
    if (nb && c.h > 5 && nb.h > 5 && Math.random() < 0.7) {
      const y = by + 1.4 + Math.min(c.h, nb.h) + 0.35;
      addSolidBox((c.x + nb.x) / 2, y, c.z, 5.6, 0.7, 1.3, stone(), { key: sk, collider: false, ao: false });
    }
  });
  // 台基北侧残墙
  for (let i = 0; i < 5; i++) {
    const h = 1.5 + Math.random() * 3;
    addSolidBox(px - 10 + i * 5, by + 1.4 + h / 2, pz - 8.6, 4.2, h, 0.7, stone(), { key: sk, aoBase: by + 1.4 });
  }
  // 拱门（南面入口）
  [-1, 1].forEach(s => addSolidBox(px + s * 3.2, by + 2.6, pz + 27, 1.4, 5.2, 1.4, stone(), { key: sk, aoBase: by }));
  addSolidBox(px, by + 5.6, pz + 27, 8.2, 1.0, 1.6, stone(), { key: sk, collider: false });
  // 四周残垣（L 形墙角，高低不一，适合当掩体）
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
    const rr = 20 + Math.random() * 9;
    const x = px + Math.cos(a) * rr * 1.15, z = pz + Math.sin(a) * rr;
    if (Math.abs(x - px) < 5 && z > pz + 9) continue;
    const len1 = 3 + Math.random() * 4, len2 = 2 + Math.random() * 3;
    const h1 = 1.2 + Math.random() * 2.6, h2 = 0.9 + Math.random() * 2;
    addSolidBox(x, by + h1 / 2, z, len1, h1, 0.7, stone(), { key: sk, skipBottom: true, aoBase: by });
    addSolidBox(x + len1 / 2 - 0.35, by + h2 / 2, z + len2 / 2, 0.7, h2, len2, stone(), { key: sk, skipBottom: true, aoBase: by });
  }
  // 倒塌的石柱段
  const fallenGeo = new THREE.CylinderGeometry(0.55, 0.55, 3.2, 10);
  fallenGeo.userData.shared = true;
  for (let i = 0; i < 6; i++) {
    const x = px + (Math.random() - 0.5) * 50, z = pz + (Math.random() - 0.5) * 44;
    if (Math.abs(x - px) < 14 && Math.abs(z - pz) < 15) continue;
    const m = new THREE.Mesh(fallenGeo, PROXY_MAT);
    const alongX = Math.random() < 0.5;
    m.position.set(x, by + 0.55, z);
    if (alongX) m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
    addToStaticBatch(m, sk, stone(), { ao: false });
    shootableEnvironment.push(m);
    wallMeshesForLOS.push(m);
    if (alongX) addCollider(x - 1.6, x + 1.6, z - 0.55, z + 0.55, by, by + 1.1);
    else addCollider(x - 0.55, x + 0.55, z - 1.6, z + 1.6, by, by + 1.1);
  }
  // 残破石塔（三层、无顶，可上楼俯瞰整片山下）
  buildBuilding({ cx: px + 34, cz: pz - 16, w: 10, d: 10, floors: 3, roof: "none", color: 0x8c8676, key: sk, poi: "ruins", kind: "ruin",
    furniture: false, trim: false, roofProps: false, lootMul: 1.3, floorColor: 0x7c7668, baseY: by });
  // 台基上和周围的物资
  for (let i = 0; i < 5; i++) spawnRandomGroundLoot(px - 9 + Math.random() * 18, pz - 6 + Math.random() * 12, null, by + 1.4);
  for (let i = 0; i < 6; i++) {
    const x = px + (Math.random() - 0.5) * 50, z = pz + (Math.random() - 0.5) * 44;
    if (!isPointBlocked2D(x, z, 0.4, by) && Math.abs(getGroundHeight(x, z, by + 0.1) - by) < 0.01) spawnRandomGroundLoot(x, z, null, by);
  }
  reserveRect(px - 32, pz - 28, px + 40, pz + 30);
}

// 农场：农舍 + 谷仓 + 草垛
const farmPois = [];
function tryBuildFarm(x, z, idx) {
  const house = makeBuildingSpec(Math.random() < 0.5 ? "house2" : "house", x, z, null);
  const barn = makeBuildingSpec("warehouse", x + 22, z + (Math.random() - 0.5) * 8, null);
  barn.w = 13 + Math.random() * 3; barn.d = 11 + Math.random() * 3; barn.wallH = 6.2; // 谷仓加高一点，里面有草料阁楼平台
  if (!buildingFits(house, 6) || !isRectBuildable(barn.cx - barn.w / 2, barn.cz - barn.d / 2, barn.cx + barn.w / 2, barn.cz + barn.d / 2, 4)) return false;
  const key = "farm" + idx;
  const poi = { key, name: "", x: x + 11, z, r: 32, weight: 0.6, buildings: [] };
  POIS.push(poi); POI_BY_KEY[key] = poi; farmPois.push(poi);
  house.poi = key; barn.poi = key;
  buildBuilding(house);
  buildBuilding(barn);
  for (let i = 0; i < 4; i++) {
    const hx = x + 6 + Math.random() * 28, hz = z + 14 + Math.random() * 8;
    const gy = terrainH(hx, hz);
    if (isPointBlocked2D(hx, hz, 1.6, gy)) continue;
    const hay = new THREE.Mesh(HAY_GEO, PROXY_MAT);
    hay.rotation.z = Math.PI / 2;
    hay.position.set(hx, gy + 0.75, hz);
    addToStaticBatch(hay, "bark", 0xd4ae4a, { ao: false, shadeFn: p => 0.72 + 0.28 * Math.min(1, (p.y - gy) / 1.5) });
    shootableEnvironment.push(hay);
    wallMeshesForLOS.push(hay);
    addCollider(hx - 1.1, hx + 1.1, hz - 1.1, hz + 1.1, gy, gy + 1.5);
  }
  return true;
}

const HAY_GEO = new THREE.CylinderGeometry(1.1, 1.1, 1.5, 10);
HAY_GEO.userData.shared = true;

const TOWN_MIX_CITY = { house: 25, house2: 33, apartment: 22, lhouse: 12, warehouse: 8 };
const TOWN_MIX_VILLAGE = { house: 42, house2: 30, lhouse: 16, warehouse: 12 };
buildSchool(POI_BY_KEY.school);
buildRuins(POI_BY_KEY.ruins);
generateTown(POI_BY_KEY.pcity, 4, 46, TOWN_MIX_CITY, 0.8);
["rcity", "ycity", "lcity", "mcity"].forEach(k => generateTown(POI_BY_KEY[k], 2, 46, TOWN_MIX_VILLAGE, 0.8));

// 散布在野外的农场
for (let i = 0, made = 0; i < 160 && made < 24; i++) {
  const x = (Math.random() - 0.5) * (MAP_SIZE - 260), z = (Math.random() - 0.5) * (MAP_SIZE - 260);
  if (POIS.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 90)) continue;
  if (tryBuildFarm(x, z, made)) made++;
}
// 路边零散民房
for (let i = 0, made = 0; i < 300 && made < 36; i++) {
  const poly = roadPolylines[Math.floor(Math.random() * roadPolylines.length)];
  const k = 1 + Math.floor(Math.random() * (poly.pts.length - 2));
  const [ax, az] = poly.pts[k - 1], [bx, bz] = poly.pts[k + 1];
  const tl = Math.hypot(bx - ax, bz - az) || 1;
  const side = Math.random() < 0.5 ? -1 : 1;
  const off = poly.w / 2 + 14 + Math.random() * 12;
  const x = poly.pts[k][0] - (bz - az) / tl * off * side, z = poly.pts[k][1] + (bx - ax) / tl * off * side;
  if (Math.abs(x) > MAP_LIMIT - 60 || Math.abs(z) > MAP_LIMIT - 60) continue;
  if (POIS.some(p => !p.key.startsWith("farm") && Math.hypot(p.x - x, p.z - z) < p.r + 40)) continue;
  const spec = makeBuildingSpec(Math.random() < 0.55 ? "house" : (Math.random() < 0.7 ? "house2" : "warehouse"), x, z, null);
  if (buildingFits(spec, 4)) { buildBuilding(spec); made++; }
}

// 城镇街道：沿房子网格之间的空隙（外圈也有一圈）铺柏油路，一条条直路，碰到房子 / 院墙 / 室外楼梯就断开
function buildTownStreets(poi, gridR, spacing) {
  const half = (gridR + 0.5) * spacing, hw = 3.5;
  const clear = (x, z) => !isRectReserved(x - hw, z - hw, x + hw, z + hw, 0.6) && !isPointBlocked2D(x, z, hw + 0.6, 0);
  for (let k = -gridR - 1; k <= gridR; k++) {
    const c = (k + 0.5) * spacing;
    for (const vertical of [true, false]) {
      let run = [];
      const flush = () => { if (run.length >= 4) registerRoad(run, hw * 2, "asphalt", vertical ? "v" : "h"); run = []; };
      for (let t = -half; t <= half + 0.01; t += 3) {
        const x = vertical ? poi.x + c : poi.x + t, z = vertical ? poi.z + t : poi.z + c;
        if (clear(x, z)) run.push([x, z]); else flush();
      }
      flush();
    }
  }
}
buildTownStreets(POI_BY_KEY.pcity, 4, 46);
["rcity", "ycity", "lcity", "mcity"].forEach(k => buildTownStreets(POI_BY_KEY[k], 2, 46));
