// hud.js：HUD（武器栏、血量护甲、投掷物按钮、快捷药品）
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 10. HUD 与小地图
// ============================================================================
function cycleWeaponFireMode(slotIdx) {
  const wep = player.weapons[slotIdx];
  if (!wep) return;
  const modes = WEAPONS_DATA[wep.id].modes;
  if (modes.length <= 1) {
    showToast(`${wep.name} 仅支持单种射击模式`);
    return;
  }
  wep.fireMode = modes[(modes.indexOf(wep.fireMode) + 1) % modes.length];
  const modeNames = { auto: "全自动", burst: "连发", single: "单发", bolt: "拉栓" };
  sfx.playBoltAction();
  showToast(`🔫 ${wep.name} 切换为: ${modeNames[wep.fireMode]}`);
  updateAllHUD();
}

function updateAllHUD() {
  document.getElementById("hp-bar-fill").style.width = `${player.hp}%`;
  document.getElementById("hp-text").innerText = `HP ${Math.round(player.hp)} / 100`;
  document.getElementById("boost-bar-fill").style.width = `${player.boost}%`;

  const usedW = getUsedBagWeight();
  document.getElementById("hud-helm").innerText = player.helm ? `🪖Lv${player.helm.lv}(${Math.round(player.helm.dur)})` : "🪖无";
  document.getElementById("hud-vest").innerText = player.vest ? `🦺Lv${player.vest.lv}(${Math.round(player.vest.dur)})` : "🦺无";
  document.getElementById("hud-bag").innerText = `🎒Lv${player.bagLv}(${usedW}/${player.maxCap})`;

  const modeNames = { auto: "全自动", burst: "连发", single: "单发", bolt: "拉栓" };
  [0, 1].forEach(idx => {
    const w = player.weapons[idx];
    const slotEl = document.getElementById("slot-wep-" + idx);
    slotEl.classList.toggle("active", player.activeSlot === idx && !player.throwEquipped);
    if (!w) {
      document.getElementById("wep-name-" + idx).innerText = `${idx + 1}: 空置`;
      document.getElementById("wep-mode-" + idx).innerText = "--";
      document.getElementById("wep-ammo-" + idx).innerText = "--";
    } else {
      const b = WEAPONS_DATA[w.id];
      const st = getActiveWeaponEffectiveStats(w);
      const reserve = player.ammoBag[b.ammoType] || 0;
      document.getElementById("wep-name-" + idx).innerText = `${idx + 1}:${w.name}`;
      document.getElementById("wep-mode-" + idx).innerText = st.hasBumpStock ? "撞火" : (modeNames[w.fireMode] || "单发");
      document.getElementById("wep-ammo-" + idx).innerText = `${w.ammoInMag}/${reserve}`;
    }
  });

  const curWep = player.weapons[player.activeSlot];
  const sgCircle = document.getElementById("sg-circle");
  if (player.throwEquipped) {
    document.getElementById("slot-firemode").innerText = "投掷";
    sgCircle.style.display = "none";
  } else if (curWep) {
    const b = WEAPONS_DATA[curWep.id];
    const st = getActiveWeaponEffectiveStats(curWep);
    document.getElementById("slot-firemode").innerText = st.hasBumpStock ? "撞火" : (modeNames[curWep.fireMode] || "单发");
    if (b.type === "SG" && !player.isADS) {
      sgCircle.style.display = "block";
      const isDuck = curWep.attachments.sg_muzzle === "duckbill";
      sgCircle.style.width = isDuck ? "68px" : "46px";
      sgCircle.style.height = isDuck ? "22px" : "46px";
    } else {
      sgCircle.style.display = "none";
    }
  } else {
    document.getElementById("slot-firemode").innerText = "拳头";
    sgCircle.style.display = "none";
  }

  // 投掷物按钮：当前选中的种类与数量
  const tSel = THROWABLES_DATA[player.throwSel];
  const tCnt = player.throwBag[player.throwSel] || 0;
  const totalThrow = THROW_ORDER.reduce((n, k) => n + (player.throwBag[k] || 0), 0);
  document.getElementById("btn-throw").innerHTML = `${tSel.icon}<br><small>${tCnt > 0 ? "x" + tCnt : "无"}</small>`;
  document.getElementById("btn-throw").classList.toggle("empty", totalThrow === 0);
  document.getElementById("btn-throw").classList.toggle("held", !!player.throwEquipped);
  // 拿着投掷物时开火键变成“拉环 / 点燃”，拉着保险时是“松手投掷”
  const pull = player.throwSel === "molotov" ? "点燃" : "拉环";
  const fireR = player.aimingThrow ? "松手<br>投掷" : (player.throwEquipped ? "按住<br>" + pull : "开火<br>压枪");
  const fireL = player.aimingThrow ? "投掷" : (player.throwEquipped ? pull : "开火");
  const fr = document.getElementById("btn-fire-right"), fl = document.getElementById("btn-fire-left");
  if (fr.dataset.label !== fireR) { fr.dataset.label = fireR; fr.innerHTML = fireR; }
  if (fl.dataset.label !== fireL) { fl.dataset.label = fireL; fl.innerHTML = fireL; }
  document.getElementById("btn-throw-cycle").innerText = totalThrow > 0 ? `${tSel.short} ▸` : "投掷物";

  const healOrder = ["firstaid", "medkit", "bandage", "painkiller", "drink", "adrenaline"];
  const availMed = healOrder.find(k => (player.medBag[k] || 0) > 0);
  document.getElementById("quick-heal-name").innerText = availMed
    ? `${MEDS_DATA[availMed].name}(${player.medBag[availMed]})`
    : "无药";
}
