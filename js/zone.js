// zone.js：毒圈阶段与跳伞
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// 地图边长翻倍后，各阶段安全区半径同比放大，前两阶段等待/收缩时间加长（徒步跑圈距离变远）
const ZONE_STAGES = [
  { waitSec: 120, shrinkSec: 100, targetR: 920, dps: 1.0 },
  { waitSec: 80,  shrinkSec: 70,  targetR: 520, dps: 1.8 },
  { waitSec: 60,  shrinkSec: 55,  targetR: 270, dps: 3.0 },
  { waitSec: 45,  shrinkSec: 45,  targetR: 130, dps: 5.0 },
  { waitSec: 35,  shrinkSec: 40,  targetR: 44,  dps: 8.0 }
];

const zoneState = {
  cx: (Math.random() - 0.5) * 960,
  cz: (Math.random() - 0.5) * 960,
  curR: 1560,
  startR: 1560,
  targetR: ZONE_STAGES[0].targetR,
  stageIdx: 0,
  mode: "waiting",
  timerSec: ZONE_STAGES[0].waitSec,
  dps: ZONE_STAGES[0].dps
};
blueZoneMesh.scale.set(zoneState.curR, 1, zoneState.curR);
blueZoneMesh.position.set(zoneState.cx, 90, zoneState.cz);

function formatMMSS(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m < 10 ? "0" + m : m}:${rem < 10 ? "0" + rem : rem}`;
}

const actionBtn = document.getElementById("action-center-btn");
function jumpFromPlane() {
  if (player.phase === "plane") {
    player.phase = "sky";
    playerRig.position.copy(planeGroup.position).add(new THREE.Vector3(0, -3, 0));
    actionBtn.innerText = "🪂 立即开伞 (F)";
    sfx.playBoltAction();
  } else if (player.phase === "sky") {
    player.phase = "chute";
    actionBtn.style.display = "none";
    sfx.playBoltAction();
  }
}
actionBtn.addEventListener("touchstart", e => { e.preventDefault(); jumpFromPlane(); }, { passive: false });
actionBtn.addEventListener("click", jumpFromPlane);
