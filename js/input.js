// input.js：触屏按钮、摇杆、视角拖动、键盘鼠标
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 11. 触控与键鼠绑定
// ============================================================================
function startTrigger() {
  if (player.phase !== "ground") return;
  // 手上拿着投掷物：按下开火键 = 拉保险 / 点燃
  if (player.throwEquipped) { beginThrowAim(); return; }
  if (player.aimingThrow) return;
  const wep = player.weapons[player.activeSlot];
  if (!wep) { fireCurrentWeapon(); return; }

  const st = getActiveWeaponEffectiveStats(wep);
  const mode = st.hasBumpStock ? "auto" : wep.fireMode;

  player.isFiring = true;
  if (mode === "single" || mode === "bolt") {
    fireCurrentWeapon();
    player.isFiring = false;
  } else if (mode === "burst") {
    player.burstRemaining = wep.id === "mk47" ? 2 : 3;
  }
}

function stopTrigger() {
  if (player.aimingThrow) releaseThrow(); // 松开开火键 = 扔出
  player.isFiring = false;
  player.consecutiveShots = 0;
}

// ---------------------------------------------------------------------------
// 视角灵敏度：
//  · 触屏基础灵敏度约为原版的 58%（原版 0.0045 弧度/像素，轻轻一划就转 90°）
//  · 垂直方向不再额外放大 1.25 倍（原版上下特别飘）
//  · 开镜灵敏度按倍镜视野自动缩放：8 倍镜不再一碰就甩飞
//  · 轻微触屏加速曲线：慢拖精细微调，快速甩动依然跟手
//  · 设置面板可再调整 0.3x ~ 2.0x
// ---------------------------------------------------------------------------
const TOUCH_LOOK_BASE = 0.0026;
const MOUSE_LOOK_BASE = 0.0028;

function applyLookDelta(dx, dy, baseSens, accel = 1) {
  let sens = baseSens * gameSettings.lookSens * accel;
  if (player.isADS) sens *= (camera.fov / 75) * gameSettings.adsSens * 1.1;
  yaw -= dx * sens;
  pitch -= dy * sens;
  pitch = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, pitch));
}

function touchLookAccel(dx, dy, dtMs) {
  const speed = Math.hypot(dx, dy) / Math.max(dtMs, 8); // 像素/毫秒
  return 0.72 + 0.48 * smoothstep(0.1, 1.4, speed);
}

// 拉着保险时手指拖到“✕ 取消投掷”上
const throwCancelEl = document.getElementById("btn-throw-cancel");
function overThrowCancel(x, y) {
  if (!player.aimingThrow || throwCancelEl.style.display === "none") return false;
  const r = throwCancelEl.getBoundingClientRect();
  return x > r.left - 12 && x < r.right + 12 && y > r.top - 12 && y < r.bottom + 12;
}

function bindFireDragButton(btnId) {
  const btn = document.getElementById(btnId);
  let touchId = null, lastX = 0, lastY = 0, lastT = 0;

  btn.addEventListener("touchstart", e => {
    e.preventDefault(); e.stopPropagation();
    const t = e.changedTouches[0];
    touchId = t.identifier; lastX = t.clientX; lastY = t.clientY; lastT = e.timeStamp;
    btn.classList.add("pressing");
    startTrigger();
  }, { passive: false });

  btn.addEventListener("touchmove", e => {
    e.preventDefault(); e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchId) {
        const dx = t.clientX - lastX, dy = t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
        // 拖到取消键上时不再转视角，按钮亮起提示“松手即取消”
        const armed = overThrowCancel(t.clientX, t.clientY);
        throwCancelEl.classList.toggle("armed", armed);
        if (!armed) applyLookDelta(dx, dy, TOUCH_LOOK_BASE, touchLookAccel(dx, dy, e.timeStamp - lastT));
        lastT = e.timeStamp;
      }
    }
  }, { passive: false });

  const endFn = e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== touchId) continue;
      touchId = null; btn.classList.remove("pressing");
      if (player.aimingThrow && (e.type === "touchcancel" || overThrowCancel(t.clientX, t.clientY))) cancelThrowAim(e.type !== "touchcancel");
      stopTrigger();
    }
  };
  btn.addEventListener("touchend", endFn);
  btn.addEventListener("touchcancel", endFn);
}
bindFireDragButton("btn-fire-left");
bindFireDragButton("btn-fire-right");

// 投掷键：点一下把投掷物拿到手上（再点一下收起、切回枪）；拿着时按住开火键拉保险，松手扔出。
// 拉着保险时出现“✕ 取消投掷”：开火键上的手指拖过去再松开、或用另一根手指点它，都会把保险插回去
bindInstantTouchButton("btn-throw", toggleThrowEquip);
bindInstantTouchButton("btn-door", interactNearestDoor);
throwCancelEl.addEventListener("touchstart", e => { e.preventDefault(); e.stopPropagation(); cancelThrowAim(true); }, { passive: false });
throwCancelEl.addEventListener("mousedown", e => { e.stopPropagation(); cancelThrowAim(true); });

let lookTouchId = null, lookLastX = 0, lookLastY = 0, lookLastT = 0;
renderer.domElement.addEventListener("touchstart", e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (lookTouchId === null && t.clientX > window.innerWidth * 0.22) {
      lookTouchId = t.identifier; lookLastX = t.clientX; lookLastY = t.clientY; lookLastT = e.timeStamp;
    }
  }
}, { passive: false });

renderer.domElement.addEventListener("touchmove", e => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === lookTouchId) {
      const dx = t.clientX - lookLastX, dy = t.clientY - lookLastY;
      lookLastX = t.clientX; lookLastY = t.clientY;
      applyLookDelta(dx, dy, TOUCH_LOOK_BASE, touchLookAccel(dx, dy, e.timeStamp - lookLastT));
      lookLastT = e.timeStamp;
    }
  }
}, { passive: false });

const endLookTouch = e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
  }
};
renderer.domElement.addEventListener("touchend", endLookTouch);
renderer.domElement.addEventListener("touchcancel", endLookTouch);

const joyZone = document.getElementById("joystick-zone");
const joyKnob = document.getElementById("joystick-knob");
let joyTouchId = null, moveVec = { x: 0, z: 0 };

// 摇杆：行程随按钮缩放自适应、12% 中心死区；取消走路——推出死区即按冲刺速度全速移动，摇杆只决定方向
const JOY_DEADZONE = 0.12;
function updateJoystickFromTouch(t) {
  const rect = joyZone.getBoundingClientRect();
  const scale = rect.width / (joyZone.offsetWidth || rect.width) || 1;
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const maxR = joyZone.offsetWidth * 0.36;
  let dx = (t.clientX - cx) / scale, dy = (t.clientY - cy) / scale;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  if (dist / maxR < JOY_DEADZONE) { moveVec.x = 0; moveVec.z = 0; return; }
  moveVec.x = dx / Math.max(dist, 0.001);
  moveVec.z = dy / Math.max(dist, 0.001);
}

joyZone.addEventListener("touchstart", e => {
  e.preventDefault(); e.stopPropagation();
  joyTouchId = e.changedTouches[0].identifier;
  updateJoystickFromTouch(e.changedTouches[0]);
}, { passive: false });

joyZone.addEventListener("touchmove", e => {
  e.preventDefault(); e.stopPropagation();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joyTouchId) updateJoystickFromTouch(t);
  }
}, { passive: false });

const endJoy = e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joyTouchId) {
      joyTouchId = null;
      joyKnob.style.transform = "translate(0px, 0px)";
      moveVec.x = 0; moveVec.z = 0;
    }
  }
};
joyZone.addEventListener("touchend", endJoy);
joyZone.addEventListener("touchcancel", endJoy);

function bindInstantTouchButton(btnId, actionFn) {
  const el = document.getElementById(btnId);
  let lastTrigger = 0;
  const trigger = e => {
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - lastTrigger < 120) return;
    lastTrigger = now;
    actionFn();
  };
  el.addEventListener("touchstart", trigger, { passive: false });
  el.addEventListener("click", trigger);
}

bindInstantTouchButton("btn-jump", jumpOrVault); // 对着矮墙 / 窗户按就是翻越
bindInstantTouchButton("btn-ads", () => {
  if (player.throwEquipped) return;
  player.reopenADSAfterBolt = false;
  player.isADS = !player.isADS;
  updateScopeState();
});
bindInstantTouchButton("btn-reload", reloadActiveWeapon);
bindInstantTouchButton("btn-crouch", () => {
  player.stance = player.stance === "crouch" ? "stand" : "crouch";
});
bindInstantTouchButton("btn-prone", () => {
  player.stance = player.stance === "prone" ? "stand" : "prone";
});
bindInstantTouchButton("btn-throw-cycle", cycleThrowable);
bindInstantTouchButton("btn-bag", () => {
  cancelThrowAim();
  renderBackpackModal();
  document.getElementById("backpack-modal").style.display = "flex";
});
bindInstantTouchButton("btn-heal-quick", () => {
  const healOrder = ["firstaid", "medkit", "bandage", "painkiller", "drink", "adrenaline"];
  const avail = healOrder.find(k => (player.medBag[k] || 0) > 0);
  if (avail) window.useMedItem(avail);
});

bindInstantTouchButton("slot-wep-0", () => {
  // 拿着投掷物时点枪位：收起投掷物、拿出这把枪
  if (player.throwEquipped) { unequipThrowable(); if (player.activeSlot === 0) return; }
  if (player.activeSlot === 0) {
    cycleWeaponFireMode(0);
  } else {
    player.activeSlot = 0; player.isADS = false; player.reopenADSAfterBolt = false;
    rebuildFPGunModel(); updateScopeState(); updateAllHUD();
  }
});
bindInstantTouchButton("slot-wep-1", () => {
  if (player.throwEquipped) { unequipThrowable(); if (player.activeSlot === 1) return; }
  if (player.activeSlot === 1) {
    cycleWeaponFireMode(1);
  } else {
    player.activeSlot = 1; player.isADS = false; player.reopenADSAfterBolt = false;
    rebuildFPGunModel(); updateScopeState(); updateAllHUD();
  }
});
bindInstantTouchButton("slot-firemode", () => {
  if (player.throwEquipped) return;
  cycleWeaponFireMode(player.activeSlot);
});

document.getElementById("btn-close-bag").addEventListener("click", () => {
  document.getElementById("backpack-modal").style.display = "none";
});

const keysPressed = {};
window.addEventListener("keydown", e => {
  if (replayState.active) return; // 回放中只响应回放快捷键（见 replay.js）
  keysPressed[e.code] = true;
  if (e.code === "KeyF") { if (player.phase === "ground") interactNearestDoor(); else jumpFromPlane(); }
  if (e.code === "KeyR") reloadActiveWeapon();
  if (e.code === "Space" && !e.repeat) jumpOrVault();
  if ((e.code === "Digit1" || e.code === "Digit2") && player.throwEquipped) {
    unequipThrowable();
    if (player.activeSlot === (e.code === "Digit1" ? 0 : 1)) return;
  }
  if (e.code === "Digit1") {
    if (player.activeSlot === 0) cycleWeaponFireMode(0);
    else { player.activeSlot = 0; player.isADS = false; rebuildFPGunModel(); updateScopeState(); updateAllHUD(); }
  }
  if (e.code === "Digit2") {
    if (player.activeSlot === 1) cycleWeaponFireMode(1);
    else { player.activeSlot = 1; player.isADS = false; rebuildFPGunModel(); updateScopeState(); updateAllHUD(); }
  }
  if (e.code === "KeyB") cycleWeaponFireMode(player.activeSlot);
  if (e.code === "KeyM") toggleBigMap();
  if (e.code === "KeyG" && !e.repeat) toggleThrowEquip();
  if (e.code === "KeyX" && player.aimingThrow) cancelThrowAim(true);
  if (e.code === "KeyT") cycleThrowable();
  if (e.code === "KeyV" && !e.repeat) markerFromCrosshair();
  if (e.code === "Tab") {
    e.preventDefault();
    const modal = document.getElementById("backpack-modal");
    if (modal.style.display === "flex") modal.style.display = "none";
    else { cancelThrowAim(); renderBackpackModal(); modal.style.display = "flex"; document.exitPointerLock?.(); }
  }
});
window.addEventListener("keyup", e => {
  keysPressed[e.code] = false;
});

renderer.domElement.addEventListener("mousedown", e => {
  if (document.getElementById("backpack-modal").style.display === "flex") return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
    return;
  }
  if (e.button === 0) startTrigger();
  else if (e.button === 1) { e.preventDefault(); markerFromCrosshair(); }
  else if (e.button === 2 && player.aimingThrow) cancelThrowAim(true);
  else if (e.button === 2 && !player.throwEquipped) { player.reopenADSAfterBolt = false; player.isADS = !player.isADS; updateScopeState(); }
});
window.addEventListener("mouseup", e => { if (e.button === 0) stopTrigger(); });
window.addEventListener("contextmenu", e => e.preventDefault());
window.addEventListener("mousemove", e => {
  if (document.pointerLockElement === renderer.domElement) {
    applyLookDelta(e.movementX, e.movementY, MOUSE_LOOK_BASE);
  }
});
