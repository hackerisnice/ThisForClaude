// input.js：触屏按钮、摇杆、视角拖动、键盘鼠标
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 11. 触控与键鼠绑定
// ============================================================================
function startTrigger() {
  if (player.phase !== "ground" || player.aimingThrow) return;
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
        applyLookDelta(dx, dy, TOUCH_LOOK_BASE, touchLookAccel(dx, dy, e.timeStamp - lastT));
        lastT = e.timeStamp;
      }
    }
  }, { passive: false });

  const endFn = e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        touchId = null; btn.classList.remove("pressing"); stopTrigger();
      }
    }
  };
  btn.addEventListener("touchend", endFn);
  btn.addEventListener("touchcancel", endFn);
}
bindFireDragButton("btn-fire-left");
bindFireDragButton("btn-fire-right");

// 投掷键：按住 = 拔销瞄准（手指可以拖动转视角调整抛物线），松手 = 扔出
(function bindThrowButton() {
  const btn = document.getElementById("btn-throw");
  let touchId = null, lastX = 0, lastY = 0, lastT = 0;
  btn.addEventListener("touchstart", e => {
    e.preventDefault(); e.stopPropagation();
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    touchId = t.identifier; lastX = t.clientX; lastY = t.clientY; lastT = e.timeStamp;
    btn.classList.add("pressing");
    beginThrowAim();
  }, { passive: false });
  btn.addEventListener("touchmove", e => {
    e.preventDefault(); e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== touchId) continue;
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      lastX = t.clientX; lastY = t.clientY;
      applyLookDelta(dx, dy, TOUCH_LOOK_BASE, touchLookAccel(dx, dy, e.timeStamp - lastT));
      lastT = e.timeStamp;
    }
  }, { passive: false });
  const endFn = e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier !== touchId) continue;
      touchId = null;
      btn.classList.remove("pressing");
      if (e.type === "touchcancel") cancelThrowAim(); else releaseThrow();
    }
  };
  btn.addEventListener("touchend", endFn);
  btn.addEventListener("touchcancel", endFn);
  // 桌面端鼠标点按
  btn.addEventListener("mousedown", e => { e.stopPropagation(); beginThrowAim(); });
  btn.addEventListener("mouseup", e => { e.stopPropagation(); releaseThrow(); });
})();

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

bindInstantTouchButton("btn-jump", () => {
  if (player.phase === "ground" && player.velY === 0) {
    player.stance = "stand";
    player.velY = 6.8;
  }
});
bindInstantTouchButton("btn-ads", () => {
  if (player.aimingThrow) return;
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
  if (player.activeSlot === 0) {
    cycleWeaponFireMode(0);
  } else {
    player.activeSlot = 0; player.isADS = false; player.reopenADSAfterBolt = false;
    rebuildFPGunModel(); updateScopeState(); updateAllHUD();
  }
});
bindInstantTouchButton("slot-wep-1", () => {
  if (player.activeSlot === 1) {
    cycleWeaponFireMode(1);
  } else {
    player.activeSlot = 1; player.isADS = false; player.reopenADSAfterBolt = false;
    rebuildFPGunModel(); updateScopeState(); updateAllHUD();
  }
});
bindInstantTouchButton("slot-firemode", () => {
  cycleWeaponFireMode(player.activeSlot);
});

document.getElementById("btn-close-bag").addEventListener("click", () => {
  document.getElementById("backpack-modal").style.display = "none";
});

const keysPressed = {};
window.addEventListener("keydown", e => {
  if (replayState.active) return; // 回放中只响应回放快捷键（见 replay.js）
  keysPressed[e.code] = true;
  if (e.code === "KeyF") jumpFromPlane();
  if (e.code === "KeyR") reloadActiveWeapon();
  if (e.code === "Space" && player.phase === "ground" && player.velY === 0) {
    player.stance = "stand"; player.velY = 6.8;
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
  if (e.code === "KeyG" && !e.repeat) beginThrowAim();
  if (e.code === "KeyT") cycleThrowable();
  if (e.code === "Tab") {
    e.preventDefault();
    const modal = document.getElementById("backpack-modal");
    if (modal.style.display === "flex") modal.style.display = "none";
    else { cancelThrowAim(); renderBackpackModal(); modal.style.display = "flex"; document.exitPointerLock?.(); }
  }
});
window.addEventListener("keyup", e => {
  keysPressed[e.code] = false;
  if (e.code === "KeyG") releaseThrow();
});

renderer.domElement.addEventListener("mousedown", e => {
  if (document.getElementById("backpack-modal").style.display === "flex") return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
    return;
  }
  if (e.button === 0) startTrigger();
  else if (e.button === 2 && !player.aimingThrow) { player.reopenADSAfterBolt = false; player.isADS = !player.isADS; updateScopeState(); }
});
window.addEventListener("mouseup", e => { if (e.button === 0) stopTrigger(); });
window.addEventListener("contextmenu", e => e.preventDefault());
window.addEventListener("mousemove", e => {
  if (document.pointerLockElement === renderer.domElement) {
    applyLookDelta(e.movementX, e.movementY, MOUSE_LOOK_BASE);
  }
});
