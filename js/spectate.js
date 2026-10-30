// spectate.js：观战 —— 被淘汰后可以选任何一个还活着的人看他的实时对局（战场照常进行，不暂停）。
// 第三人称（越肩镜头）/ 第一人称（他的眼睛，开镜时显示他的倍镜画面）；上一个 / 下一个 / 从列表里点选；
// 正在看的人被淘汰了，2 秒后自动切到淘汰他的人（像端游一样）；只剩最后一个人时显示谁吃鸡
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

let spectateKiller = null; // 淘汰玩家的那个 AI（进观战时默认先看他）
const specState = {
  active: false, target: null, mode: "tp", snap: true, saved: null,
  pendingTarget: null, switchAt: 0, listOpen: false, nextInfo: 0, nextList: 0, winner: null, msgUntil: 0
};
const specUI = document.getElementById("spectate-ui");
const specCam = new THREE.Vector3(), specLook = new THREE.Vector3();
const _spWant = new THREE.Vector3(), _spWantLook = new THREE.Vector3();
const specFoeTag = makeNameTag();
const SPEC_STATE_LABEL = {
  combat: "交火中", duel: "交火中", zone: "跑毒", loot: "搜物资", patrol: "转点", hunt: "搜人", ambush: "蹲点",
  overwatch: "架枪", airdrop: "抢空投", flee: "躲避", heal: "打药", push: "冲锋", stunned: "被闪了"
};

function specCandidates() {
  return aiPlayers.filter(b => b.alive && b.phase !== "plane");
}
// 默认看谁：淘汰我的人 → 离我最近的人
function specDefaultTarget() {
  if (spectateKiller && spectateKiller.alive) return spectateKiller;
  const list = specCandidates();
  let best = null, bd = Infinity;
  const p = specState.saved ? specState.saved.rig : playerRig.position;
  for (const b of list) {
    const d = Math.hypot(b.group.position.x - p.x, b.group.position.z - p.z);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function startSpectate(target) {
  if (specState.active || replayState.active || player.phase !== "dead") return;
  const t = target && target.alive ? target : specDefaultTarget();
  if (!t) return;
  specState.saved = { rig: playerRig.position.clone(), yaw, pitch, fov: camera.fov };
  specState.active = true;
  specState.mode = "tp";
  specState.listOpen = false;
  specState.pendingTarget = null;
  document.getElementById("gameover-modal").style.display = "none";
  document.body.classList.add("spectate-mode");
  specUI.style.display = "flex";
  document.getElementById("sp-list").style.display = "none";
  doorBtn.style.display = "none";
  setSpectateTarget(t);
  updateSpectateButtons();
}

function exitSpectate() {
  const S = specState;
  if (!S.active) return;
  S.active = false;
  if (S.target && S.target.alive) S.target.group.visible = true;
  S.target = null;
  specFoeTag.visible = false;
  playerRig.position.copy(S.saved.rig);
  yaw = S.saved.yaw; pitch = S.saved.pitch;
  camera.fov = S.saved.fov;
  camera.updateProjectionMatrix();
  document.getElementById("sp-scope").style.display = "none";
  document.getElementById("sp-cross").style.display = "none";
  document.body.classList.remove("spectate-mode");
  specUI.style.display = "none";
  document.getElementById("gameover-modal").style.display = "flex";
  refreshReplayButtons();
  refreshSpectateButton();
}

function setSpectateTarget(b) {
  const S = specState;
  if (S.target && S.target !== b && S.target.alive) S.target.group.visible = true;
  S.target = b;
  S.snap = true;
  S.pendingTarget = null;
  S.nextInfo = 0;
  S.nextList = 0;
}

function cycleSpectate(dir) {
  const list = specCandidates();
  if (!list.length) return;
  let i = list.indexOf(specState.target);
  i = i < 0 ? 0 : (i + dir + list.length) % list.length;
  setSpectateTarget(list[i]);
}

function showSpectateMsg(text, ms = 2600) {
  const el = document.getElementById("sp-msg");
  el.innerText = text;
  el.style.opacity = 1;
  specState.msgUntil = performance.now() + ms;
}

// loot.js 的 killAIBot 里调用：正在看的人被淘汰 → 过 2 秒切到淘汰他的人；只剩一个人 → 他吃鸡了
function spectateOnBotKilled(bot, killerBot, killerName, weaponName) {
  const alive = aiPlayers.filter(a => a.alive);
  if (player.phase === "dead" && alive.length === 1) specState.winner = alive[0];
  refreshSpectateButton();
  if (!specState.active) return;
  if (bot === specState.target) {
    showSpectateMsg(`${bot.name} 被 ${killerName} 用 ${weaponName} 淘汰`);
    specState.pendingTarget = killerBot && killerBot.alive ? killerBot : null;
    specState.switchAt = performance.now() + 2000;
  }
  if (specState.winner) setTimeout(() => showSpectateMsg(`🏆 ${specState.winner.name} 大吉大利，今晚吃鸡！`, 1e9), 2100);
}

// 结算界面上的“观战”按钮：被淘汰、还有人活着才显示
const specBtn = document.getElementById("btn-spectate");
function refreshSpectateButton() {
  const show = player.phase === "dead" && specCandidates().length > 0;
  specBtn.style.display = show ? "inline-block" : "none";
  specBtn.innerText = specState.winner ? `👁 观看 ${specState.winner.name} 吃鸡` : `👁 观战（剩余 ${specCandidates().length} 人）`;
}
specBtn.addEventListener("click", () => startSpectate(null));

// 第一人称开镜：按他的倍镜缩放视野，叠加他那把枪的倍镜 / 机瞄画面
const spScopeEl = document.getElementById("sp-scope"), spScopeSvg = document.getElementById("sp-scope-svg"), spCrossEl = document.getElementById("sp-cross");
let spScopeKey = "";
function updateSpectateScope(b, fp) {
  const ads = fp ? smoothstep(0, 1, b.adsBlend || 0) : 0;
  const atts = (b.weaponAtts && b.weaponAtts[b.activeSlot]) || {};
  const sKey = atts.scope && ATTACHMENTS_DATA[atts.scope] ? atts.scope : "iron";
  const fovAds = sKey === "iron" ? 65 : ATTACHMENTS_DATA[sKey].fov;
  const fov = 70 + (fovAds - 70) * ads;
  if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
  const overlay = fp && b.weaponKey ? smoothstep(0.55, 1, ads) : 0;
  if (overlay > 0) {
    const key = b.weaponKey + "|" + sKey;
    if (key !== spScopeKey) { spScopeKey = key; spScopeSvg.innerHTML = buildScopeOrIronSightSVG({ id: b.weaponKey }, sKey); }
  }
  spScopeEl.style.opacity = overlay.toFixed(2);
  spScopeEl.style.display = overlay > 0 ? "block" : "none";
  spCrossEl.style.display = fp && overlay < 0.3 ? "block" : "none";
}

// 主循环每帧调用（战场照常模拟）
function updateSpectate(dt, now) {
  const S = specState;
  if (S.msgUntil && now > S.msgUntil) { document.getElementById("sp-msg").style.opacity = 0; S.msgUntil = 0; }
  // 换人：被观战者阵亡 2 秒后切到击杀者（他也死了就换下一个活着的）
  if (!S.target || !S.target.alive) {
    if (now >= S.switchAt || !S.target) {
      const next = S.pendingTarget && S.pendingTarget.alive ? S.pendingTarget : specDefaultTarget();
      if (next) setSpectateTarget(next);
      else if (!S.target) { exitSpectate(); return; }
    }
  }
  const b = S.target;
  if (!b) return;
  const pos = b.group.position;
  const fp = S.mode === "fp" && b.alive;
  // 身体朝向；举枪瞄准时用枪口方向
  const ry = b.aimOn ? b.aimYaw : b.group.rotation.y;
  const fx = Math.sin(ry), fz = Math.cos(ry);
  const pit = b.aimOn ? (b.aimPitch || 0) : 0;
  if (fp) {
    const eye = 1.58 - 0.45 * (b.crouchBlend || 0);
    _spWant.set(pos.x + fx * 0.15, pos.y + eye, pos.z + fz * 0.15);
    const cp = Math.cos(pit);
    _spWantLook.set(_spWant.x + fx * cp * 30, _spWant.y + Math.sin(pit) * 30, _spWant.z + fz * cp * 30);
  } else {
    shoulderCam({ x: pos.x, y: pos.y, z: pos.z, fx, fz, pitch: pit }, null, _spWant, _spWantLook);
  }
  if (S.snap || specCam.distanceTo(_spWant) > 30) { specCam.copy(_spWant); specLook.copy(_spWantLook); S.snap = false; }
  else {
    const k = 1 - Math.exp(-dt * (fp ? 14 : 6));
    specCam.lerp(_spWant, k);
    specLook.lerp(_spWantLook, k);
  }
  playerRig.position.copy(specCam);
  const dx = specLook.x - specCam.x, dy = specLook.y - specCam.y, dz = specLook.z - specCam.z;
  yaw = Math.atan2(-dx, -dz);
  pitch = Math.atan2(dy, Math.hypot(dx, dz));
  // 第一人称：藏起他自己的身体（不然镜头在脑袋里）
  if (b.alive) b.group.visible = !fp && b.phase !== "plane";
  updateSpectateScope(b, fp);
  // 他正在打的对手：头顶红色名字
  const foe = b.foe && b.foe.alive && now < b.foeUntil ? b.foe : null;
  if (foe && !fp) {
    setTagText(specFoeTag, foe.name, "#ff5a4a");
    specFoeTag.position.set(foe.group.position.x, foe.group.position.y + 2.45, foe.group.position.z);
    specFoeTag.visible = true;
  } else specFoeTag.visible = false;
  const tagK = Math.tan(camera.fov * Math.PI / 360) / Math.tan(35 * Math.PI / 180);
  specFoeTag.scale.set(0.4 * tagK, 0.08 * tagK, 1);
  if (now > S.nextInfo) { S.nextInfo = now + 250; updateSpectateInfo(b, now); }
  if (S.listOpen && now > S.nextList) { S.nextList = now + 1000; renderSpectateList(); }
}

function specWeaponText(b) {
  if (!b.weaponKey) return "空手";
  const w = WEAPONS_DATA[b.weaponKey], atts = b.weaponAtts[b.activeSlot] || {};
  return w.name.replace(/ .*$/, "") + (atts.scope && ATTACHMENTS_DATA[atts.scope] ? ` · ${ATTACHMENTS_DATA[atts.scope].name.replace(/瞄准镜|镜.*$/, "镜")}` : "");
}
function specStateText(b, now) {
  if (!b.alive) return "已淘汰";
  if (b.foe && b.foe.alive && now < b.foeUntil) return "交火中";
  return SPEC_STATE_LABEL[b.moveMode] || "";
}
function updateSpectateInfo(b, now) {
  document.getElementById("sp-name").innerText = b.name;
  const hp = Math.max(0, Math.min(100, b.hp));
  const fill = document.getElementById("sp-hp-fill");
  fill.style.width = `${b.alive ? hp : 0}%`;
  fill.style.background = hp > 50 ? "linear-gradient(90deg, #3ddc84, #b6f36b)" : (hp > 25 ? "#ffb02e" : "#ff3b30");
  document.getElementById("sp-wep").innerText = specWeaponText(b);
  document.getElementById("sp-kills").innerText = `🎯 ${b.kills || 0} 淘汰`;
  document.getElementById("sp-state").innerText = specStateText(b, now);
  document.getElementById("sp-alive").innerText = `存活 ${specCandidates().length} 人`;
}

// 观战对象列表：按淘汰数排序，点一下就切过去
function renderSpectateList() {
  const el = document.getElementById("sp-list");
  const now = performance.now();
  const list = specCandidates().sort((a, b) => (b.kills || 0) - (a.kills || 0) || a.id - b.id);
  el.innerHTML = "";
  list.forEach(b => {
    const row = document.createElement("div");
    row.className = "sp-row" + (b === specState.target ? " cur" : "");
    const hp = Math.max(0, Math.min(100, b.hp));
    row.innerHTML = `<b></b><span class="k">🎯 ${b.kills || 0}</span><span class="w"></span><span class="s">${specStateText(b, now)}</span><span class="h"><i style="width:${hp}%"></i></span>`;
    row.querySelector("b").innerText = b.name;
    row.querySelector(".w").innerText = specWeaponText(b);
    row.addEventListener("click", () => { setSpectateTarget(b); toggleSpectateList(false); });
    el.appendChild(row);
  });
}
function toggleSpectateList(open) {
  specState.listOpen = open === undefined ? !specState.listOpen : open;
  document.getElementById("sp-list").style.display = specState.listOpen ? "block" : "none";
  if (specState.listOpen) { specState.nextList = 0; renderSpectateList(); }
}
function updateSpectateButtons() {
  document.getElementById("sp-cam").innerText = specState.mode === "fp" ? "🎥 第一人称" : "🎥 第三人称";
}

document.getElementById("sp-prev").addEventListener("click", () => cycleSpectate(-1));
document.getElementById("sp-next").addEventListener("click", () => cycleSpectate(1));
document.getElementById("sp-pick").addEventListener("click", () => toggleSpectateList());
document.getElementById("sp-exit").addEventListener("click", exitSpectate);
document.getElementById("sp-cam").addEventListener("click", () => {
  specState.mode = specState.mode === "fp" ? "tp" : "fp";
  specState.snap = true;
  updateSpectateButtons();
});
window.addEventListener("keydown", e => {
  if (!specState.active) return;
  if (e.code === "Escape") { if (specState.listOpen) toggleSpectateList(false); else exitSpectate(); }
  else if (e.code === "KeyA" || e.code === "ArrowLeft") cycleSpectate(-1);
  else if (e.code === "KeyD" || e.code === "ArrowRight") cycleSpectate(1);
  else if (e.code === "KeyC") document.getElementById("sp-cam").click();
  else if (e.code === "Tab") { e.preventDefault(); toggleSpectateList(); }
});
