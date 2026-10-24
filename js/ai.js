// ai.js：AI 背包与战术（捡装备、换枪、开火）+ 每帧 AI 大脑 updateAIBot
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// AI 背包与战术：捡第二把枪 / 头盔 / 防弹衣 / 背包 / 药 / 配件，按手中武器决定打法，按距离或弹药换枪
// ============================================================================
const BOT_ARMOR_RED = [0.10, 0.30, 0.40, 0.55]; // 无甲时保留原版 10% 基础减伤；1~3 级与玩家防弹衣数值一致
function botArmorReduction(bot, isHead) {
  return BOT_ARMOR_RED[isHead ? bot.helmLv : bot.vestLv] || 0.10;
}

// 各类武器的 AI 打法：每轮连发数、射击间隔、伤害系数、近/远距离单发命中率、最大交战距离、偏好距离、换弹时长
// （步枪的整体秒伤与原版 AI 基本持平；喷子贴脸极痛但打不远；狙击单发伤害高但慢）
const AI_WEAPON_PROFILE = {
  AR:  { volley: 3, cdMin: 750,  cdMax: 1150, dmgMul: 0.30, hitNear: 0.136, hitFar: 0.08,  nearR: 25, farR: 135, maxRange: 135, prefRange: 32, reload: 2300 },
  SMG: { volley: 4, cdMin: 600,  cdMax: 950,  dmgMul: 0.30, hitNear: 0.145, hitFar: 0.022, nearR: 15, farR: 70,  maxRange: 75,  prefRange: 16, reload: 2000 },
  LMG: { volley: 5, cdMin: 800,  cdMax: 1200, dmgMul: 0.26, hitNear: 0.095, hitFar: 0.066, nearR: 25, farR: 135, maxRange: 135, prefRange: 38, reload: 4200 },
  SG:  { volley: 1, cdMin: 950,  cdMax: 1400, dmgMul: 0.20, hitNear: 0.40,  hitFar: 0.0,   nearR: 7,  farR: 30,  maxRange: 30,  prefRange: 9,  reload: 3200 },
  DMR: { volley: 1, cdMin: 850,  cdMax: 1300, dmgMul: 0.45, hitNear: 0.195, hitFar: 0.16,  nearR: 35, farR: 135, maxRange: 135, prefRange: 50, reload: 2800 },
  SR:  { volley: 1, cdMin: 1900, cdMax: 2700, dmgMul: 0.60, hitNear: 0.22,  hitFar: 0.18,  nearR: 35, farR: 135, maxRange: 135, prefRange: 60, reload: 3600 }
};
// 武器在 近(<18m) / 中(<60m) / 远 距离的适用度，AI 据此决定切哪把枪
const AI_RANGE_FIT = { SG: [1.0, 0.25, 0.0], SMG: [0.95, 0.6, 0.15], AR: [0.7, 1.0, 0.7], LMG: [0.6, 0.9, 0.75], DMR: [0.35, 0.8, 0.95], SR: [0.2, 0.6, 1.0] };
const AI_VS_AI_DMG = { AR: 1.0, SMG: 0.9, LMG: 1.0, SG: 1.0, DMR: 1.2, SR: 1.8 };
const BOT_GUN_LENGTH = { AR: 1.0, SMG: 0.72, LMG: 1.15, SG: 1.05, DMR: 1.25, SR: 1.4 };
const BOT_MED_CAP = [3, 5, 7, 9]; // 背包等级越高能带的药越多

function botProfile(bot) {
  return AI_WEAPON_PROFILE[WEAPONS_DATA[bot.weaponKey].type] || AI_WEAPON_PROFILE.AR;
}

function botMagSize(bot, slot) {
  const w = WEAPONS_DATA[bot.weapons[slot]];
  return bot.weaponAtts[slot].mag === "ext_mag" ? w.ext : w.mag;
}

function botSetActiveSlot(bot, slot) {
  bot.activeSlot = slot;
  bot.weaponKey = bot.weapons[slot];
  bot.botGunMesh.visible = !!bot.weaponKey;
  if (bot.weaponKey) bot.botGunMesh.scale.set(1, 1, BOT_GUN_LENGTH[WEAPONS_DATA[bot.weaponKey].type] || 1);
  botRefreshGunLook(bot);
}
// 手上的枪装了倍镜就在模型上显示出来
function botRefreshGunLook(bot) {
  bot.scopeMesh.visible = !!(bot.weaponKey && bot.weaponAtts[bot.activeSlot].scope);
}
// 开镜所需时间：倍率越高抬枪越慢（与玩家开镜动画同一量级）
function botAdsTime(bot) {
  const sc = bot.weaponKey && bot.weaponAtts[bot.activeSlot].scope;
  const zoom = sc && ATTACHMENTS_DATA[sc] ? ATTACHMENTS_DATA[sc].zoom : 1.1;
  return 0.2 + Math.min(0.24, (zoom - 1) * 0.035);
}
// 瞄准方式对命中率的影响：开镜后明显更准（瞄得越久越稳），不开镜腰射远了就很飘；10 米内腰射不吃亏
function botAimFactor(bot, dist) {
  const hip = dist < 10 ? 1.0 : (dist < 25 ? 0.72 : 0.5);
  const ads = 1.3 + 0.15 * bot.aimSettle;
  return hip + (ads - hip) * bot.adsBlend;
}

function botGiveWeapon(bot, key, atts) {
  const slot = bot.weapons[0] === null ? 0 : (bot.weapons[1] === null ? 1 : -1);
  if (slot < 0) return false;
  bot.weapons[slot] = key;
  bot.weaponAtts[slot] = Object.assign({}, atts || {});
  bot.mags[slot] = botMagSize(bot, slot);
  if (!bot.weaponKey) botSetActiveSlot(bot, slot);
  return true;
}

function removeLootEntry(entry) {
  entry.gone = true;
  scene.remove(entry.mesh);
  const idx = worldLootItems.indexOf(entry);
  if (idx !== -1) worldLootItems.splice(idx, 1);
}

function botAttachmentTargetSlot(bot, item) {
  for (let i = 0; i < 2; i++) {
    const w = bot.weapons[i];
    if (w && WEAPONS_DATA[w].slots.includes(item.slot) && !bot.weaponAtts[i][item.slot]) return i;
  }
  return -1;
}

// AI 对一件物资的需求度（0 = 不需要）
function botLootScore(bot, item) {
  if (item.kind === "weapon") {
    if (bot.weapons[0] && bot.weapons[1]) return item.airdrop && botAirdropSwapSlot(bot, item.id) >= 0 ? 3.0 : 0;
    const t = WEAPONS_DATA[item.id].type;
    const curT = bot.weaponKey ? WEAPONS_DATA[bot.weaponKey].type : null;
    // 第二把枪优先拿与手上互补的类型（狙+步、喷+步……），同类型的兴趣较低
    return (WEAPONS_DATA[item.id].airdropOnly ? 3.5 : 2.5) + (curT && curT !== t ? 0.8 : 0) - (curT === t ? 1.2 : 0);
  }
  if (item.kind === "gear") {
    const cur = item.sub === "helm" ? bot.helmLv : (item.sub === "vest" ? bot.vestLv : bot.bagLv);
    return item.lv > cur ? 1.6 + (item.lv - cur) * 0.4 : 0;
  }
  if (item.kind === "med") return bot.meds < BOT_MED_CAP[bot.bagLv] ? 1.0 : 0;
  if (item.kind === "attachment") return botAttachmentTargetSlot(bot, item) >= 0 ? 0.8 : 0;
  if (item.kind === "throwable") return item.id === "frag" && bot.frags < 2 ? 0.9 : 0;
  return 0;
}

// 在 38 米内挑一个“需求度 / 距离”最划算的物资作为搜刮目标（每个 AI 约 1 秒扫描一次）
function scanBotLootTarget(bot, now) {
  const bx = bot.group.position.x, bz = bot.group.position.z;
  let best = null, bestScore = 0;
  for (let i = 0; i < worldLootItems.length; i++) {
    const e = worldLootItems[i];
    const dx = e.x - bx, dz = e.z - bz;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1444) continue;
    const s = botLootScore(bot, e.item);
    if (s <= 0) continue;
    const score = s / (1 + Math.sqrt(d2) / 10);
    if (score > bestScore) { bestScore = score; best = e; }
  }
  if (best !== bot.lootTarget) bot.lootTargetSince = now;
  bot.lootTarget = best;
}

// 两把枪都满时捡空投枪：换掉同类型的那把，没有同类型就换掉更不顺手的一把（喷子/冲锋枪优先被换）
const BOT_GUN_VALUE = { SG: 0, SMG: 1, AR: 2, LMG: 3, DMR: 3, SR: 3 };
function botAirdropSwapSlot(bot, newId) {
  const t = WEAPONS_DATA[newId].type;
  for (let i = 0; i < 2; i++) if (bot.weapons[i] === newId) return -1;
  for (let i = 0; i < 2; i++) if (WEAPONS_DATA[bot.weapons[i]].type === t && !WEAPONS_DATA[bot.weapons[i]].airdropOnly) return i;
  const v = i => (WEAPONS_DATA[bot.weapons[i]].airdropOnly ? 9 : BOT_GUN_VALUE[WEAPONS_DATA[bot.weapons[i]].type]);
  const slot = v(0) <= v(1) ? 0 : 1;
  return v(slot) < 9 ? slot : -1;
}

function botPickupLoot(bot, entry, now) {
  const it = entry.item;
  if (botLootScore(bot, it) <= 0) return;
  if (it.kind === "weapon" && bot.weapons[0] && bot.weapons[1]) {
    // 换枪：旧枪连同配件丢在地上
    const slot = botAirdropSwapSlot(bot, it.id);
    const old = bot.weapons[slot], wd = WEAPONS_DATA[old];
    spawnRandomGroundLoot(bot.group.position.x + 0.6, bot.group.position.z + 0.4, {
      kind: "weapon", id: old, name: wd.name, ammoInMag: wd.mag, attachments: Object.assign({}, bot.weaponAtts[slot])
    }, bot.group.position.y);
    bot.weapons[slot] = it.id;
    bot.weaponAtts[slot] = Object.assign({}, it.attachments || {});
    bot.mags[slot] = botMagSize(bot, slot);
    botSetActiveSlot(bot, slot);
    bot.swapUntil = now + 700;
  } else if (it.kind === "weapon") {
    botGiveWeapon(bot, it.id, it.attachments);
  } else if (it.kind === "gear") {
    if (it.sub === "helm") bot.helmLv = it.lv;
    else if (it.sub === "vest") bot.vestLv = it.lv;
    else bot.bagLv = it.lv;
  } else if (it.kind === "med") {
    bot.meds = Math.min(BOT_MED_CAP[bot.bagLv], bot.meds + (it.count || 1));
  } else if (it.kind === "attachment") {
    bot.weaponAtts[botAttachmentTargetSlot(bot, it)][it.slot] = it.id;
    botRefreshGunLook(bot);
  } else if (it.kind === "throwable") {
    bot.frags += it.count || 1;
  }
  removeLootEntry(entry);
  bot.pauseUntil = now + 300 + Math.random() * 500; // 捡东西的短暂停顿
}

// 抢空投：每 1.5~2.5 秒看一次附近有没有空投（还在降落的也算，提前往烟那边跑）。
// 每个 AI 的“贪心程度”不同：贪的人 500 米外也会冲过去，稳的人只捡离自己 160 米内的；
// 空投在电网里、或者里面已经没有自己用得上的东西就不去
function botPickAirdrop(bot, now) {
  if (now < bot.nextAirdropCheck) return bot.airdropTarget;
  bot.nextAirdropCheck = now + 1500 + Math.random() * 1000;
  const bx = bot.group.position.x, bz = bot.group.position.z;
  let best = null, bestD = Infinity;
  for (let i = 0; i < airdrops.length; i++) {
    const ad = airdrops[i];
    if (!ad.landed && ad.crateGroup.position.y > ad.landY + 120) continue;
    if (ad.landed && (!ad.lootEntries || !ad.lootEntries.some(e => !e.gone && botLootScore(bot, e.item) > 0))) continue;
    if (Math.hypot(ad.x - zoneState.cx, ad.z - zoneState.cz) > zoneState.curR - 15) continue;
    const d = Math.hypot(ad.x - bx, ad.z - bz);
    if (d > 160 + 340 * bot.greed || d >= bestD) continue;
    best = ad; bestD = d;
  }
  bot.airdropTarget = best;
  return best;
}

// 命中率：随距离从近距值过渡到远距值；倍镜提升远距离命中、枪口/握把更稳；玩家蹲/趴更难被打中
function botHitChance(bot, prof, dist) {
  let p = prof.hitNear + (prof.hitFar - prof.hitNear) * smoothstep(prof.nearR, prof.farR, dist);
  const atts = bot.weaponAtts[bot.activeSlot];
  p *= botAimFactor(bot, dist);
  if (atts.scope && dist > 40) p *= 1.3;
  if (atts.muzzle) p *= 1.08;
  if (atts.grip) p *= 1.08;
  if (player.stance === "crouch") p *= 0.9;
  else if (player.stance === "prone") p *= 0.75;
  return p;
}

function botShotDamage(wData, prof, dist) {
  if (wData.type === "SG") {
    const falloff = 1 - smoothstep(6, 28, dist) * 0.8;
    return Math.round(wData.pellets * wData.dmgPerPellet * prof.dmgMul * falloff * (0.8 + Math.random() * 0.4));
  }
  return Math.round(wData.dmg * prof.dmgMul * (0.85 + Math.random() * 0.3));
}

// 换枪：按交战距离选最合适的枪（近距离切喷子/冲锋枪，远距离切狙击/连狙），没子弹的枪优先级降低
function botConsiderWeaponSwitch(bot, dist, now) {
  const other = 1 - bot.activeSlot;
  if (!bot.weapons[other] || now < bot.swapUntil) return;
  const band = dist < 18 ? 0 : (dist < 60 ? 1 : 2);
  const fit = slot => AI_RANGE_FIT[WEAPONS_DATA[bot.weapons[slot]].type][band] - (bot.mags[slot] <= 0 ? 0.35 : 0);
  if (fit(other) > fit(bot.activeSlot) + 0.2) {
    botSetActiveSlot(bot, other);
    bot.swapUntil = now + 600;
    if (bot.mags[other] <= 0) {
      // 切回来的是空枪：切完顺手换弹（例如喷子打空后先用副武器顶住，再切回喷子装填）
      bot.reloadUntil = now + 600 + botProfile(bot).reload;
      bot.mags[other] = botMagSize(bot, other);
    } else {
      bot.reloadUntil = 0;
    }
  }
}

// 打完一轮：扣弹匣；打空时近距离直接切副武器（比换弹快），否则原地换弹
function botAfterShots(bot, shots, dist, now) {
  const slot = bot.activeSlot;
  bot.mags[slot] -= shots;
  if (bot.mags[slot] > 0) return;
  const other = 1 - slot;
  if (dist < 30 && bot.weapons[other] && bot.mags[other] > 0) {
    botSetActiveSlot(bot, other);
    bot.swapUntil = now + 550;
  } else {
    bot.reloadUntil = now + botProfile(bot).reload;
    bot.mags[slot] = botMagSize(bot, slot);
  }
}

// 枪口世界坐标（枪模前端，随开镜姿势、身体俯仰一起动）
function botMuzzlePosition(bot, out) {
  bot.botGunMesh.updateWorldMatrix(true, false);
  return out.set(0, 0, 0.36).applyMatrix4(bot.botGunMesh.matrixWorld);
}
// AI 开枪的枪口火光（远处看得到谁在开枪）
function spawnBotMuzzleFlash(bot) {
  spawnFx({ pos: botMuzzlePosition(bot, new THREE.Vector3()), color: 0xffc76a, s0: 0.35, s1: 0.75, a0: 1, a1: 0, life: 0.06, additive: true });
}

// 向玩家打一轮连发：每发按射速间隔播放枪声并独立判定命中
function botFireAtPlayer(bot, dist, now) {
  const wData = WEAPONS_DATA[bot.weaponKey];
  const prof = botProfile(bot);
  const shots = Math.max(1, Math.min(prof.volley, bot.mags[bot.activeSlot]));
  const hitP = botHitChance(bot, prof, dist);
  const isSupp = bot.weaponAtts[bot.activeSlot].muzzle === "supp";
  const gap = Math.max(50, 60000 / wData.rpm);
  for (let s = 0; s < shots; s++) {
    setTimeout(() => {
      if (!bot.alive || player.phase !== "ground") return;
      const d = bot.group.position.distanceTo(playerRig.position);
      sfx.playShot(isSupp, 1.0, d, stereoPanFor(bot.group.position.x, bot.group.position.z));
      registerRadarSound("shot", bot.group.position.x, bot.group.position.z, isSupp);
      if (!isSupp && d < 260) spawnBotMuzzleFlash(bot);
      const hit = Math.random() < hitP;
      replayBotShot(bot, playerRig.position.x, player.feetY + player.eyeH * 0.72, playerRig.position.z, hit);
      if (hit) damagePlayer(botShotDamage(wData, prof, d), bot.name, wData.name);
    }, s * gap);
  }
  botAfterShots(bot, shots, dist, now);
}

// ============================================================================
// AI 完整生命周期：飞机跳出 -> 高空俯冲 -> 开降落伞滑翔 -> 落地触须避障寻路 & 交火走位
// （主循环每帧对每个 AI 调用一次）
// ============================================================================
function updateAIBot(bot, dt, now, elapsed) {
  if (!bot.alive) return;

  // 阶段 A：到达跳伞时间，从运输机舱门跳出进入高空俯冲 (sky)
  // 按飞机实际飞过的距离判断（不按时间：手机卡顿/切后台时飞机少飞了一段，AI 也不会提前在错误位置跳）
  if (bot.phase === "plane" && (flightPath.travel >= bot.dropS || !planeGroup.visible)) {
    bot.phase = "sky";
    bot.group.visible = true;
    bot.chuteMesh.visible = false;
    bot.group.position.set(
      planeGroup.position.x + (Math.random() - 0.5) * 10,
      planeGroup.position.y - 3,
      planeGroup.position.z + (Math.random() - 0.5) * 10
    );
  }

  // 阶段 B：空中跳伞俯冲与开伞滑翔 (sky -> chute -> ground)
  if (bot.phase === "sky" || bot.phase === "chute") {
    const toLandX = bot.landTarget.x - bot.group.position.x;
    const toLandZ = bot.landTarget.z - bot.group.position.z;
    const dist2D = Math.hypot(toLandX, toLandZ);
    // 开伞时机：高度降至 58m 自动开伞；目标太远时提前开伞，用伞降滑翔飞得更远（滑翔比更高）
    if (bot.phase === "sky" && bot.group.position.y < PLANE_ALT - 15 &&
        (bot.group.position.y <= 58 || dist2D > bot.group.position.y * 0.68 + 30)) {
      bot.phase = "chute";
      bot.chuteMesh.visible = true;
    }
    const fallSpd = bot.phase === "sky" ? 38 : 11.5;
    const glideSpd = bot.phase === "sky" ? 26 : 21;
    bot.group.position.y -= fallSpd * dt;
    if (dist2D > 1) {
      const step = Math.min(dist2D, glideSpd * dt);
      bot.group.position.x += (toLandX / dist2D) * step;
      bot.group.position.z += (toLandZ / dist2D) * step;
      bot.group.lookAt(bot.landTarget.x, bot.group.position.y, bot.landTarget.z);
    }
    poseBotInAir(bot, bot.phase === "chute");
    // 伞衣随风轻微摆动
    if (bot.phase === "chute") bot.chuteMesh.rotation.z = Math.sin(now * 0.0016 + bot.wanderPhase) * 0.08;

    // 触地收伞（可落在遗迹台基/桥面上），如果落在楼顶则自动顺移到门外地面
    const touchY = getGroundHeight(bot.group.position.x, bot.group.position.z, bot.group.position.y + 0.05);
    if (bot.group.position.y <= touchY) {
      bot.group.position.y = touchY;
      bot.phase = "ground";
      bot.landedAt = elapsed;
      bot.chuteMesh.visible = false;
      const landedOnHouse = getBuildingContainingPoint(bot.group.position.x, bot.group.position.z, 0.8);
      if (landedOnHouse) {
        const door = Math.random() < 0.5 ? landedOnHouse.southDoor : landedOnHouse.northDoor;
        bot.group.position.set(door.x, 0, door.z);
      }
      // 落在树干/石头/草垛里时挤到旁边空地（原版会永久卡死在里面原地踏步）
      pushOutOfColliders(bot.group.position, 0.44, bot.group.position.y);
      bot.targetPos.set(
        bot.group.position.x + (Math.random() - 0.5) * 30,
        0,
        bot.group.position.z + (Math.random() - 0.5) * 30
      );
    }
    return;
  }

  // 阶段 C：地面战术行动（跑毒 + 进门搜枪 + 7向触须避障 + 交火左右横移走位）
  if (bot.phase === "ground") {
    pushOutOfColliders(bot.group.position, 0.44, bot.group.position.y);
    const distToSafeCenter = Math.hypot(bot.group.position.x - zoneState.cx, bot.group.position.z - zoneState.cz);
    const isOutsideSafe = distToSafeCenter > zoneState.targetR * 0.90;
    const isInBlueZone = distToSafeCenter > zoneState.curR;
    const isAlerted = now < bot.alertUntil;
    const distToPlayer = bot.group.position.distanceTo(playerRig.position);
    const canSeePlayer = player.phase === "ground" && distToPlayer < 135 && hasLineOfSight(bot.group.position, playerRig.position, 1.5, -0.2);
    const stunned = now < bot.stunnedUntil;
    const fleeing = now < bot.fleeUntil;

    // 打药被打断：进入交火视野或身处毒圈时放弃
    if (bot.healUntil > 0 && ((isAlerted && canSeePlayer) || isInBlueZone)) bot.healUntil = 0;
    // 每隔约 1 秒扫描一次附近值得搜的物资（找不到/走不到的目标 15 秒后放弃，避免死磕）
    if (now > bot.nextLootScan) {
      bot.nextLootScan = now + 800 + Math.random() * 500;
      if (bot.weaponKey && !isAlerted) scanBotLootTarget(bot, now);
    }
    if (bot.lootTarget && now - bot.lootTargetSince > 15000) {
      bot.lootTarget = null;
      bot.nextLootScan = now + 8000;
    }

    let moveGoal = bot.targetPos;
    let moveSpd = isInBlueZone ? 6.3 : 5.0;
    let moveMode = "patrol";
    let adTarget = null;

    // 0. 躲手雷 / 逃离火海（最高优先级）；被震爆弹闪到时原地踉跄
    if (fleeing) {
      moveMode = "flee";
      const ax = bot.group.position.x - bot.fleeX, az = bot.group.position.z - bot.fleeZ;
      const al = Math.hypot(ax, az) || 1;
      moveGoal = new THREE.Vector3(bot.group.position.x + ax / al * 14, bot.group.position.y, bot.group.position.z + az / al * 14);
      moveSpd = 6.3;
    } else if (stunned) {
      moveMode = "stunned";
      moveGoal = new THREE.Vector3(bot.group.position.x + Math.sin(now * 0.003 + bot.id) * 4, bot.group.position.y, bot.group.position.z + Math.cos(now * 0.0025 + bot.id) * 4);
      moveSpd = 1.4;
    // 1. 跑毒
    } else if (isInBlueZone || (isOutsideSafe && !isAlerted)) {
      moveMode = "zone";
      const angleToCenter = Math.atan2(zoneState.cz - bot.group.position.z, zoneState.cx - bot.group.position.x);
      moveGoal = new THREE.Vector3(
        bot.group.position.x + Math.cos(angleToCenter) * 45,
        0,
        bot.group.position.z + Math.sin(angleToCenter) * 45
      );
    } else if (isAlerted && canSeePlayer && bot.weaponKey) {
      // 2. 与玩家交火时：执行左右蝴蝶步横移走位 (Strafing)，绝不站桩！
      moveMode = "combat";
      // 按距离切换最合适的枪（近距离切喷子/冲锋枪，远距离切狙击/连狙）
      if (now > bot.nextWeaponEval) {
        bot.nextWeaponEval = now + 900;
        botConsiderWeaponSwitch(bot, distToPlayer, now);
      }
      const wType = WEAPONS_DATA[bot.weaponKey].type;
      const sniper = wType === "SR" || wType === "DMR";
      const closeGun = wType === "SG" || wType === "SMG";
      if (now > bot.nextStrafeFlip) {
        // 不规则节奏：多数时候反向横移，偶尔急停定点射击，偶尔继续同向长距离拉扯；近距离时左右晃得更快
        // 狙击/连狙远距离时更多原地架枪，喷子/冲锋枪几乎不停步
        const r = Math.random();
        const pauseP = sniper && distToPlayer > 40 ? 0.55 : (closeGun ? 0.1 : 0.2);
        if (r < pauseP) bot.strafePauseUntil = now + (sniper ? 600 + Math.random() * 900 : 200 + Math.random() * 350);
        else if (r < 0.85) bot.strafeDir = -bot.strafeDir;
        bot.nextStrafeFlip = now + (distToPlayer < 20 ? 320 + Math.random() * 520 : 600 + Math.random() * 1400);
      }
      // 按手中武器保持交战距离：喷子/冲锋枪贴脸压近，狙击/连狙拉开距离，步枪中距离
      const prefRange = botProfile(bot).prefRange + bot.rangeBias;
      let strafeOffset = distToPlayer > 22 ? 1.15 : 1.55;
      if (distToPlayer > prefRange + 12) strafeOffset = closeGun ? 0.45 : 0.8;
      else if (distToPlayer < prefRange - 8) strafeOffset = 2.05;
      const angleToPlayer = Math.atan2(playerRig.position.x - bot.group.position.x, playerRig.position.z - bot.group.position.z);
      const strafeAngle = angleToPlayer + bot.strafeDir * strafeOffset;
      moveGoal = new THREE.Vector3(
        bot.group.position.x + Math.sin(strafeAngle) * 12,
        0,
        bot.group.position.z + Math.cos(strafeAngle) * 12
      );
      // 在楼里交火时就在本层窗边/门口横移，不会为了走位跑下楼、冲出门
      const fightIn = getBuildingContainingPoint(bot.group.position.x, bot.group.position.z, -0.3);
      if (fightIn) {
        moveGoal.x = Math.max(fightIn.cx - fightIn.w / 2 + 1.2, Math.min(fightIn.cx + fightIn.w / 2 - 1.2, moveGoal.x));
        moveGoal.z = Math.max(fightIn.cz - fightIn.d / 2 + 1.2, Math.min(fightIn.cz + fightIn.d / 2 - 1.2, moveGoal.z));
        moveGoal.y = bot.group.position.y;
      }
      moveSpd = now < bot.strafePauseUntil ? 0 : (closeGun && distToPlayer > prefRange + 12 ? 5.9 : 5.4);
    } else if (bot.healUntil > 0 || (bot.hp < 62 && bot.meds > 0 && !isInBlueZone && !(isAlerted && canSeePlayer))) {
      // 3. 受伤且安全时原地打药（约 4 秒回 45 血，期间被发现则中断）
      moveMode = "heal";
      moveSpd = 0;
      if (bot.healUntil === 0) {
        bot.healUntil = now + 3500 + Math.random() * 1500;
      } else if (now >= bot.healUntil) {
        bot.hp = Math.min(100, bot.hp + 45);
        bot.meds--;
        bot.healUntil = 0;
      }
    } else if (!bot.weaponKey) {
      moveMode = "loot";
      // 4. 没枪时寻找最近地面枪械（配合房门导航、上下楼梯拾取）；大地图物资多，每 0.3 秒重新挑一次目标
      if (!bot.wepTarget || bot.wepTarget.gone || now > bot.wepTargetScan) {
        bot.wepTargetScan = now + 300;
        let best = null, bestD = 9999;
        for (let i = 0; i < worldLootItems.length; i++) {
          const entry = worldLootItems[i];
          if (entry.item.kind === "weapon") {
            const d = Math.hypot(entry.x - bot.group.position.x, entry.z - bot.group.position.z) + Math.abs(entry.y - bot.group.position.y) * 2;
            if (d < bestD) { bestD = d; best = entry; }
          }
        }
        bot.wepTarget = best;
      }
      const nearestWepLoot = bot.wepTarget;
      if (nearestWepLoot) {
        moveGoal = new THREE.Vector3(nearestWepLoot.x, nearestWepLoot.y, nearestWepLoot.z);
        const minDist = Math.hypot(nearestWepLoot.x - bot.group.position.x, nearestWepLoot.z - bot.group.position.z);
        if (minDist < 3.2 && Math.abs(nearestWepLoot.y - bot.group.position.y) < 1.2) {
          botGiveWeapon(bot, nearestWepLoot.item.id, nearestWepLoot.item.attachments);
          removeLootEntry(nearestWepLoot);
          bot.wepTarget = null;
          bot.pauseUntil = now + 350 + Math.random() * 650; // 捡枪后短暂停顿（像真人在装备）
        }
      } else if (elapsed > bot.landedAt + 22) {
        botGiveWeapon(bot, "ump45", {});
      }
    } else if (!isAlerted && bot.hp > 45 && (adTarget = botPickAirdrop(bot, now)) &&
               Math.hypot(adTarget.x - bot.group.position.x, adTarget.z - bot.group.position.z) > 14) {
      // 5. 抢空投：冲刺跑向空投（到 14 米内交给下面的搜刮逻辑去捡箱子周围的物资）
      moveMode = "airdrop";
      if (!bot.lootTarget && Math.hypot(adTarget.x - bot.group.position.x, adTarget.z - bot.group.position.z) < 34) bot.nextLootScan = 0;
      moveGoal = new THREE.Vector3(adTarget.x + Math.sin(bot.wanderPhase) * 3, adTarget.landY, adTarget.z + Math.cos(bot.wanderPhase) * 3);
      moveSpd = 6.1;
    } else if (bot.lootTarget && !bot.lootTarget.gone && !isAlerted) {
      // 6. 已有枪：继续搜第二把枪 / 头盔 / 防弹衣 / 背包 / 药 / 配件
      moveMode = "loot";
      const lt = bot.lootTarget;
      moveGoal = new THREE.Vector3(lt.x, lt.y, lt.z);
      if (Math.hypot(lt.x - bot.group.position.x, lt.z - bot.group.position.z) < 1.8 && Math.abs(lt.y - bot.group.position.y) < 1.2) {
        botPickupLoot(bot, lt, now);
        bot.lootTarget = null;
        bot.nextLootScan = now + 250;
      }
    } else if (bot.group.position.distanceTo(bot.targetPos) < 4.5) {
      // 7. 巡逻漫游：优先挑选安全区内的其它房区门口巡逻
      const safeHouses = buildingFootprints.filter(b => Math.hypot(b.cx - zoneState.cx, b.cz - zoneState.cz) < zoneState.targetR);
      if (safeHouses.length > 0 && Math.random() < 0.65) {
        const h = safeHouses[Math.floor(Math.random() * safeHouses.length)];
        bot.targetPos.set(h.southDoor.x + (Math.random() - 0.5) * 6, 0, h.southDoor.z + (Math.random() - 0.5) * 6);
      } else {
        bot.targetPos.set(
          bot.group.position.x + (Math.random() - 0.5) * 80,
          0,
          bot.group.position.z + (Math.random() - 0.5) * 80
        );
      }
      moveGoal = bot.targetPos;
      // 到达巡逻点后有一定概率驻足观察四周，而不是马不停蹄地折返跑
      if (Math.random() < 0.55) bot.pauseUntil = now + 700 + Math.random() * 2000;
    }

    if (moveMode === "patrol" && now < bot.pauseUntil) moveSpd = 0;

    // 开镜瞄准：交火时按倍镜举枪开镜（红点约 0.2 秒、8 倍镜约 0.45 秒），瞄好了才开第一枪；
    // 开镜移动变慢、命中率明显提高；贴脸（喷子 18 米、其它枪 10 米内）直接腰射。和别的 AI 对枪时同样开镜
    const wTypeNow = bot.weaponKey ? WEAPONS_DATA[bot.weaponKey].type : null;
    const reloadingNow = now < bot.reloadUntil || now < bot.swapUntil || bot.healUntil > 0 || stunned;
    const hipRange = wTypeNow === "SG" ? 18 : 10;
    const fightingBot = now < bot.foeUntil;
    const wantADS = !!bot.weaponKey && !reloadingNow && ((moveMode === "combat" && distToPlayer > hipRange) || fightingBot);
    bot.adsBlend = wantADS ? Math.min(1, bot.adsBlend + dt / botAdsTime(bot)) : Math.max(0, bot.adsBlend - dt / 0.16);
    bot.aimSettle = wantADS && bot.adsBlend >= 1 ? Math.min(1, bot.aimSettle + dt / 1.2) : 0;
    if (bot.adsBlend > 0) moveSpd *= 1 - 0.45 * bot.adsBlend;
    const aimInDone = !(moveMode === "combat" && distToPlayer > hipRange) || bot.adsBlend >= 0.9;
    // 枪口上下对准目标（目标站 / 蹲 / 趴的高度不同，楼上楼下也能对准）
    if (moveMode === "combat") bot.aimPitch = Math.atan2(player.feetY + player.eyeH * 0.72 - (bot.group.position.y + 1.55), Math.max(1, distToPlayer));
    else if (fightingBot) bot.aimPitch = Math.atan2(bot.foeY + 1.2 - (bot.group.position.y + 1.55), Math.max(1, bot.foeDist));
    else bot.aimPitch *= Math.max(0, 1 - dt * 6);
    bot.wanderAmp = moveMode === "patrol" ? 0.26 : (moveMode === "zone" ? 0.14 : (moveMode === "loot" ? 0.08 : 0));

    // 执行 7向触须避障 + 房门导航移动（带转向/加减速惯性与个体速度差异）
    const movedDist = steerAndMoveAI(bot, moveGoal, moveSpd * bot.speedMul, dt);

    // 脚步声：按步幅计步，带左右方位与地面材质；隔着楼层听起来更闷更小
    bot.stepAccum += movedDist;
    if (bot.stepAccum > 2.0) {
      bot.stepAccum = 0;
      if (distToPlayer < 45 && player.phase === "ground") {
        const otherFloor = Math.abs(bot.group.position.y - player.feetY) > 2.4;
        const vol = Math.pow(1 - distToPlayer / 45, 1.6) * 0.34 * (otherFloor ? 0.45 : 1);
        sfx.playFootstep(surfaceTypeAt(bot.group.position.x, bot.group.position.z, bot.group.position.y), vol, stereoPanFor(bot.group.position.x, bot.group.position.z));
        registerRadarSound("step", bot.group.position.x, bot.group.position.z);
      }
    }

    // 朝向控制：交火时面向玩家一边横移一边射击；平时面向行进方向；停下时左右张望
    // 全部为限速平滑转身，不再瞬间“瞬移式”转头
    let faceYaw, turnRate;
    if (isAlerted && canSeePlayer) {
      faceYaw = Math.atan2(playerRig.position.x - bot.group.position.x, playerRig.position.z - bot.group.position.z);
      turnRate = 11;
    } else if (now < bot.faceHintUntil) {
      faceYaw = bot.faceHintYaw;
      turnRate = 9;
    } else if (bot.curSpeed < 0.8) {
      faceYaw = bot.moveHeading + Math.sin(now * 0.0011 + bot.wanderPhase) * 1.0;
      turnRate = 2.2;
    } else {
      faceYaw = bot.moveHeading;
      turnRate = 6.5;
    }
    turnBotTowardYaw(bot, faceYaw, turnRate * dt);
    const busy = now < bot.reloadUntil || now < bot.swapUntil || bot.healUntil > 0 || stunned;
    animateBotBody(bot, dt, !!bot.weaponKey && (isAlerted || fightingBot) && !busy, distToPlayer, now);

    // AI 射击与反击逻辑：按手中武器的射速 / 射程 / 伤害开火；换弹、切枪、打药期间不能开火
    if (bot.weaponKey && !busy) {
      const prof = botProfile(bot);
      const wType = WEAPONS_DATA[bot.weaponKey].type;
      const cdBase = prof.cdMin + Math.random() * (prof.cdMax - prof.cdMin);
      const fireCooldown = isAlerted ? cdBase : cdBase * 1.8;
      if (now - bot.lastFireTime > fireCooldown) {
        const engageRange = isAlerted ? prof.maxRange : Math.min(prof.maxRange, (wType === "SR" || wType === "DMR") ? 110 : 78);
        const engageChance = isAlerted ? 0.88 : 0.42;

        if (player.phase === "ground" && distToPlayer < engageRange && canSeePlayer && !aimInDone) {
          // 正在举枪开镜：瞄好再打（这一下不会去打别人）
        } else if (player.phase === "ground" && distToPlayer < engageRange && Math.random() < engageChance && canSeePlayer) {
          bot.lastFireTime = now;
          bot.alertUntil = Math.max(bot.alertUntil, now + 6000);
          setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 700);
          botFireAtPlayer(bot, distToPlayer, now);
        } else if (isAlerted && !canSeePlayer && bot.frags > 0 && now > bot.nextGrenadeTime && player.phase === "ground" &&
                   distToPlayer > 9 && distToPlayer < 34 && Math.abs(player.feetY - bot.group.position.y) < 4) {
          // 玩家躲在掩体后：朝玩家位置丢手雷逼走位
          bot.lastFireTime = now;
          bot.nextGrenadeTime = now + 12000 + Math.random() * 9000;
          botThrowGrenade(bot);
        } else {
          const otherBot = aiPlayers.find(o =>
            o !== bot && o.alive && o.phase === "ground" &&
            o.group.position.distanceTo(bot.group.position) < Math.min(68, prof.maxRange) &&
            hasLineOfSight(bot.group.position, o.group.position)
          );
          if (otherBot && Math.random() < 0.32) {
            bot.lastFireTime = now;
            setBotFaceHint(bot, otherBot.group.position.x, otherBot.group.position.z, 900);
            bot.foeUntil = now + 2500;
            bot.foeY = otherBot.group.position.y;
            bot.foeDist = otherBot.group.position.distanceTo(bot.group.position);
            if (distToPlayer < 260 && bot.weaponAtts[bot.activeSlot].muzzle !== "supp") spawnBotMuzzleFlash(bot);
            sfx.playShot(bot.weaponAtts[bot.activeSlot].muzzle === "supp", 1.0, distToPlayer, stereoPanFor(bot.group.position.x, bot.group.position.z));
            registerRadarSound("shot", bot.group.position.x, bot.group.position.z, false);
            // AI 互殴：伤害随武器类型变化，并扣除对方防弹衣减伤
            const od = otherBot.group.position.distanceTo(bot.group.position);
            const typeMul = wType === "SG" ? (od < 15 ? 1.6 : 0.4) : (AI_VS_AI_DMG[wType] || 1);
            otherBot.hp -= Math.round(36 * typeMul * (1 - botArmorReduction(otherBot, false)) / 0.9);
            botAfterShots(bot, prof.volley, od, now);
            replayBotShot(bot, otherBot.group.position.x, otherBot.group.position.y + 1.2, otherBot.group.position.z, true, prof.volley);
            if (otherBot.hp <= 0) {
              killAIBot(otherBot, bot.name, WEAPONS_DATA[bot.weaponKey].name, Math.random() < 0.25, false);
            }
          }
        }
      }
    }
  }
}
