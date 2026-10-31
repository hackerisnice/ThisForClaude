// zone.js：毒圈阶段与跳伞
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// 开局 5 分钟内没有圈（安心搜物资），5 分钟时刷出第一个安全区，蓝圈从地图外围开始收
const ZONE_FIRST_SEC = 300;
const ZONE_NONE_R = 99999;     // 还没刷圈时：圈“无限大”，没有人在圈外
const ZONE_FIRST_BLUE_R = 2300; // 第一个蓝圈刚出现时罩住整张地图
// 地图边长翻倍后，各阶段安全区半径同比放大，前两阶段等待/收缩时间加长（徒步跑圈距离变远）
const ZONE_STAGES = [
  { waitSec: 90,  shrinkSec: 160, targetR: 920, dps: 1.0 },
  { waitSec: 80,  shrinkSec: 70,  targetR: 520, dps: 1.8 },
  { waitSec: 60,  shrinkSec: 55,  targetR: 270, dps: 3.0 },
  { waitSec: 45,  shrinkSec: 45,  targetR: 130, dps: 5.0 },
  { waitSec: 35,  shrinkSec: 40,  targetR: 44,  dps: 8.0 }
];

const zoneState = {
  cx: (Math.random() - 0.5) * 960,
  cz: (Math.random() - 0.5) * 960,
  curR: ZONE_NONE_R,
  startR: ZONE_NONE_R,
  targetR: ZONE_NONE_R,
  stageIdx: 0,
  mode: "none",          // none（还没刷圈）→ waiting（白圈已出现，等待）→ shrinking（蓝圈收缩）
  timerSec: ZONE_FIRST_SEC,
  dps: 0
};
blueZoneMesh.visible = false;
blueZoneMesh.position.set(zoneState.cx, 90, zoneState.cz);
// 刷出第一个圈：白圈（第一阶段安全区）+ 罩住整张地图的蓝圈
function startFirstZone() {
  const cfg = ZONE_STAGES[0];
  zoneState.mode = "waiting";
  zoneState.curR = zoneState.startR = ZONE_FIRST_BLUE_R;
  zoneState.targetR = cfg.targetR;
  zoneState.timerSec = cfg.waitSec;
  zoneState.dps = cfg.dps;
  blueZoneMesh.scale.set(zoneState.curR, 1, zoneState.curR);
  blueZoneMesh.visible = true;
  showToast("⚠️ 安全区已刷新，请尽快进入白圈");
}

// 比赛结束（只剩一个人）：毒圈消失，不再缩、不再扣血，谁都不用再跑毒
function endMatchZone() {
  if (zoneState.mode === "ended") return;
  zoneState.mode = "ended";
  zoneState.curR = zoneState.startR = zoneState.targetR = ZONE_NONE_R;
  zoneState.dps = 0;
  zoneState.timerSec = 0;
  blueZoneMesh.visible = false;
  document.getElementById("bluezone-overlay").style.display = "none";
  document.getElementById("zone-timer").innerText = "🏁 比赛结束";
}

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
