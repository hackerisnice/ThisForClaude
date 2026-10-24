// marker.js：标点测距 —— 准星对着哪按 📍（V 键 / 鼠标中键）就在哪插一面旗，显示直线距离；
// 大地图上点一下也能标点。对准旗子再按一次、长按 📍、或点指南针下面的距离条都能取消
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const mapMarker = { active: false, x: 0, y: 0, z: 0 };
const markerWorldEl = document.getElementById("marker-world");
const markerWorldDist = document.getElementById("marker-world-dist");
const markerHudEl = document.getElementById("marker-hud");
const markerHudArrow = document.getElementById("marker-hud-arrow");
const markerHudDist = document.getElementById("marker-hud-dist");
const markerBtn = document.getElementById("btn-mark");

function setMapMarker(x, y, z) {
  mapMarker.active = true;
  mapMarker.x = x; mapMarker.y = y; mapMarker.z = z;
  markerBtn.classList.add("on");
  if (bigMapOpen) drawBigMap();
}
function clearMapMarker() {
  mapMarker.active = false;
  markerBtn.classList.remove("on");
  if (bigMapOpen) drawBigMap();
}

// 从准星方向打一条射线，落点就是标点位置（打到天上就沿视线落到地面高度，太远就不标）
const _mkRay = new THREE.Raycaster(), _mkV = new THREE.Vector3(), _mkCenter = new THREE.Vector2(0, 0);
function markerFromCrosshair() {
  if (replayState.active || player.phase === "dead") return;
  _mkRay.setFromCamera(_mkCenter, camera);
  const o = _mkRay.ray.origin, dir = _mkRay.ray.direction;
  // 已有标点且准星正对着它：取消
  if (mapMarker.active) {
    _mkV.set(mapMarker.x, mapMarker.y + 0.5, mapMarker.z).sub(o);
    const d = _mkV.length();
    if (d > 0.5 && _mkV.normalize().dot(dir) > Math.cos(Math.max(0.025, Math.min(0.09, 3 / d)))) { clearMapMarker(); return; }
  }
  const far = 1500;
  _mkRay.far = far;
  const hits = _mkRay.intersectObjects(gatherShootCandidates(_mkRay.ray, far, false), false);
  let p = hits.length ? hits[0].point : null;
  if (!p && dir.y < -0.001) {
    const t = -o.y / dir.y;
    if (t < 3000) p = _mkV.copy(o).addScaledVector(dir, t);
  }
  if (!p) { showToast("📍 太远了，无法标点"); return; }
  setMapMarker(p.x, p.y, p.z);
}

// 📍 按钮：点一下标点，长按 0.55 秒取消
(function bindMarkerButton() {
  let holdTimer = null, held = false;
  markerBtn.addEventListener("touchstart", e => {
    e.preventDefault(); e.stopPropagation();
    held = false;
    markerBtn.classList.add("pressing");
    holdTimer = setTimeout(() => { held = true; clearMapMarker(); }, 550);
  }, { passive: false });
  markerBtn.addEventListener("touchend", e => {
    e.preventDefault(); e.stopPropagation();
    markerBtn.classList.remove("pressing");
    clearTimeout(holdTimer);
    if (!held) markerFromCrosshair();
  }, { passive: false });
  markerBtn.addEventListener("click", e => { e.stopPropagation(); markerFromCrosshair(); });
})();
markerHudEl.addEventListener("touchstart", e => { e.preventDefault(); e.stopPropagation(); clearMapMarker(); }, { passive: false });
markerHudEl.addEventListener("click", e => { e.stopPropagation(); clearMapMarker(); });

// 大地图上点击：点到标记附近 = 取消，否则在点击处标点
function bigMapTapAt(clientX, clientY) {
  const r = bigMapCanvas.getBoundingClientRect();
  const fx = (clientX - r.left) / r.width, fz = (clientY - r.top) / r.height;
  if (fx < 0 || fx > 1 || fz < 0 || fz > 1) return;
  const wx = fx * MAP_SIZE - MAP_SIZE / 2, wz = fz * MAP_SIZE - MAP_SIZE / 2;
  if (mapMarker.active && Math.hypot(mapMarker.x - wx, mapMarker.z - wz) < 16 / r.width * MAP_SIZE) { clearMapMarker(); return; }
  setMapMarker(wx, getGroundHeight(wx, wz, 400), wz);
}

// 小地图 / 大地图上的旗子（小地图上标点在范围外时贴在边上）；大地图上还有一条从自己连过去的虚线
function drawMarkerOnMap(ctx, toX, toZ, W, H, isBig) {
  if (!mapMarker.active) return;
  let x = toX(mapMarker.x), y = toZ(mapMarker.z);
  if (isBig) {
    const px = toX(playerRig.position.x), pz = toZ(playerRig.position.z);
    ctx.save();
    ctx.setLineDash([7, 6]);
    ctx.strokeStyle = "rgba(255, 176, 32, 0.9)";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, pz); ctx.lineTo(x, y); ctx.stroke();
    ctx.restore();
    const d = Math.round(Math.hypot(mapMarker.x - playerRig.position.x, mapMarker.z - playerRig.position.z));
    ctx.font = `bold ${Math.max(12, Math.round(W / 50))}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "bottom";
    ctx.lineWidth = 3; ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
    ctx.strokeText(d + "m", x, y - 20);
    ctx.fillStyle = "#ffd27d";
    ctx.fillText(d + "m", x, y - 20);
  } else {
    x = Math.max(7, Math.min(W - 7, x));
    y = Math.max(12, Math.min(H - 3, y));
  }
  const s = isBig ? 1.3 : 1.15;
  ctx.fillStyle = "#ffb020";
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(x - 7 * s, y - 8 * s, x - 6 * s, y - 15 * s, x, y - 15 * s);
  ctx.bezierCurveTo(x + 6 * s, y - 15 * s, x + 7 * s, y - 8 * s, x, y);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.beginPath(); ctx.arc(x, y - 10 * s, 2.2 * s, 0, Math.PI * 2); ctx.fill();
}

// 每帧：画面里的旗子跟着标点位置走（屏幕外 / 身后就藏起来），指南针下面显示方向箭头和距离
let markerLastText = "", markerLastArrow = 1e9, markerShown = false, markerWorldShown = false;
function updateMapMarker() {
  const on = mapMarker.active && !replayState.active && player.phase !== "dead";
  if (!on) {
    if (markerShown) { markerShown = markerWorldShown = false; markerWorldEl.style.display = "none"; markerHudEl.style.display = "none"; }
    return;
  }
  if (!markerShown) { markerShown = true; markerHudEl.style.display = "flex"; }
  const dx = mapMarker.x - playerRig.position.x, dz = mapMarker.z - playerRig.position.z;
  const dy = mapMarker.y - (player.phase === "ground" ? player.feetY : playerRig.position.y);
  const text = Math.round(Math.hypot(dx, dy, dz)) + "m";
  if (text !== markerLastText) { markerLastText = text; markerHudDist.textContent = text; markerWorldDist.textContent = text; }
  // 相对视线的方向（左正右负），箭头顺时针为正
  const rel = angleDiff(Math.atan2(-dx, -dz), yaw);
  const deg = Math.round(-rel * 180 / Math.PI);
  if (deg !== markerLastArrow) { markerLastArrow = deg; markerHudArrow.style.transform = `rotate(${deg}deg)`; }
  camera.updateWorldMatrix(true, false);
  _mkV.set(mapMarker.x, mapMarker.y + 0.3, mapMarker.z).project(camera);
  const vis = !(_mkV.z > 1 || Math.abs(_mkV.x) > 1.05 || Math.abs(_mkV.y) > 1.05);
  if (vis !== markerWorldShown) { markerWorldShown = vis; markerWorldEl.style.display = vis ? "block" : "none"; }
  if (vis) {
    const sx = (_mkV.x + 1) / 2 * window.innerWidth, sy = (1 - _mkV.y) / 2 * window.innerHeight;
    markerWorldEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
  }
}
