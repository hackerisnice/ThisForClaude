// map.js：小地图、大地图、指南针地名
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ---------------------------------------------------------------------------
// 地图：开局把地形、林区、河流、桥、道路、建筑一次性画进离屏底图，
// 小地图（以玩家为中心）与大地图（全图 + 地点标注）都从这张底图裁切缩放，每帧不再重画矢量
// ---------------------------------------------------------------------------
const MAP_BASE_PX = 1280;
const MAP_PX_PER_M = MAP_BASE_PX / MAP_SIZE;
const mapBaseCanvas = document.createElement("canvas");
mapBaseCanvas.width = mapBaseCanvas.height = MAP_BASE_PX;
(function paintMapBase() {
  const c = mapBaseCanvas.getContext("2d");
  const k = MAP_PX_PER_M, H = MAP_SIZE / 2;
  const X = x => (x + H) * k;
  // 草地底色 + 低频明暗起伏（64×64 噪声图放大平滑，几乎零开销）
  c.fillStyle = "#3f4f35";
  c.fillRect(0, 0, MAP_BASE_PX, MAP_BASE_PX);
  const noise = document.createElement("canvas");
  noise.width = noise.height = 64;
  const nctx = noise.getContext("2d");
  const img = nctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const n = fbm(x / 13, y / 13, 41, 4);
      const o = (y * 64 + x) * 4;
      img.data[o] = 70 + n * 40; img.data[o + 1] = 88 + n * 38; img.data[o + 2] = 56 + n * 22; img.data[o + 3] = 120;
    }
  }
  nctx.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(noise, 0, 0, MAP_BASE_PX, MAP_BASE_PX);
  // 山丘：按坡向做明暗（西北方向来光，迎光坡亮、背光坡暗），越高越偏土黄，一眼看出哪里有山
  const HS = 160, hs = document.createElement("canvas");
  hs.width = hs.height = HS;
  const hctx = hs.getContext("2d"), himg = hctx.createImageData(HS, HS);
  for (let y = 0; y < HS; y++) {
    for (let x = 0; x < HS; x++) {
      const wx = -H + (x + 0.5) * MAP_SIZE / HS, wz = -H + (y + 0.5) * MAP_SIZE / HS;
      const h = terrainH(wx, wz);
      const sl = (terrainH(wx + 10, wz) - terrainH(wx - 10, wz) + terrainH(wx, wz + 10) - terrainH(wx, wz - 10)) * 0.05;
      const hk = smoothstep(2, 30, h);
      const o = (y * HS + x) * 4;
      const lit = sl > 0;
      himg.data[o] = lit ? 235 : 20 + hk * 40; himg.data[o + 1] = lit ? 225 : 26 + hk * 20; himg.data[o + 2] = lit ? 170 : 12;
      himg.data[o + 3] = Math.min(150, Math.abs(sl) * 255 + hk * 40);
    }
  }
  hctx.putImageData(himg, 0, 0);
  c.drawImage(hs, 0, 0, MAP_BASE_PX, MAP_BASE_PX);
  // 林区
  c.fillStyle = "rgba(34, 52, 30, 0.72)";
  forestPatches.forEach(f => { c.beginPath(); c.arc(X(f.x), X(f.z), f.r * k * 1.05, 0, Math.PI * 2); c.fill(); });
  // 地点地面（城镇略偏土色，学校/遗迹按材质着色）
  POIS.forEach(p => {
    if (p.key.startsWith("farm")) {
      c.fillStyle = "rgba(150, 128, 70, 0.45)";
      c.fillRect(X(p.x - 30), X(p.z - 22), 60 * k, 44 * k);
      return;
    }
    if (p.special) return;
    c.fillStyle = "rgba(120, 112, 90, 0.35)";
    c.beginPath(); c.arc(X(p.x), X(p.z), p.r * k * 0.95, 0, Math.PI * 2); c.fill();
  });
  const sch = POI_BY_KEY.school, ru = POI_BY_KEY.ruins;
  c.fillStyle = "rgba(170, 160, 135, 0.55)";
  c.fillRect(X(sch.x - 46), X(sch.z - 44), 110 * k, 84 * k);
  c.strokeStyle = "#a4503c"; c.lineWidth = Math.max(1.5, 3 * k);
  c.beginPath(); c.ellipse(X(sch.x - 10), X(sch.z + 17), 24 * k, 12 * k, 0, 0, Math.PI * 2); c.stroke();
  c.fillStyle = "rgba(150, 144, 128, 0.85)";
  c.fillRect(X(ru.x - 32), X(ru.z - 28), 64 * k, 56 * k);
  // 河流 + 河岸
  c.fillStyle = "#5d6b4c";
  c.fillRect(0, X(RIVER_Z - RIVER_HALF - 5), MAP_BASE_PX, (RIVER_HALF * 2 + 10) * k);
  c.fillStyle = "#2f6c93";
  c.fillRect(0, X(RIVER_Z - RIVER_HALF), MAP_BASE_PX, RIVER_HALF * 2 * k);
  // 道路（地图上适当加粗，便于手机上看清）
  c.lineJoin = "round"; c.lineCap = "round";
  roadPolylines.forEach(poly => {
    c.strokeStyle = poly.kind === "asphalt" ? "#2e302e" : "#5a4a34";
    c.lineWidth = Math.max(2.2, poly.w * k * 1.9) + 1.2;
    c.beginPath();
    poly.pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), X(p[1])) : c.moveTo(X(p[0]), X(p[1]))));
    c.stroke();
  });
  roadPolylines.forEach(poly => {
    c.strokeStyle = poly.kind === "asphalt" ? "#9c9d98" : "#b0905f";
    c.lineWidth = Math.max(1.4, poly.w * k * 1.9);
    c.beginPath();
    poly.pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), X(p[1])) : c.moveTo(X(p[0]), X(p[1]))));
    c.stroke();
  });
  // 桥
  BRIDGE_XS.forEach(bx => {
    c.fillStyle = "#26282a";
    c.fillRect(X(bx - 12), X(RIVER_Z - 31), 24 * k, 62 * k);
    c.fillStyle = "#b8b6ae";
    c.fillRect(X(bx - 10), X(RIVER_Z - 30), 20 * k, 60 * k);
  });
  // 建筑（多层楼颜色更深）
  buildingFootprints.forEach(b => {
    c.fillStyle = b.kind === "school" || b.kind === "gym" ? "#d8ccb0" : (b.kind === "ruin" ? "#9a9384" : (b.floors >= 3 ? "#a08a6c" : (b.floors === 2 ? "#b89c78" : "#c8ad86")));
    c.strokeStyle = "rgba(30, 24, 18, 0.85)";
    c.lineWidth = 1;
    const x0 = X(b.cx - b.w / 2), z0 = X(b.cz - b.d / 2);
    c.fillRect(x0, z0, Math.max(1.5, b.w * k), Math.max(1.5, b.d * k));
    c.strokeRect(x0, z0, Math.max(1.5, b.w * k), Math.max(1.5, b.d * k));
  });
})();

const mmCanvas = document.getElementById("minimap-canvas");
const mmCtx = mmCanvas.getContext("2d");
const MINIMAP_SPAN = 380; // 小地图显示范围（米）
document.getElementById("minimap-box").addEventListener("click", () => toggleBigMap());

function drawZoneCircles(ctx, toX, toZ, scale, isBig) {
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = isBig ? 2 : 1.4;
  ctx.beginPath();
  ctx.arc(toX(zoneState.cx), toZ(zoneState.cz), zoneState.targetR * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#1e9bff";
  ctx.lineWidth = isBig ? 3 : 2;
  ctx.beginPath();
  ctx.arc(toX(zoneState.cx), toZ(zoneState.cz), zoneState.curR * scale, 0, Math.PI * 2);
  ctx.stroke();
}
// 地图上的公共图层：毒圈、航线、空投、声音雷达、玩家箭头
function drawMapOverlays(ctx, toX, toZ, scale, W, H, isBig) {
  // 安全区（白圈）与当前毒圈（蓝圈）；开局还没刷圈时不画
  if (zoneState.mode !== "none" && zoneState.mode !== "ended") drawZoneCircles(ctx, toX, toZ, scale, isBig);

  // 航线（还在飞机上或空中时显示）
  if (player.phase === "plane" || player.phase === "sky" || player.phase === "chute") {
    const a = flightPointAt(0), b = flightPointAt(flightPath.len);
    ctx.save();
    ctx.setLineDash(isBig ? [10, 7] : [5, 4]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = isBig ? 2 : 1.4;
    ctx.beginPath(); ctx.moveTo(toX(a.x), toZ(a.z)); ctx.lineTo(toX(b.x), toZ(b.z)); ctx.stroke();
    ctx.restore();
    if (planeGroup.visible) {
      ctx.fillStyle = "#ffd000";
      ctx.beginPath(); ctx.arc(toX(planeGroup.position.x), toZ(planeGroup.position.z), isBig ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  airdrops.forEach(ad => {
    const ax = toX(ad.x), az = toZ(ad.z), s = isBig ? 5 : 3.5;
    ctx.fillStyle = "#ff2211";
    ctx.fillRect(ax - s, az - s, s * 2, s * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(ax - s, az - s, s * 2, s * 2);
  });

  const now = performance.now();
  const px = toX(playerRig.position.x), pz = toZ(playerRig.position.z);
  for (let i = radarSoundMarkers.length - 1; i >= 0; i--) {
    const m = radarSoundMarkers[i];
    const age = Math.max(0, now - m.born);
    if (age > m.maxAge) {
      if (!isBig) radarSoundMarkers.splice(i, 1);
      continue;
    }
    const alpha = Math.max(0, 1 - age / m.maxAge);
    const sx = Math.max(6, Math.min(W - 6, toX(m.x)));
    const sz = Math.max(6, Math.min(H - 6, toZ(m.z)));
    const angleFromPlayer = Math.atan2(m.z - playerRig.position.z, m.x - playerRig.position.x);
    if (m.type === "shot") {
      if (!isBig) {
        ctx.strokeStyle = `rgba(255, 45, 25, ${alpha})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, W / 2 - 8, angleFromPlayer - 0.28, angleFromPlayer + 0.28);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255, 60, 30, ${alpha})`;
      ctx.beginPath(); ctx.arc(sx, sz, isBig ? 4 : 6, 0, Math.PI * 2); ctx.fill();
    } else {
      const rWave = (isBig ? 3 : 5) + (age / m.maxAge) * (isBig ? 8 : 13);
      ctx.strokeStyle = `rgba(255, 195, 40, ${alpha})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(sx, sz, rWave, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255, 180, 0, ${alpha})`;
      ctx.beginPath(); ctx.arc(sx, sz, isBig ? 2.5 : 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  drawMarkerOnMap(ctx, toX, toZ, W, H, isBig);

  // 玩家：带朝向的箭头
  const s = isBig ? 1.25 : 1.6;
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-yaw);
  ctx.fillStyle = "#00ff66";
  ctx.strokeStyle = "#04240f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -7 * s); ctx.lineTo(5 * s, 6 * s); ctx.lineTo(0, 3 * s); ctx.lineTo(-5 * s, 6 * s); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawPoiLabel(ctx, p, x, y, fontPx, big) {
  const label = p.special ? `${p.special} ${p.name}` : p.name;
  ctx.font = `bold ${fontPx}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (p.special && big) {
    // 学校 / 遗迹：醒目的标签底框
    const w = ctx.measureText(label).width + fontPx * 0.9;
    ctx.fillStyle = p.key === "school" ? "rgba(40, 90, 170, 0.85)" : "rgba(140, 90, 30, 0.88)";
    ctx.strokeStyle = "#ffe08a";
    ctx.lineWidth = 1.5;
    const h = fontPx * 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x, y + 0.5);
    return;
  }
  ctx.lineWidth = Math.max(2, fontPx * 0.22);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.strokeText(label, x, y);
  ctx.fillStyle = p.special ? "#ffe08a" : "#ffffff";
  ctx.fillText(label, x, y);
}

function drawMinimap() {
  const W = mmCanvas.width, H = mmCanvas.height;
  const scale = W / MINIMAP_SPAN;
  const cx = playerRig.position.x, cz = playerRig.position.z;
  const toX = wx => W / 2 + (wx - cx) * scale;
  const toZ = wz => H / 2 + (wz - cz) * scale;
  mmCtx.fillStyle = "#2b3727";
  mmCtx.fillRect(0, 0, W, H);
  const k = MAP_PX_PER_M;
  mmCtx.imageSmoothingEnabled = true;
  mmCtx.drawImage(mapBaseCanvas, (cx - MINIMAP_SPAN / 2 + MAP_SIZE / 2) * k, (cz - MINIMAP_SPAN / 2 + MAP_SIZE / 2) * k,
    MINIMAP_SPAN * k, MINIMAP_SPAN * k, 0, 0, W, H);
  // 视野内的地点名
  POIS.forEach(p => {
    if (!p.name) return;
    const x = toX(p.x), y = toZ(p.z);
    if (x < -30 || x > W + 30 || y < -10 || y > H + 10) return;
    drawPoiLabel(mmCtx, p, x, y, 17, false);
  });
  drawMapOverlays(mmCtx, toX, toZ, scale, W, H, false);
}

// 大地图（点小地图或按 M 打开）：全图 + 8×8 网格 + 城镇/学校/遗迹标注
const bigMapModal = document.getElementById("bigmap-modal");
const bigMapCanvas = document.getElementById("bigmap-canvas");
const bigMapCtx = bigMapCanvas.getContext("2d");
let bigMapOpen = false;
function toggleBigMap(force) {
  bigMapOpen = force !== undefined ? force : !bigMapOpen;
  bigMapModal.style.display = bigMapOpen ? "flex" : "none";
  if (bigMapOpen) {
    const css = Math.floor(Math.min(window.innerHeight - 16, window.innerWidth - 16, 720));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bigMapCanvas.style.width = bigMapCanvas.style.height = css + "px";
    bigMapCanvas.width = bigMapCanvas.height = Math.round(css * dpr);
    drawBigMap();
  }
}
// 点地图本身 = 标点 / 取消标点（见 marker.js）；点地图外的空白处或 ✕ = 关闭
bigMapModal.addEventListener("click", e => {
  if (e.target === bigMapCanvas) bigMapTapAt(e.clientX, e.clientY);
  else toggleBigMap(false);
});
bigMapModal.addEventListener("touchstart", e => {
  e.preventDefault();
  const t = e.changedTouches[0];
  if (e.target === bigMapCanvas) bigMapTapAt(t.clientX, t.clientY);
  else toggleBigMap(false);
}, { passive: false });

function drawBigMap() {
  const ctx = bigMapCtx;
  const W = bigMapCanvas.width, H = bigMapCanvas.height;
  const scale = W / MAP_SIZE;
  const toX = wx => (wx + MAP_SIZE / 2) * scale;
  const toZ = wz => (wz + MAP_SIZE / 2) * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapBaseCanvas, 0, 0, W, H);
  // 网格（每格 400 米）
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  const cells = MAP_SIZE / 400;
  ctx.font = `bold ${Math.round(W / 60)}px sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = 1; i < cells; i++) {
    const p = (i / cells) * W;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
  }
  for (let i = 0; i < cells; i++) {
    ctx.fillText(String.fromCharCode(65 + i), (i / cells) * W + 4, 3);
    ctx.fillText(String(i + 1), 4, (i / cells) * H + 3 + W / 50);
  }
  // 地点标注
  const f = Math.max(12, Math.round(W / 38));
  POIS.forEach(p => {
    if (!p.name) return;
    const x = toX(p.x), y = toZ(p.z);
    if (p.special) {
      ctx.strokeStyle = "rgba(255, 224, 138, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(x, y, Math.max(10, p.r * scale * 1.2), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      drawPoiLabel(ctx, p, x, y - Math.max(10, p.r * scale * 1.2) - f * 0.9, f, true);
    } else {
      drawPoiLabel(ctx, p, x, y, f * (p.key === "pcity" ? 1.25 : 1), true);
    }
  });
  drawMapOverlays(ctx, toX, toZ, scale, W, H, true);
}

// 指南针后缀：当前所在地点
function currentAreaName() {
  const x = playerRig.position.x, z = playerRig.position.z;
  let best = null, bestD = Infinity;
  POIS.forEach(p => {
    if (!p.name) return;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < p.r + 60 && d < bestD) { bestD = d; best = p; }
  });
  if (best) return best.special ? `${best.special}${best.name}` : best.name;
  if (Math.abs(z - RIVER_Z) < RIVER_HALF + 40) return "河岸";
  if (forestPatches.some(fp => Math.hypot(fp.x - x, fp.z - z) < fp.r)) return "林区";
  return "野外";
}
