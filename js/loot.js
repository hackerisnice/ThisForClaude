// loot.js：淘汰播报、死亡盒、物资拾取 / 丢弃、负重、背包界面
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 7. 淘汰播报与死亡盒掉落
// ============================================================================
const deathCrateGeo = new THREE.BoxGeometry(0.95, 0.45, 0.65);
const deathCrateMat = new THREE.MeshLambertMaterial({ color: 0xa8743f, map: woodTex });

function killAIBot(bot, killerName, weaponName, isHeadshot, byPlayer = false) {
  if (!bot.alive) return;
  bot.alive = false;
  bot.group.visible = false;
  if (bot.tactic) botEndTactic(bot); // 让出狙击楼

  const crate = new THREE.Mesh(deathCrateGeo, deathCrateMat);
  crate.position.set(bot.group.position.x, bot.group.position.y + 0.23, bot.group.position.z);
  crate.castShadow = true;
  scene.add(crate);
  freezeObject(crate);
  replayOnBotKilled(bot, crate, killerName, weaponName, isHeadshot, byPlayer);

  const bx = bot.group.position.x, bz = bot.group.position.z, by = bot.group.position.y;
  // 盒子掉落 AI 身上的全部装备：两把枪（连同配件）+ 对应子弹、头盔、防弹衣、背包、药品、手雷
  bot.weapons.forEach((wk, i) => {
    if (!wk) return;
    const wd = WEAPONS_DATA[wk];
    spawnRandomGroundLoot(bx + 0.35, bz - 0.3 + i * 0.6, {
      kind: "weapon", id: wk, name: wd.name, ammoInMag: wd.mag, attachments: Object.assign({}, bot.weaponAtts[i])
    }, by);
    spawnRandomGroundLoot(bx + 0.85, bz - 0.3 + i * 0.6, {
      kind: "ammo", id: wd.ammoType, name: `${wd.ammoType} 子弹`, count: wd.type === "SG" ? 10 : 30
    }, by);
  });
  if (bot.helmLv) spawnRandomGroundLoot(bx - 0.45, bz - 0.35, { kind: "gear", sub: "helm", name: `${bot.helmLv}级头盔`, lv: bot.helmLv, dur: bot.helmLv * 80, maxDur: bot.helmLv * 80 }, by);
  if (bot.vestLv) spawnRandomGroundLoot(bx - 0.45, bz + 0.15, { kind: "gear", sub: "vest", name: `${bot.vestLv}级防弹衣`, lv: bot.vestLv, dur: bot.vestLv * 100, maxDur: bot.vestLv * 100 }, by);
  if (bot.bagLv) spawnRandomGroundLoot(bx - 0.9, bz - 0.1, { kind: "gear", sub: "bag", name: `${bot.bagLv}级背包`, lv: bot.bagLv, capBonus: bot.bagLv * 70 }, by);
  if (bot.meds > 0) spawnRandomGroundLoot(bx, bz + 0.6, { kind: "med", id: "firstaid", name: MEDS_DATA.firstaid.name, count: Math.min(3, bot.meds) }, by);
  THROW_ORDER.forEach((id, k) => {
    if (bot.nades[id] > 0) spawnRandomGroundLoot(bx + 0.5 - k * 0.32, bz + 0.6, { kind: "throwable", id, name: THROWABLES_DATA[id].name, count: bot.nades[id] }, by);
  });
  spawnRandomGroundLoot(bx - 0.35, bz + 0.25, null, by);

  const aliveNow = aiPlayers.filter(a => a.alive).length + (player.phase !== "dead" ? 1 : 0);
  document.getElementById("alive-count").innerText = aliveNow;

  const kf = document.getElementById("killfeed");
  const item = document.createElement("div");
  item.className = "kill-item";
  item.innerText = `${killerName} [${weaponName}${isHeadshot ? "💥" : ""}] 淘汰了 ${bot.name}`;
  kf.prepend(item);
  setTimeout(() => item.remove(), 4500);

  if (byPlayer) {
    player.kills++;
    document.getElementById("kill-count").innerText = player.kills;
    sfx.playKillConfirm();

    const banner = document.getElementById("center-kill-banner");
    document.getElementById("ck-title").innerText = `你 使用 ${weaponName} ${isHeadshot ? "爆头" : ""}淘汰了 ${bot.name}`;
    document.getElementById("ck-sub").innerText = `${player.kills} 淘汰 - 剩余 ${aliveNow} 人`;
    banner.style.opacity = 1;
    clearTimeout(banner._t);
    banner._t = setTimeout(() => { banner.style.opacity = 0; }, 2400);
  }

  if (aliveNow === 1 && player.phase !== "dead") {
    showGameOver(true, 1);
  }
}

function damagePlayer(dmg, attackerName, wepName, isHead = false) {
  if (player.phase === "dead") return;
  let actual = dmg;
  // 毒圈、坠落、燃烧不受防弹衣减免；被打中头部时由头盔减伤
  const ignoreArmor = attackerName === "电网蓝圈 (Blue Zone)" || wepName === "跌落" || wepName === "燃烧瓶";
  if (!ignoreArmor && isHead) {
    if (player.helm && player.helm.dur > 0) {
      const red = player.helm.lv === 3 ? 0.55 : (player.helm.lv === 2 ? 0.40 : 0.30);
      actual = Math.round(dmg * (1 - red));
      player.helm.dur = Math.max(0, player.helm.dur - dmg * 0.6);
    }
  } else if (!ignoreArmor && player.vest && player.vest.dur > 0) {
    const red = player.vest.lv === 3 ? 0.55 : (player.vest.lv === 2 ? 0.40 : 0.30);
    actual = Math.round(dmg * (1 - red));
    player.vest.dur = Math.max(0, player.vest.dur - dmg * 0.6);
  }
  player.hp = Math.max(0, player.hp - actual);

  const df = document.getElementById("damage-flash");
  df.style.boxShadow = "inset 0 0 95px rgba(255, 20, 0, 0.85)";
  setTimeout(() => { df.style.boxShadow = "inset 0 0 90px rgba(255, 20, 0, 0)"; }, 180);

  updateAllHUD();

  if (player.hp <= 0) {
    player.phase = "dead";
    unequipThrowable();
    replayOnPlayerDeath(attackerName, wepName);
    const rank = aiPlayers.filter(a => a.alive).length + 1;
    showGameOver(false, rank, `${attackerName} (${wepName})`);
  }
}

function showGameOver(isWin, rank, killerInfo = "") {
  const modal = document.getElementById("gameover-modal");
  modal.style.display = "flex";
  document.getElementById("go-title").innerText = isWin
    ? "🏆 大吉大利，今晚吃鸡！(WINNER WINNER CHICKEN DINNER)"
    : `💀 再接再厉，本局被 ${killerInfo} 淘汰`;
  document.getElementById("go-stats").innerText = `最终排名: #${rank} / 50 | 淘汰人数: ${player.kills} | 累计伤害: ${player.totalDmg}`;
  replayOnGameOver();
}

// ============================================================================
// 8. 物资拾取、真实负重校验与物品丢弃系统
// ============================================================================
function pickupLootObject(lootEntry) {
  const idx = worldLootItems.indexOf(lootEntry);
  if (idx === -1) return;
  const it = lootEntry.item;
  const curWeight = getUsedBagWeight();

  if (it.kind === "weapon") {
    let targetSlot = player.weapons[0] === null ? 0 : (player.weapons[1] === null ? 1 : player.activeSlot);
    const oldWep = player.weapons[targetSlot];
    const newAtts = Object.assign({}, it.attachments || {});
    if (oldWep) {
      // 端游同款换枪：旧枪上的配件自动装到新枪上；新枪装不上的放进背包；背包也满了才随旧枪留在地上
      // （原版会把配件连同旧枪一起丢在地上，看起来就像配件“莫名其妙消失”了）
      const newSlots = WEAPONS_DATA[it.id].slots;
      const keptOnOld = {}, moved = [], bagged = [];
      Object.keys(oldWep.attachments).forEach(slot => {
        const attId = oldWep.attachments[slot];
        const a = ATTACHMENTS_DATA[attId];
        if (!a) return;
        if (newSlots.includes(slot) && !newAtts[slot]) {
          newAtts[slot] = attId;
          moved.push(a.name);
        } else if (getUsedBagWeight() + (a.weight || 10) <= player.maxCap) {
          player.attBag.push({ id: a.id, name: a.name, slot: a.slot });
          bagged.push(a.name);
        } else {
          keptOnOld[slot] = attId;
        }
      });
      spawnRandomGroundLoot(
        playerRig.position.x + (Math.random() - 0.5) * 1.2,
        playerRig.position.z + (Math.random() - 0.5) * 1.2,
        { kind: "weapon", id: oldWep.id, name: oldWep.name, ammoInMag: oldWep.ammoInMag, attachments: keptOnOld, noAutoPickup: true },
        player.feetY
      );
      const msg = [];
      if (moved.length) msg.push(`配件已转移到新枪：${moved.join("、")}`);
      if (bagged.length) msg.push(`放入背包：${bagged.join("、")}`);
      if (msg.length) showToast("🔧 " + msg.join("；"));
    }
    player.weapons[targetSlot] = {
      id: it.id,
      name: it.name.replace("🔥", ""),
      ammoInMag: it.ammoInMag,
      fireMode: WEAPONS_DATA[it.id].modes[0],
      attachments: newAtts
    };
    player.activeSlot = targetSlot;
    rebuildFPGunModel();
    if (player.isADS) updateScopeState();
  } else if (it.kind === "ammo") {
    const unitW = AMMO_WEIGHT[it.id] || 0.5;
    const availSpace = player.maxCap - curWeight;
    const maxCanTake = Math.floor(availSpace / unitW);
    if (maxCanTake <= 0) {
      showToast("背包满了，先丢点东西");
      return;
    }
    const actualTake = Math.min(it.count, maxCanTake);
    player.ammoBag[it.id] = (player.ammoBag[it.id] || 0) + actualTake;
    if (actualTake < it.count) {
      it.count -= actualTake;
      showToast(`背包将满，仅拾取了 ${actualTake} 发 ${it.id}`);
      updateAllHUD();
      if (document.getElementById("backpack-modal").style.display === "flex") renderBackpackModal();
      return;
    }
  } else if (it.kind === "throwable") {
    const tw = THROWABLES_DATA[it.id].weight * (it.count || 1);
    if (curWeight + tw > player.maxCap) {
      showToast("⚠️ 背包空间不足，无法拾取该投掷物！");
      return;
    }
    player.throwBag[it.id] = (player.throwBag[it.id] || 0) + (it.count || 1);
    if ((player.throwBag[player.throwSel] || 0) <= 0) player.throwSel = it.id;
  } else if (it.kind === "med") {
    const medW = (MEDS_DATA[it.id]?.weight || 5) * (it.count || 1);
    if (curWeight + medW > player.maxCap) {
      showToast("⚠️ 背包空间不足，无法拾取该医疗品！");
      return;
    }
    player.medBag[it.id] = (player.medBag[it.id] || 0) + (it.count || 1);
  } else if (it.kind === "attachment") {
    const curWep = player.weapons[player.activeSlot];
    if (curWep && WEAPONS_DATA[curWep.id].slots.includes(it.slot) && !curWep.attachments[it.slot]) {
      curWep.attachments[it.slot] = it.id;
      rebuildFPGunModel();
      if (player.isADS) updateScopeState();
    } else {
      const attW = ATTACHMENTS_DATA[it.id]?.weight || 10;
      if (curWeight + attW > player.maxCap) {
        showToast("⚠️ 背包空间不足，无法放入该配件！");
        return;
      }
      player.attBag.push({ id: it.id, name: it.name, slot: it.slot });
    }
  } else if (it.kind === "gear") {
    if (it.sub === "helm" && (!player.helm || it.lv >= player.helm.lv)) player.helm = it;
    if (it.sub === "vest" && (!player.vest || it.lv >= player.vest.lv)) player.vest = it;
    if (it.sub === "bag" && it.lv > player.bagLv) {
      player.bagLv = it.lv;
      player.maxCap = 150 + it.capBonus;
    }
  }

  lootEntry.gone = true;
  scene.remove(lootEntry.mesh);
  worldLootItems.splice(idx, 1);
  sfx.playBoltAction();
  updateAllHUD();
  if (document.getElementById("backpack-modal").style.display === "flex") renderBackpackModal();
}

// ---------------------------------------------------------------------------
// 自动拾取（仿手游）：武器栏有空位时自动捡枪；自动捡手中枪械的子弹、更高级的头盔/甲/背包、
// 当前枪空位可装的配件、少量药品。自己从背包丢出的东西不会被再次自动捡起
// ---------------------------------------------------------------------------
const AUTO_MED_LIMIT = { medkit: 1, firstaid: 3, bandage: 8, adrenaline: 1, painkiller: 3, drink: 4 };
const AUTO_AMMO_LIMIT = 240;
const AUTO_THROW_LIMIT = { frag: 3, smoke: 2, stun: 2, molotov: 2 };

function wantsAutoPickup(it) {
  if (it.noAutoPickup) return false;
  const freeW = player.maxCap - getUsedBagWeight();
  if (it.kind === "weapon") return player.weapons[0] === null || player.weapons[1] === null;
  if (it.kind === "ammo") {
    return player.weapons.some(w => w && WEAPONS_DATA[w.id].ammoType === it.id) &&
      (player.ammoBag[it.id] || 0) < AUTO_AMMO_LIMIT && freeW >= (AMMO_WEIGHT[it.id] || 0.5);
  }
  if (it.kind === "gear") {
    if (it.sub === "helm") return !player.helm || it.lv > player.helm.lv;
    if (it.sub === "vest") return !player.vest || it.lv > player.vest.lv;
    return it.lv > player.bagLv;
  }
  if (it.kind === "med") {
    return (player.medBag[it.id] || 0) < (AUTO_MED_LIMIT[it.id] || 0) &&
      freeW >= (MEDS_DATA[it.id]?.weight || 5) * (it.count || 1);
  }
  if (it.kind === "attachment") {
    const w = player.weapons[player.activeSlot];
    return !!w && WEAPONS_DATA[w.id].slots.includes(it.slot) && !w.attachments[it.slot];
  }
  if (it.kind === "throwable") {
    return (player.throwBag[it.id] || 0) < (AUTO_THROW_LIMIT[it.id] || 0) && freeW >= THROWABLES_DATA[it.id].weight * (it.count || 1);
  }
  return false;
}

// 玩家与物资之间没有墙才自动捡（防止隔墙吸物资）
function isLootReachable(px, pz, lx, lz) {
  const d = Math.hypot(lx - px, lz - pz);
  const steps = Math.ceil(d / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (t * d > d - 0.35) break;
    if (isPointBlocked2D(px + (lx - px) * t, pz + (lz - pz) * t, 0.02, player.feetY)) return false;
  }
  return true;
}

function tryAutoPickup(near) {
  if (!gameSettings.autoPickup || player.phase !== "ground") return;
  const px = playerRig.position.x, pz = playerRig.position.z;
  let best = null, bestD = 2.4;
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    const d = Math.hypot(e.x - px, e.z - pz);
    if (d < bestD && wantsAutoPickup(e.item) && isLootReachable(px, pz, e.x, e.z)) { best = e; bestD = d; }
  }
  if (!best) return;
  const name = best.item.name + (best.item.count ? " x" + best.item.count : "");
  pickupLootObject(best);
  if (best.gone) showToast(`✅ 自动拾取：${name}`);
}

window.dropAttachmentFromBag = function(attIndex) {
  const att = player.attBag[attIndex];
  if (!att) return;
  player.attBag.splice(attIndex, 1);
  spawnRandomGroundLoot(
    playerRig.position.x + (Math.random() - 0.5) * 1.4,
    playerRig.position.z + (Math.random() - 0.5) * 1.4,
    { kind: "attachment", id: att.id, name: att.name, slot: att.slot, noAutoPickup: true },
    player.feetY
  );
  sfx.playBoltAction();
  updateAllHUD();
  renderBackpackModal();
};

window.dropThrowableFromBag = function(id) {
  if ((player.throwBag[id] || 0) <= 0) return;
  player.throwBag[id]--;
  spawnRandomGroundLoot(
    playerRig.position.x + (Math.random() - 0.5) * 1.4,
    playerRig.position.z + (Math.random() - 0.5) * 1.4,
    { kind: "throwable", id, name: THROWABLES_DATA[id].name, count: 1, noAutoPickup: true },
    player.feetY
  );
  sfx.playBoltAction();
  updateAllHUD();
  renderBackpackModal();
};

window.selectThrowable = function(id) {
  if ((player.throwBag[id] || 0) <= 0) return;
  player.throwSel = id;
  updateAllHUD();
  renderBackpackModal();
};

window.dropMedFromBag = function(medId) {
  if ((player.medBag[medId] || 0) <= 0) return;
  player.medBag[medId]--;
  spawnRandomGroundLoot(
    playerRig.position.x + (Math.random() - 0.5) * 1.4,
    playerRig.position.z + (Math.random() - 0.5) * 1.4,
    { kind: "med", id: medId, name: MEDS_DATA[medId].name, count: 1, noAutoPickup: true },
    player.feetY
  );
  sfx.playBoltAction();
  updateAllHUD();
  renderBackpackModal();
};

window.dropAmmoFromBag = function(ammoKey, dropAll = false) {
  const cur = player.ammoBag[ammoKey] || 0;
  if (cur <= 0) return;
  const amount = dropAll ? cur : Math.min(cur, 30);
  player.ammoBag[ammoKey] -= amount;
  spawnRandomGroundLoot(
    playerRig.position.x + (Math.random() - 0.5) * 1.4,
    playerRig.position.z + (Math.random() - 0.5) * 1.4,
    { kind: "ammo", id: ammoKey, name: `${ammoKey} 子弹`, count: amount, noAutoPickup: true },
    player.feetY
  );
  sfx.playBoltAction();
  updateAllHUD();
  renderBackpackModal();
};

window.equipAttachmentFromBag = function(attIndex, targetWepSlot) {
  const att = player.attBag[attIndex];
  const wep = player.weapons[targetWepSlot];
  if (!att || !wep) return;
  const wData = WEAPONS_DATA[wep.id];
  if (!wData.slots.includes(att.slot)) {
    showToast(`${wep.name} 不支持安装 ${att.name}`);
    return;
  }
  const oldAttId = wep.attachments[att.slot];
  if (oldAttId) {
    const oldA = ATTACHMENTS_DATA[oldAttId];
    player.attBag.push({ id: oldA.id, name: oldA.name, slot: oldA.slot });
  }
  wep.attachments[att.slot] = att.id;
  player.attBag.splice(attIndex, 1);
  sfx.playBoltAction();
  rebuildFPGunModel();
  updateScopeState();
  updateAllHUD();
  renderBackpackModal();
};

window.unequipAttachmentToBag = function(wepSlot, slotName) {
  const wep = player.weapons[wepSlot];
  if (!wep || !wep.attachments[slotName]) return;
  const attId = wep.attachments[slotName];
  const a = ATTACHMENTS_DATA[attId];
  player.attBag.push({ id: a.id, name: a.name, slot: a.slot });
  delete wep.attachments[slotName];
  if (player.isADS) updateScopeState();
  rebuildFPGunModel();
  updateAllHUD();
  renderBackpackModal();
};

window.useMedItem = function(medId) {
  if (player.phase !== "ground") return;
  if ((player.medBag[medId] || 0) <= 0) return;
  const m = MEDS_DATA[medId];
  document.getElementById("backpack-modal").style.display = "none";

  startCastProgress(`💊 正在使用 ${m.name}...`, m.castTime, () => {
    player.medBag[medId]--;
    if (m.healTo > 0 && player.hp < m.healTo) player.hp = m.healTo;
    if (m.healAdd) player.hp = Math.min(m.maxCap || 100, player.hp + m.healAdd);
    if (m.boostAdd > 0) player.boost = Math.min(100, player.boost + m.boostAdd);
    updateAllHUD();
  });
};

function renderBackpackModal() {
  const usedW = getUsedBagWeight();
  document.getElementById("bag-weight-header").innerText = `容量: ${usedW} / ${player.maxCap} (背包Lv.${player.bagLv})`;

  const groundDiv = document.getElementById("bag-ground-list");
  groundDiv.innerHTML = "";
  const near = getNearbyLoot();
  if (near.length === 0) {
    groundDiv.innerHTML = `<div style="color:#777;font-size:10px;">附近地面没有物资</div>`;
  } else {
    near.forEach(entry => {
      const row = document.createElement("div");
      row.className = "inv-row";
      row.innerHTML = `<span>${entry.item.name} ${entry.item.count ? "x" + entry.item.count : ""}</span><button>拾取</button>`;
      row.querySelector("button").onclick = () => pickupLootObject(entry);
      groundDiv.appendChild(row);
    });
  }

  const invDiv = document.getElementById("bag-inventory-list");
  invDiv.innerHTML = "";
  player.attBag.forEach((att, idx) => {
    const w = ATTACHMENTS_DATA[att.id]?.weight || 10;
    const row = document.createElement("div");
    row.className = "inv-row";
    row.innerHTML = `
      <span style="color:#00d2ff;">🔧 ${att.name} <small style="color:#888;">(${w})</small></span>
      <div>
        ${player.weapons[0] ? `<button onclick="equipAttachmentFromBag(${idx}, 0)">装枪1</button>` : ""}
        ${player.weapons[1] ? `<button onclick="equipAttachmentFromBag(${idx}, 1)">装枪2</button>` : ""}
        <button class="btn-drop" onclick="dropAttachmentFromBag(${idx})">丢弃</button>
      </div>`;
    invDiv.appendChild(row);
  });

  Object.keys(player.medBag).forEach(mKey => {
    const cnt = player.medBag[mKey];
    if (cnt > 0) {
      const w = (MEDS_DATA[mKey]?.weight || 5) * cnt;
      const row = document.createElement("div");
      row.className = "inv-row";
      row.innerHTML = `
        <span style="color:#00ff88;">💊 ${MEDS_DATA[mKey].name} x${cnt} <small style="color:#888;">(${w})</small></span>
        <div>
          <button onclick="useMedItem('${mKey}')">使用</button>
          <button class="btn-drop" onclick="dropMedFromBag('${mKey}')">丢1个</button>
        </div>`;
      invDiv.appendChild(row);
    }
  });

  THROW_ORDER.forEach(tKey => {
    const cnt = player.throwBag[tKey];
    if (cnt > 0) {
      const td = THROWABLES_DATA[tKey];
      const row = document.createElement("div");
      row.className = "inv-row";
      row.innerHTML = `
        <span style="color:#ffb36b;">${td.icon} ${td.name} x${cnt} <small style="color:#888;">(${td.weight * cnt})</small>${player.throwSel === tKey ? ' <b style="color:#ffd000;">[当前]</b>' : ""}</span>
        <div>
          ${player.throwSel === tKey ? "" : `<button onclick="selectThrowable('${tKey}')">选用</button>`}
          <button class="btn-drop" onclick="dropThrowableFromBag('${tKey}')">丢1个</button>
        </div>`;
      invDiv.appendChild(row);
    }
  });

  Object.keys(player.ammoBag).forEach(aKey => {
    const cnt = player.ammoBag[aKey];
    if (cnt > 0) {
      const w = Math.round(cnt * (AMMO_WEIGHT[aKey] || 0.5));
      const row = document.createElement("div");
      row.className = "inv-row";
      row.innerHTML = `
        <span style="color:#ffe600;">弹药: ${aKey} x${cnt} <small style="color:#888;">(${w})</small></span>
        <div>
          <button class="btn-drop" onclick="dropAmmoFromBag('${aKey}', false)">丢30发</button>
          <button class="btn-drop" onclick="dropAmmoFromBag('${aKey}', true)">全丢</button>
        </div>`;
      invDiv.appendChild(row);
    }
  });

  const wepPanel = document.getElementById("bag-weapons-panel");
  wepPanel.innerHTML = "";
  const slotLabels = { scope: "倍镜", muzzle: "枪口", sg_muzzle: "霰弹枪口", grip: "握把", mag: "弹匣", stock: "枪托/撞火", loops: "子弹袋" };

  [0, 1].forEach(slotIdx => {
    const wep = player.weapons[slotIdx];
    const card = document.createElement("div");
    card.className = "wep-equip-card";
    if (!wep) {
      card.innerHTML = `<div style="color:#888;font-size:11px;">武器槽 ${slotIdx + 1}: 未装备</div>`;
    } else {
      const wData = WEAPONS_DATA[wep.id];
      let slotsHtml = "";
      wData.slots.forEach(sName => {
        const equippedId = wep.attachments[sName];
        const eqName = equippedId ? ATTACHMENTS_DATA[equippedId].name : "空";
        slotsHtml += `
          <div class="att-slot-box ${equippedId ? "filled" : ""}" onclick="unequipAttachmentToBag(${slotIdx}, '${sName}')">
            <span>${slotLabels[sName] || sName}:</span>
            <strong>${eqName}</strong>
          </div>`;
      });
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;color:#ffa500;">
          <span>槽${slotIdx + 1}: ${wep.name}</span>
          <span>弹匣: ${wep.ammoInMag}发</span>
        </div>
        <div class="att-grid">${slotsHtml}</div>`;
    }
    wepPanel.appendChild(card);
  });
}

function getNearbyLoot() {
  if (player.phase !== "ground") return [];
  const px = playerRig.position.x, pz = playerRig.position.z;
  // 只列出同一层楼的物资（楼上楼下的不显示）
  return worldLootItems.filter(e => Math.hypot(e.x - px, e.z - pz) < 3.8 && Math.abs(e.y - player.feetY) < 1.6);
}
