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
  AR:  { volley: 3, cdMin: 750,  cdMax: 1150, dmgMul: 0.26, hitNear: 0.136, hitFar: 0.08,  nearR: 25, farR: 135, maxRange: 135, prefRange: 32, reload: 2300 },
  SMG: { volley: 4, cdMin: 600,  cdMax: 950,  dmgMul: 0.26, hitNear: 0.145, hitFar: 0.022, nearR: 15, farR: 70,  maxRange: 75,  prefRange: 16, reload: 2000 },
  LMG: { volley: 5, cdMin: 800,  cdMax: 1200, dmgMul: 0.22, hitNear: 0.095, hitFar: 0.066, nearR: 25, farR: 135, maxRange: 135, prefRange: 38, reload: 4200 },
  SG:  { volley: 1, cdMin: 950,  cdMax: 1400, dmgMul: 0.17, hitNear: 0.40,  hitFar: 0.0,   nearR: 7,  farR: 30,  maxRange: 30,  prefRange: 9,  reload: 3200 },
  DMR: { volley: 1, cdMin: 850,  cdMax: 1300, dmgMul: 0.38, hitNear: 0.195, hitFar: 0.16,  nearR: 35, farR: 135, maxRange: 135, prefRange: 50, reload: 2800 },
  SR:  { volley: 1, cdMin: 1900, cdMax: 2700, dmgMul: 0.51, hitNear: 0.22,  hitFar: 0.18,  nearR: 35, farR: 135, maxRange: 135, prefRange: 60, reload: 3600 }
};
// 武器在 近(<18m) / 中(<60m) / 远 距离的适用度，AI 据此决定切哪把枪
const AI_RANGE_FIT = { SG: [1.0, 0.25, 0.0], SMG: [0.95, 0.6, 0.15], AR: [0.7, 1.0, 0.7], LMG: [0.6, 0.9, 0.75], DMR: [0.35, 0.8, 0.95], SR: [0.2, 0.6, 1.0] };
const AI_VS_AI_DMG = { AR: 1.0, SMG: 0.9, LMG: 1.0, SG: 1.0, DMR: 1.2, SR: 1.8 };
const BOT_GUN_LENGTH = { AR: 1.0, SMG: 0.72, LMG: 1.15, SG: 1.05, DMR: 1.25, SR: 1.4 };
const BOT_MED_CAP = [3, 5, 7, 9]; // 背包等级越高能带的药越多
const BOT_NADE_CAP = { frag: 3, smoke: 2, stun: 2, molotov: 2 };   // 每种投掷物最多带几个
const BOT_NADE_WANT = { frag: 1.6, smoke: 1.0, stun: 1.0, molotov: 1.2 }; // 看到投掷物基本都会捡

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
  if (item.kind === "throwable") {
    const cap = BOT_NADE_CAP[item.id] || 0;
    return (bot.nades[item.id] || 0) < cap ? BOT_NADE_WANT[item.id] : 0;
  }
  return 0;
}

// 圈外（下一个安全区 0.85 倍半径以外）的东西不去捡：捡完又得跑回来
function botLootOutsideZone(e) {
  return Math.hypot(e.x - zoneState.cx, e.z - zoneState.cz) > zoneState.targetR * 0.85;
}
// 在 38 米内挑一个“需求度 / 距离”最划算的物资作为搜刮目标（每个 AI 约 1 秒扫描一次）
function scanBotLootTarget(bot, now) {
  const bx = bot.group.position.x, bz = bot.group.position.z;
  let best = null, bestScore = 0;
  for (let i = 0; i < worldLootItems.length; i++) {
    const e = worldLootItems[i];
    const dx = e.x - bx, dz = e.z - bz;
    const d2 = dx * dx + dz * dz;
    if (d2 > 1444 || (bot.badLoot && bot.badLoot.has(e)) || botLootOutsideZone(e)) continue;
    const s = botLootScore(bot, e.item);
    if (s <= 0) continue;
    // 隔着楼层的东西算远一点（每差一层约等于多走 10 米），正在去拿的那件优先（不会楼上楼下来回跑）
    const dy = Math.abs(e.y - bot.group.position.y);
    let score = s / (1 + (Math.sqrt(d2) + dy * 3) / 10);
    if (e === bot.lootTarget) score *= 1.35;
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
    bot.nades[it.id] = (bot.nades[it.id] || 0) + (it.count || 1);
  }
  removeLootEntry(entry);
  bot.pauseUntil = now + 300 + Math.random() * 500; // 捡东西的短暂停顿
}

// AI 用投掷物（返回 true 表示这一下用来扔东西了）：
// · 残血还被看着：往自己和玩家中间丢烟，撤退打药
// · 玩家躲起来看不见：往最后看到 / 听到的位置扔——在楼里多半先闪再冲，或者扔燃烧瓶逼出来，否则丢手雷
// · 和别的 AI 对枪时偶尔也丢雷
function botConsiderThrow(bot, now, distToPlayer, canSeePlayer, isAlerted) {
  if (now < bot.nextGrenadeTime) return false;
  const N = bot.nades, pos = bot.group.position;
  if (!(N.frag || N.smoke || N.stun || N.molotov)) return false;
  if (player.phase === "ground" && canSeePlayer && isAlerted && bot.hp < 60 && N.smoke > 0 && distToPlayer > 12 && distToPlayer < 120) {
    const dx = playerRig.position.x - pos.x, dz = playerRig.position.z - pos.z, dl = Math.hypot(dx, dz) || 1;
    if (botThrowNade(bot, "smoke", pos.x + dx / dl * 4.5, pos.y, pos.z + dz / dl * 4.5)) {
      bot.nextGrenadeTime = now + 9000 + Math.random() * 6000;
      bot.fleeX = playerRig.position.x; bot.fleeZ = playerRig.position.z; bot.fleeUntil = now + 2600;
      return true;
    }
  }
  // 正面对枪：玩家站着不动 / 蹲着打（12~32 米）时丢雷逼走位，躲在楼里就丢燃烧瓶
  if (player.phase === "ground" && canSeePlayer && isAlerted && distToPlayer > 12 && distToPlayer < 32 &&
      Math.hypot(playerVel.x, playerVel.z) < 2.5 && Math.random() < 0.22) {
    const px = playerRig.position.x + (Math.random() - 0.5) * 1.5, pz = playerRig.position.z + (Math.random() - 0.5) * 1.5;
    const inB = !!getBuildingContainingPoint(px, pz, -0.3);
    const id = N.molotov > 0 && (inB || Math.random() < 0.3) ? "molotov" : (N.frag > 0 ? "frag" : null);
    if (id && botThrowNade(bot, id, px, player.feetY + 0.1, pz)) {
      bot.nextGrenadeTime = now + 9000 + Math.random() * 6000;
      return true;
    }
  }
  const L = bot.lkp;
  if (player.phase === "ground" && (isAlerted || bot.tactic === "hunt") && !canSeePlayer && L && now - L.t < 15000) {
    const d = Math.hypot(L.x - pos.x, L.z - pos.z), dy = Math.abs(L.y - pos.y);
    const indoors = !!getBuildingContainingPoint(L.x, L.z, -0.3);
    const opts = [];
    if (N.stun > 0 && indoors && d > 7 && d < 24 && dy < 3) opts.push(["stun", 1.2]);
    if (N.molotov > 0 && d > 8 && d < 30 && dy < 3) opts.push(["molotov", indoors || player.stance === "prone" ? 1.1 : 0.45]);
    if (N.frag > 0 && d > 9 && d < 38 && dy < 4) opts.push(["frag", 1.0]);
    if (opts.length) {
      let r = Math.random() * opts.reduce((s, o) => s + o[1], 0), id = opts[0][0];
      for (const o of opts) { r -= o[1]; if (r <= 0) { id = o[0]; break; } }
      if (botThrowNade(bot, id, L.x, L.y + 0.1, L.z)) {
        bot.nextGrenadeTime = now + 10000 + Math.random() * 7000;
        if (id === "stun") bot.pushUntil = now + 5500; // 闪完马上冲进去
        return true;
      }
      bot.nextGrenadeTime = now + 2500; // 扔不过去（隔着墙），过一会儿换个位置再试
    }
  }
  if (now < bot.foeUntil && bot.foe && bot.foe.alive && N.frag > 0 && bot.foeDist > 12 && bot.foeDist < 35 && Math.random() < 0.18) {
    const f = bot.foe.group.position;
    if (botThrowNade(bot, "frag", f.x + (Math.random() - 0.5) * 3, f.y + 0.1, f.z + (Math.random() - 0.5) * 3)) {
      bot.nextGrenadeTime = now + 12000 + Math.random() * 8000;
      return true;
    }
  }
  return false;
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
    if (Math.hypot(ad.x - zoneState.cx, ad.z - zoneState.cz) > Math.min(zoneState.curR - 15, zoneState.targetR * 0.9)) continue;
    const d = Math.hypot(ad.x - bx, ad.z - bz);
    if (d > 160 + 340 * bot.greed || d >= bestD) continue;
    best = ad; bestD = d;
  }
  bot.airdropTarget = best;
  return best;
}

// 命中率：随距离从近距值过渡到远距值；倍镜提升远距离命中、枪口/握把更稳；玩家蹲/趴更难被打中
// （geometric = true：子弹真实飞行时，蹲 / 趴的目标本来就更小，不再额外打折）
function botHitChance(bot, prof, dist, geometric = false) {
  let p = prof.hitNear + (prof.hitFar - prof.hitNear) * smoothstep(prof.nearR, prof.farR, dist);
  const atts = bot.weaponAtts[bot.activeSlot];
  p *= botAimFactor(bot, dist);
  if (atts.scope && dist > 40) p *= 1.3;
  if (atts.muzzle) p *= 1.08;
  if (atts.grip) p *= 1.08;
  if (!geometric && player.stance === "crouch") p *= 0.9;
  else if (!geometric && player.stance === "prone") p *= 0.75;
  // 超远距离（倍镜狙击）再打折：200 米外逐渐变难
  p *= 1 - 0.4 * smoothstep(200, 420, dist);
  return p;
}

// 手上（或指定槽位）枪的倍镜倍率，没镜子为 1
function botScopeZoom(bot, slot = bot.activeSlot) {
  const sc = bot.weapons[slot] && bot.weaponAtts[slot].scope;
  return sc && ATTACHMENTS_DATA[sc] ? ATTACHMENTS_DATA[sc].zoom : 1;
}
// 视野距离：肉眼 135 米；带了倍镜能看得更远（两把枪里倍率最高的那把）
function botSightRange(bot) {
  const z = Math.max(botScopeZoom(bot, 0), botScopeZoom(bot, 1));
  return z >= 6 ? 380 : (z >= 4 ? 320 : (z >= 2 ? 220 : (z > 1 ? 160 : 135)));
}
// 最大交战距离：狙击 / 连狙挂高倍镜能打 300 米以上，步枪挂 3 倍以上能打 200 多米
function botEngageRange(bot, prof, wType) {
  const z = botScopeZoom(bot);
  if (wType === "SR" || wType === "DMR") return z >= 6 ? 380 : (z >= 4 ? 340 : (z >= 2 ? 230 : 160));
  if (wType === "AR" || wType === "LMG") return z >= 3 ? 230 : (z >= 2 ? 190 : prof.maxRange);
  return prof.maxRange;
}
function botHasScopedLongGun(bot) {
  for (let s = 0; s < 2; s++) {
    const w = bot.weapons[s];
    if (w && (WEAPONS_DATA[w].type === "SR" || WEAPONS_DATA[w].type === "DMR") && botScopeZoom(bot, s) >= 3) return true;
  }
  return false;
}

// 能不能看见玩家：135 米内有视线就立刻看见（原逻辑）；更远要靠倍镜，而且要先“发现”——
// 面朝玩家那边时发现进度慢慢涨，玩家在跑动 / 站着 / 刚开过枪更容易被发现，趴着不动很难被发现
const SPOT_STANCE = { stand: 1, crouch: 0.55, prone: 0.22 };
function botCanSeePlayer(bot, d, now, dt) {
  if (player.phase !== "ground") { bot.spot = 0; return false; }
  const pos = bot.group.position;
  const eye = 1.5 - 0.45 * bot.crouchBlend;
  if (d < 135) {
    let v = hasLineOfSight(pos, playerRig.position, eye, -0.2);
    // 蹲着被矮掩体挡住、站起来就能看到：站起来探头
    if (!v && bot.crouchBlend > 0.3 && hasLineOfSight(pos, playerRig.position, 1.5, -0.2)) bot.standUntil = now + 1500;
    if (v) bot.spot = 1;
    else bot.spot = Math.max(0, bot.spot - dt * 0.35);
    return v;
  }
  if (d > botSightRange(bot)) { bot.spot = Math.max(0, bot.spot - dt * 0.35); return false; }
  if (now >= bot.nextFarLOS) {
    bot.nextFarLOS = now + 260 + Math.random() * 140;
    bot.farLOS = hasLineOfSight(pos, playerRig.position, eye, -0.2);
    if (!bot.farLOS && bot.crouchBlend > 0.3 && bot.spot > 0.5 && hasLineOfSight(pos, playerRig.position, 1.5, -0.2)) bot.standUntil = now + 1500;
  }
  if (!bot.farLOS) { bot.spot = Math.max(bot.spot >= 1 ? 0.6 : 0, bot.spot - dt * 0.35); return false; }
  if (bot.spot >= 1) return true;
  _botFwd.set(0, 0, 1).applyQuaternion(bot.group.quaternion);
  const off = Math.abs(angleDiff(Math.atan2(playerRig.position.x - pos.x, playerRig.position.z - pos.z), Math.atan2(_botFwd.x, _botFwd.z)));
  if (off > 1.3) return false; // 背对着看不到
  const R = botSightRange(bot);
  const moving = Math.hypot(playerVel.x, playerVel.z) > 1.2;
  const fired = now - player.lastFiredAt < 1500 && !player.lastFiredSupp;
  let rate = (moving ? 1.0 : 0.4) * (SPOT_STANCE[player.stance] || 1) * (fired ? 3 : 1) *
    (1.6 - 0.9 * (d - 135) / Math.max(1, R - 135)) * (bot.adsBlend > 0.5 ? 1.5 : 1) * (off < 0.5 ? 1.3 : 1);
  if (bot.lkp && now - bot.lkp.t < 8000 && Math.hypot(bot.lkp.x - playerRig.position.x, bot.lkp.z - playerRig.position.z) < 25) rate *= 2;
  const before = bot.spot;
  bot.spot = Math.min(1, bot.spot + dt * rate * 0.45);
  // 余光瞥到远处有动静：转过去仔细看
  if (before < 0.12 && bot.spot >= 0.12 && now > bot.faceHintUntil) setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 2500);
  return bot.spot >= 1;
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

// AI 的瞄准方向：按玩家当前移动速度 × 子弹飞行时间给提前量、按下坠量抬枪（各自有技术误差），
// 再加上由命中率换算出的瞄准散布（距离越远散布越大）。打不打得中由子弹真正飞到哪决定
const BOT_HIT_R = 0.64; // 把命中率换算成散布时用的等效目标半径（米）
const BOT_ACCURACY = 2.0; // AI 打玩家的命中率倍数（伤害系数相应调低，整体秒伤约为原来的 1.7 倍）
function gaussRand() { return Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(Math.PI * 2 * Math.random()); }
const _baU = new THREE.Vector3(), _baW = new THREE.Vector3();
function botAimDirection(bot, muzzle, wId, hitP, dist, shotIdx) {
  const v0 = bulletSpeedOf(wId), k = bulletDragOf(wId);
  const tgt = new THREE.Vector3(playerRig.position.x, player.feetY + (player.stance === "prone" ? 0.3 : player.eyeH * 0.62), playerRig.position.z);
  const d = muzzle.distanceTo(tgt);
  let t = bulletFlightTime(d, v0, k);
  if (!isFinite(t)) t = d / v0 * 1.6;
  // 提前量 = 子弹飞行时间 + 一帧（子弹下一帧才和玩家做碰撞，那时玩家已经又走了一帧）
  const lead = bot.leadSkill * (0.88 + Math.random() * 0.24);
  const tl = t + frameDtAvg;
  tgt.x += playerVel.x * tl * lead;
  tgt.z += playerVel.z * tl * lead;
  tgt.y += bulletDropAt(t) * bot.dropSkill * (0.94 + Math.random() * 0.12);
  // 枪法：在原命中率基础上整体收紧散布（打不中也是擦着身子过去）
  const p = Math.max(0.01, Math.min(0.85, hitP * BOT_ACCURACY));
  // 150 米外散布随距离放大（倍率越高放大得越晚）
  const farDiv = 150 * (1 + 0.14 * (botScopeZoom(bot) - 1));
  const sigma = BOT_HIT_R / Math.sqrt(-2 * Math.log(1 - p)) * Math.max(1, dist / farDiv) * (1 + 0.12 * shotIdx);
  const dir = tgt.clone().sub(muzzle).normalize();
  _baU.set(-dir.z, 0, dir.x).normalize();
  _baW.crossVectors(dir, _baU).normalize();
  tgt.addScaledVector(_baU, gaussRand() * sigma).addScaledVector(_baW, gaussRand() * sigma);
  return tgt.sub(muzzle).normalize();
}

// 枪声按声速传播：远处开枪，先听到子弹破空 / 打在身边，过一会儿才传来枪声
function botShotSound(bot, isSupp, d) {
  const x = bot.group.position.x, z = bot.group.position.z;
  const play = () => {
    if (replayState.active) return;
    sfx.playShot(isSupp, 1.0, d, stereoPanFor(x, z));
    registerRadarSound("shot", x, z, isSupp);
  };
  if (d > 60) setTimeout(play, d / 343 * 1000); else play();
}

// 向玩家打一轮连发：每发按射速间隔从枪口射出一颗真实弹头
function botFireAtPlayer(bot, dist, now) {
  const wData = WEAPONS_DATA[bot.weaponKey];
  const prof = botProfile(bot);
  const shots = Math.max(1, Math.min(prof.volley, bot.mags[bot.activeSlot]));
  const hitP = botHitChance(bot, prof, dist, true);
  const isSupp = bot.weaponAtts[bot.activeSlot].muzzle === "supp";
  const gap = Math.max(50, 60000 / wData.rpm);
  const wKey = bot.weaponKey;
  for (let s = 0; s < shots; s++) {
    setTimeout(() => {
      if (!bot.alive || player.phase !== "ground" || bot.weaponKey !== wKey || replayState.active) return;
      const d = bot.group.position.distanceTo(playerRig.position);
      botShotSound(bot, isSupp, d);
      if (!isSupp && d < 320) spawnBotMuzzleFlash(bot);
      const muzzle = botMuzzlePosition(bot, new THREE.Vector3());
      spawnBullet({ pos: muzzle, dir: botAimDirection(bot, muzzle, wKey, hitP, d, s), wId: wKey, owner: bot,
        info: { dmg: botShotDamage(wData, prof, d), botName: bot.name, wName: wData.name } });
    }, s * gap);
  }
  botAfterShots(bot, shots, dist, now);
}

// AI 获知玩家位置（看到 / 听到 / 被打中），距离越远、noiseK 越大，估计的位置误差越大
function botLearnPlayerPos(bot, now, noiseK) {
  const d = bot.group.position.distanceTo(playerRig.position);
  const n = d * noiseK;
  if (!bot.lkp) bot.lkp = { x: 0, y: 0, z: 0, t: 0 };
  bot.lkp.x = playerRig.position.x + (Math.random() - 0.5) * 2 * n;
  bot.lkp.y = player.feetY;
  bot.lkp.z = playerRig.position.z + (Math.random() - 0.5) * 2 * n;
  bot.lkp.t = now;
}

// ============================================================================
// AI 战术：搜猎（主动去找玩家打）/ 阴人（听到人靠近就蹲下架好枪等着）/ 架点狙击（上高楼窗口远距离狙）
// ============================================================================
const overwatchClaims = new Set(); // 已经有人占了的狙击楼
function botEndTactic(bot) {
  if (bot.tactic === "overwatch" && bot.owSpot) overwatchClaims.delete(bot.owSpot.b);
  bot.tactic = null;
  bot.owSpot = null;
  bot.huntSearchUntil = 0;
  bot.huntSearchPt = null;
  bot.huntFlankPt = null;
}
function botStartTactic(bot, kind, now, ms) {
  botEndTactic(bot);
  bot.tactic = kind;
  bot.tacticSince = now;
  bot.tacticUntil = now + ms;
}
function botStartHunt(bot, now) {
  botStartTactic(bot, "hunt", now, 45000 + Math.random() * 20000);
  bot.flankSide = Math.random() < 0.5 ? 1 : -1;
}
// 阴人：在楼里就盯着门口 / 楼梯口（人从哪进来），在外面就盯着声音方向；提前开好镜
// （camp = 没有情报，只是蹲在房子里守着）
function botStartAmbush(bot, now, inB, camp = false) {
  botStartTactic(bot, "ambush", now, camp ? 20000 + Math.random() * 20000 : 15000 + Math.random() * 10000);
  const pos = bot.group.position, L = camp ? null : bot.lkp;
  const ref = L || (inB ? (Math.random() < 0.5 ? inB.northDoor : inB.southDoor) : { x: pos.x + Math.sin(bot.moveHeading) * 10, z: pos.z + Math.cos(bot.moveHeading) * 10 });
  let fx = ref.x, fz = ref.z;
  if (inB && getBuildingContainingPoint(ref.x, ref.z, 0.3) !== inB) {
    const f = inB.stairs ? floorOfY(inB, pos.y) : 0;
    if (f > 0 && !inB.stairs.catwalk) {
      const e = stairHighExit(inB, f - 1);
      fx = e.x; fz = e.z;
    } else {
      const dn = Math.hypot(ref.x - inB.northDoor.x, ref.z - inB.northDoor.z), ds = Math.hypot(ref.x - inB.southDoor.x, ref.z - inB.southDoor.z);
      const door = dn < ds ? inB.northDoor : inB.southDoor;
      fx = door.x; fz = door.z;
    }
  }
  bot.ambushYaw = Math.atan2(fx - pos.x, fz - pos.z);
  bot.alertUntil = Math.max(bot.alertUntil, bot.tacticUntil);
  bot.lastFireTime = 0; // 人一露头立刻开枪
}

// 架点：楼顶层朝向圈中心那一面的窗口（窗外 40 米视野要开阔）
function botWindowSpots(b, f) {
  const y = floorY(f), out = [];
  const ns = (b.w >= 13 ? [b.cx] : []).concat(b.w >= 12 ? [b.cx - b.w * 0.3, b.cx + b.w * 0.3] : (b.w >= 9 ? [b.cx - b.w * 0.28, b.cx + b.w * 0.28] : []));
  const nWin = Math.max(1, Math.floor((b.d - 2) / 4.2)), ew = [];
  for (let k = 0; k < nWin; k++) ew.push(b.cz - b.d / 2 + b.d * (k + 0.5) / nWin);
  const st = b.stairs;
  ns.forEach(x => {
    out.push({ x, z: b.cz - b.d / 2 + 1.0, nx: 0, nz: -1 });
    out.push({ x, z: b.cz + b.d / 2 - 1.0, nx: 0, nz: 1 });
  });
  ew.forEach(z => {
    out.push({ x: b.cx + b.w / 2 - 1.0, z, nx: 1, nz: 0 });
    if (z < st.zA - 1.2 || z > st.zB + 1.2) out.push({ x: b.cx - b.w / 2 + 1.0, z, nx: -1, nz: 0 });
  });
  return out.map(s => Object.assign(s, { y, f, b, yaw: Math.atan2(s.nx, s.nz) }));
}
function botFindOverwatchSpot(bot) {
  const pos = bot.group.position;
  let best = null, bestS = -Infinity;
  for (let i = 0; i < buildingFootprints.length; i++) {
    const b = buildingFootprints[i];
    if (b.floors < 2 || !b.stairs || b.stairs.catwalk || overwatchClaims.has(b)) continue;
    const dB = Math.hypot(b.cx - pos.x, b.cz - pos.z);
    if (dB > 170 || Math.hypot(b.cx - zoneState.cx, b.cz - zoneState.cz) > zoneState.targetR - 12) continue;
    const zx = zoneState.cx - b.cx, zz = zoneState.cz - b.cz, zl = Math.hypot(zx, zz) || 1;
    const spots = botWindowSpots(b, b.floors - 1);
    for (const s of spots) {
      // 越朝向圈中心、离自己越近越好
      const sc = (s.nx * zx + s.nz * zz) / zl - dB / 170 + Math.random() * 0.3;
      if (sc <= bestS) continue;
      // 窗边有家具就往里退一点
      let ok = false;
      for (const back of [0, 0.6, 1.2]) {
        const x = s.x - s.nx * back, z = s.z - s.nz * back;
        if (!isPointBlocked2D(x, z, 0.44, s.y)) { s.x = x; s.z = z; ok = true; break; }
      }
      if (!ok) continue;
      const ey = s.y + 1.5;
      if (!losSegmentClear(s.x, ey, s.z, s.x + s.nx * 40, ey - 2.5, s.z + s.nz * 40)) continue;
      best = s; bestS = sc;
    }
  }
  return best;
}

// 每 1~1.5 秒想一次接下来怎么打
function botUpdateTactic(bot, now, elapsed, distToPlayer, canSeePlayer, isOutsideSafe, isInBlueZone) {
  if (now < bot.nextTacticEval) return;
  bot.nextTacticEval = now + 1000 + Math.random() * 500;
  if (!bot.weaponKey || player.phase !== "ground") { if (bot.tactic) botEndTactic(bot); return; }
  const pos = bot.group.position, L = bot.lkp;
  const lkpAge = L ? now - L.t : Infinity;
  const dL = L ? Math.hypot(L.x - pos.x, L.z - pos.z) : Infinity;
  let alive = 0;
  for (let i = 0; i < aiPlayers.length; i++) if (aiPlayers[i].alive) alive++;
  const late = alive <= 8;
  // 当前战术到期 / 失效
  if (bot.tactic) {
    const expired = now > bot.tacticUntil;
    const was = bot.tactic;
    if (expired || (was === "hunt" && (!L || L.t <= bot.huntIgnoreT)) || (was === "overwatch" && (isOutsideSafe || isInBlueZone))) {
      botEndTactic(bot);
      // 蹲了半天没人来：胆子大的就主动摸过去
      if (was === "ambush" && L && lkpAge < 30000 && L.t > bot.huntIgnoreT && Math.random() < 0.3 + bot.aggr * 0.6) { botStartHunt(bot, now); return; }
    }
  }
  // 1) 附近听到 / 发现了玩家，但现在看不见：阴人 或 摸过去
  if (L && lkpAge < 5000 && dL < 45 && !canSeePlayer && bot.tactic !== "ambush" &&
      !(bot.tactic === "hunt" && now - bot.tacticSince < 10000) && now - bot.tacticInfoT > 8000) {
    bot.tacticInfoT = now;
    const inB = getBuildingContainingPoint(pos.x, pos.z, -0.3);
    const pAmb = 0.2 + bot.camper * 0.5 + (inB ? 0.25 : 0) + (bot.hp < 60 ? 0.15 : 0) - (late ? 0.1 : 0);
    if (Math.random() < pAmb) { botStartAmbush(bot, now, inB); return; }
    if (Math.random() < 0.35 + bot.aggr * 0.6) { botStartHunt(bot, now); return; }
  }
  if (bot.tactic) return;
  // 2) 搜猎：知道玩家大概在哪（听到枪声 / 挨了枪 / 交过火），好斗的人会追很远
  if (L && L.t > bot.huntIgnoreT && lkpAge < 10000 + 25000 * bot.aggr && dL < 100 + 220 * bot.aggr + (late ? 150 : 0) &&
      bot.hp > 40 && !isInBlueZone && Math.random() < 0.1 + bot.aggr * 0.7 + (late ? 0.35 : 0)) {
    botStartHunt(bot, now);
    return;
  }
  // 3) 决赛圈人少了：大致知道玩家在哪一片，主动过去找
  if (late && (!L || lkpAge > 20000) && now > bot.nextIntelT && distToPlayer < 280 && !isInBlueZone) {
    bot.nextIntelT = now + 15000 + Math.random() * 10000;
    if (Math.random() < 0.4 + bot.aggr * 0.5) {
      const n = Math.min(35, zoneState.curR * 0.25);
      if (!bot.lkp) bot.lkp = { x: 0, y: 0, z: 0, t: 0 };
      bot.lkp.x = playerRig.position.x + (Math.random() - 0.5) * 2 * n;
      bot.lkp.z = playerRig.position.z + (Math.random() - 0.5) * 2 * n;
      bot.lkp.y = 0; bot.lkp.t = now;
      botStartHunt(bot, now);
      return;
    }
  }
  // 4) 爱蹲点的人：搜完房子就蹲在屋里守着门口 / 楼梯口
  if (bot.camper > 0.6 && !bot.lootTarget && elapsed > bot.landedAt + 30 && !isOutsideSafe && !isInBlueZone && now > bot.nextCampTry) {
    bot.nextCampTry = now + 20000 + Math.random() * 20000;
    const inB = getBuildingContainingPoint(pos.x, pos.z, -0.3);
    if (inB && Math.random() < bot.camper * 0.6) { botStartAmbush(bot, now, inB, true); return; }
  }
  // 5) 架点狙击：带着高倍镜狙 / 连狙、装备搜得差不多了，就去圈里的高楼窗口架着
  if (botHasScopedLongGun(bot) && elapsed > bot.landedAt + 40 && !bot.lootTarget && !isOutsideSafe && !isInBlueZone &&
      bot.hp > 50 && now > bot.nextOverwatchTry) {
    bot.nextOverwatchTry = now + 25000 + Math.random() * 15000;
    if (Math.random() < bot.sniperPref) {
      const s = botFindOverwatchSpot(bot);
      if (s) {
        botStartTactic(bot, "overwatch", now, 70000 + Math.random() * 50000);
        bot.owSpot = s;
        overwatchClaims.add(s.b);
      }
    }
  }
}

// 搜猎的目标点：远的时候从侧面包抄，到了最后位置还没看到人就在附近搜一阵，搜不到就放弃
function botHuntGoal(bot, now) {
  const pos = bot.group.position, L = bot.lkp;
  const dL = Math.hypot(L.x - pos.x, L.z - pos.z);
  if (bot.huntSearchUntil > 0) {
    if (now > bot.huntSearchUntil) {
      bot.huntIgnoreT = L.t; // 这条情报用完了
      botEndTactic(bot);
      return null;
    }
    if (!bot.huntSearchPt || now > bot.huntSearchNext || Math.hypot(bot.huntSearchPt.x - pos.x, bot.huntSearchPt.z - pos.z) < 2) {
      bot.huntSearchNext = now + 3500 + Math.random() * 2000;
      const inB = getBuildingContainingPoint(L.x, L.z, 0.3);
      let x = L.x, z = L.z;
      for (let k = 0; k < 5; k++) {
        x = L.x + (Math.random() - 0.5) * 24; z = L.z + (Math.random() - 0.5) * 24;
        if (inB) {
          x = Math.max(inB.cx - inB.w / 2 + 1, Math.min(inB.cx + inB.w / 2 - 1, x));
          z = Math.max(inB.cz - inB.d / 2 + 1, Math.min(inB.cz + inB.d / 2 - 1, z));
        }
        if (!isPointBlocked2D(x, z, 0.44, inB ? L.y : 0)) break;
      }
      bot.huntSearchPt = new THREE.Vector3(x, inB ? L.y : 0, z);
    }
    return bot.huntSearchPt;
  }
  // 楼上 / 屋顶够不着时，走到楼下附近也算到了
  if (dL < 4 && (Math.abs(L.y - pos.y) < 1.5 || now - bot.tacticSince > 25000)) {
    bot.huntSearchUntil = now + 7000 + Math.random() * 6000;
    return new THREE.Vector3(L.x, L.y, L.z);
  }
  // 情报位置有误差：不在楼里的点一律当成地面
  const ly = getBuildingContainingPoint(L.x, L.z, 0.3) ? L.y : 0;
  if (dL > 30 && bot.aggr > 0.3) {
    // 包抄：从侧面绕过去，越近越收回到正面（每 4 秒重新定一次包抄点，目标固定才好绕路）
    if (!bot.huntFlankPt || now > bot.huntFlankNext) {
      const ux = (L.x - pos.x) / dL, uz = (L.z - pos.z) / dL;
      const off = Math.min(20, dL * 0.35) * bot.flankSide;
      bot.huntFlankPt = new THREE.Vector3(L.x - uz * off, 0, L.z + ux * off);
      bot.huntFlankNext = now + 4000;
    }
    return bot.huntFlankPt;
  }
  return new THREE.Vector3(L.x, ly, L.z);
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
    // 跑毒要有回差：一旦开始往圈里跑，跑进 0.78 倍半径以内才停（不然在圈边上“跑毒 / 回头捡东西”来回抽搐）
    if (isOutsideSafe || isInBlueZone) bot.zoneRun = true;
    else if (distToSafeCenter < zoneState.targetR * 0.78) bot.zoneRun = false;
    const isAlerted = now < bot.alertUntil;
    const distToPlayer = bot.group.position.distanceTo(playerRig.position);
    const canSeePlayer = botCanSeePlayer(bot, distToPlayer, now, dt);
    if (canSeePlayer) {
      if (!bot.lkp) bot.lkp = { x: 0, y: 0, z: 0, t: 0 };
      bot.lkp.x = playerRig.position.x; bot.lkp.y = player.feetY; bot.lkp.z = playerRig.position.z; bot.lkp.t = now;
    }
    const stunned = now < bot.stunnedUntil;
    const fleeing = now < bot.fleeUntil;
    bot.crouchWant = false;
    botUpdateTactic(bot, now, elapsed, distToPlayer, canSeePlayer, isOutsideSafe, isInBlueZone);

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
    let adTarget = null, huntGoal = null;

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
    } else if (isInBlueZone || (bot.zoneRun && !isAlerted)) {
      moveMode = "zone";
      // 跑毒：朝圈中心方向 45 米处定一个固定的目标点，走到了再定下一个（目标固定才能绕开房子）
      if (!bot.zoneGoal || Math.hypot(bot.zoneGoal.x - bot.group.position.x, bot.zoneGoal.z - bot.group.position.z) < 8 ||
          Math.hypot(bot.zoneGoal.x - zoneState.cx, bot.zoneGoal.z - zoneState.cz) > distToSafeCenter + 5) {
        const angleToCenter = Math.atan2(zoneState.cz - bot.group.position.z, zoneState.cx - bot.group.position.x);
        bot.zoneGoal = new THREE.Vector3(
          bot.group.position.x + Math.cos(angleToCenter) * Math.min(45, distToSafeCenter),
          0,
          bot.group.position.z + Math.sin(angleToCenter) * Math.min(45, distToSafeCenter)
        );
      }
      moveGoal = bot.zoneGoal;
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
      // 狙击 / 连狙远距离对枪：原地架枪不乱跑（窗边站着打，野外蹲下打）
      if (sniper && distToPlayer > 80) {
        moveSpd = 0;
        if (!fightIn) bot.crouchWant = true;
      }
    } else if (now < bot.pushUntil && bot.lkp && bot.weaponKey) {
      // 闪光弹扔进去之后：冲到玩家最后出现的位置
      moveMode = "push";
      moveGoal = new THREE.Vector3(bot.lkp.x, bot.lkp.y, bot.lkp.z);
      moveSpd = 6.3;
    } else if (bot.healUntil > 0 || (bot.hp < 62 && bot.meds > 0 && !isInBlueZone && !(isAlerted && canSeePlayer))) {
      // 3. 受伤且安全时原地打药（约 4 秒回 45 血，期间被发现则中断）
      moveMode = "heal";
      moveSpd = 0;
      bot.crouchWant = true;
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
          if (entry.item.kind === "weapon" && !(bot.badLoot && bot.badLoot.has(entry))) {
            // 圈外的枪排在后面（实在没有圈里的才去）
            const d = Math.hypot(entry.x - bot.group.position.x, entry.z - bot.group.position.z) + Math.abs(entry.y - bot.group.position.y) * 2 + (botLootOutsideZone(entry) ? 400 : 0);
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
    } else if (bot.tactic === "ambush") {
      // 阴人：蹲下、开好镜，枪口对着门口 / 楼梯口 / 声音方向，一露头就打
      moveMode = "ambush";
      moveSpd = 0;
      bot.crouchWant = true;
    } else if (bot.tactic === "hunt" && bot.lkp && (huntGoal = botHuntGoal(bot, now))) {
      // 搜猎：远处跑过去（侧面包抄），接近后放慢脚步端着枪摸过去，到了就在附近搜
      moveMode = "hunt";
      moveGoal = huntGoal;
      const L = bot.lkp, dL = Math.hypot(L.x - bot.group.position.x, L.z - bot.group.position.z);
      bot.huntNear = dL < 35;
      moveSpd = bot.huntSearchUntil > 0 ? 3.0 : (dL > 40 ? 5.6 : 3.0);
      if (dL < 45) bot.alertUntil = Math.max(bot.alertUntil, now + 1500);
    } else if (bot.tactic === "overwatch" && bot.owSpot) {
      // 架点狙击：上楼走到窗边，站在窗口用倍镜扫视圈里
      moveMode = "overwatch";
      const s = bot.owSpot, dS = Math.hypot(s.x - bot.group.position.x, s.z - bot.group.position.z);
      // 要站到窗口正中（偏了窗框会挡住视线），最后几步放慢走准
      bot.owAt = Math.abs(s.y - bot.group.position.y) < 0.8 && dS < (bot.owAt ? 2.0 : 0.55);
      if (bot.owAt) moveSpd = 0;
      else { moveGoal = s.v || (s.v = new THREE.Vector3(s.x, s.y, s.z)); moveSpd = dS < 2.5 && Math.abs(s.y - bot.group.position.y) < 0.8 ? 1.6 : 5.0; }
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
    // 阴人 / 摸近目标时提前开镜；架点时隔一会儿开镜扫一圈
    const scanADS = (moveMode === "overwatch" && bot.owAt && Math.sin(now * 0.0007 + bot.wanderPhase * 3) > 0.1) ||
      moveMode === "ambush" || (moveMode === "hunt" && bot.huntNear);
    const wantADS = !!bot.weaponKey && !reloadingNow && ((moveMode === "combat" && distToPlayer > hipRange) || fightingBot || scanADS);
    bot.adsBlend = wantADS ? Math.min(1, bot.adsBlend + dt / botAdsTime(bot)) : Math.max(0, bot.adsBlend - dt / 0.16);
    bot.aimSettle = wantADS && bot.adsBlend >= 1 ? Math.min(1, bot.aimSettle + dt / 1.2) : 0;
    if (bot.adsBlend > 0) moveSpd *= 1 - 0.45 * bot.adsBlend;
    const aimInDone = !(moveMode === "combat" && distToPlayer > hipRange) || bot.adsBlend >= 0.9;
    // 枪口上下对准目标（目标站 / 蹲 / 趴的高度不同，楼上楼下也能对准）
    if (moveMode === "combat") bot.aimPitch = Math.atan2(player.feetY + player.eyeH * 0.72 - (bot.group.position.y + 1.55 - 0.42 * bot.crouchBlend), Math.max(1, distToPlayer));
    else if (fightingBot) bot.aimPitch = Math.atan2(bot.foeY + 1.2 - (bot.group.position.y + 1.55), Math.max(1, bot.foeDist));
    else bot.aimPitch *= Math.max(0, 1 - dt * 6);
    bot.wanderAmp = moveMode === "patrol" ? 0.26 : (moveMode === "zone" ? 0.14 : (moveMode === "loot" ? 0.08 : 0));

    // 执行 7向触须避障 + 房门导航移动（带转向/加减速惯性与个体速度差异）
    // 交火横移 / 躲雷 / 被闪时目标点跟着人动，不做绕路规划
    bot.lastMoveGoal = moveGoal;
    bot.moveMode = moveMode; bot.moveSpdWanted = moveSpd;
    const movedDist = steerAndMoveAI(bot, moveGoal, moveSpd * bot.speedMul, dt, moveMode !== "combat" && moveMode !== "flee" && moveMode !== "stunned");
    // 绕路也走不到（物资在封闭角落 / 别的楼层够不着）：记下来换个目标，不再原地死磕
    if (bot.navUnreachable) {
      bot.navUnreachable = false;
      if (moveMode === "loot" && (bot.lootTarget || bot.wepTarget)) {
        if (!bot.badLoot) bot.badLoot = new Set();
        bot.badLoot.add(bot.lootTarget || bot.wepTarget);
        bot.lootTarget = null; bot.wepTarget = null;
        bot.nextLootScan = now + 300;
      } else if (moveMode === "patrol") {
        bot.targetPos.set(bot.group.position.x + (Math.random() - 0.5) * 60, 0, bot.group.position.z + (Math.random() - 0.5) * 60);
      } else if (moveMode === "hunt") {
        // 走不过去：就地开始搜（换个搜索点）
        if (bot.huntSearchUntil === 0) bot.huntSearchUntil = now + 6000;
        bot.huntSearchNext = 0;
      } else if (moveMode === "overwatch") {
        botEndTactic(bot);
      }
    }

    botOpenDoorsAhead(bot, now);
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
    } else if (moveMode === "ambush") {
      faceYaw = bot.ambushYaw + Math.sin(now * 0.0007 + bot.wanderPhase) * 0.2;
      turnRate = 5;
    } else if (moveMode === "overwatch" && bot.owAt) {
      faceYaw = bot.owSpot.yaw + Math.sin(now * 0.00045 + bot.wanderPhase) * 0.6;
      turnRate = 2.5;
    } else if (moveMode === "hunt" && bot.huntNear && bot.huntSearchUntil === 0) {
      faceYaw = Math.atan2(bot.lkp.x - bot.group.position.x, bot.lkp.z - bot.group.position.z);
      turnRate = 6;
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
        const fullRange = botEngageRange(bot, prof, wType);
        const engageRange = isAlerted ? fullRange : fullRange * ((wType === "SR" || wType === "DMR") ? 0.9 : 0.58);
        const engageChance = moveMode === "ambush" ? 1 : (isAlerted ? 0.88 : 0.42);

        if (botConsiderThrow(bot, now, distToPlayer, canSeePlayer, isAlerted)) {
          bot.lastFireTime = now;
        } else if (player.phase === "ground" && distToPlayer < engageRange && canSeePlayer && !aimInDone) {
          // 正在举枪开镜：瞄好再打（这一下不会去打别人）
        } else if (player.phase === "ground" && distToPlayer < fullRange && canSeePlayer && !isAlerted && distToPlayer > 60) {
          // 远处发现了人：先进入交火状态、开好镜再打（不再远距离腰射）
          bot.alertUntil = now + 8000;
          bot.lastFireTime = now;
          setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 700);
        } else if (player.phase === "ground" && distToPlayer < engageRange && Math.random() < engageChance && canSeePlayer) {
          bot.lastFireTime = now;
          bot.alertUntil = Math.max(bot.alertUntil, now + 6000);
          setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 700);
          botFireAtPlayer(bot, distToPlayer, now);
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
            bot.foe = otherBot;
            bot.foeY = otherBot.group.position.y;
            bot.foeDist = otherBot.group.position.distanceTo(bot.group.position);
            if (distToPlayer < 320 && bot.weaponAtts[bot.activeSlot].muzzle !== "supp") spawnBotMuzzleFlash(bot);
            botShotSound(bot, bot.weaponAtts[bot.activeSlot].muzzle === "supp", distToPlayer);
            // AI 互殴：伤害随武器类型变化，并扣除对方防弹衣减伤
            const od = otherBot.group.position.distanceTo(bot.group.position);
            const typeMul = wType === "SG" ? (od < 15 ? 1.6 : 0.4) : (AI_VS_AI_DMG[wType] || 1);
            // 子弹飞到了才扣血（见 ballistics.js）
            scheduleBotHit(bot, otherBot, Math.round(36 * typeMul * (1 - botArmorReduction(otherBot, false)) / 0.9), od);
            replayBotShot(bot, otherBot.group.position.x, otherBot.group.position.y + 1.2, otherBot.group.position.z, true, prof.volley);
            botAfterShots(bot, prof.volley, od, now);
          }
        }
      }
    }
  }
}
