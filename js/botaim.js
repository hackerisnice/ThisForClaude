// botaim.js：AI 像真人一样瞄准、开枪 —— 枪口有真实的指向，必须真的“转过去、压住”才打得中
//  · 看到人先有反应时间（约 0.2~0.4 秒），然后甩枪：转速有上限，大角度先甩过去再微调，可能甩过头一点再拉回来
//  · 眼睛看到的是 0.1~0.18 秒前的画面（视觉延迟），会凭经验脑补一部分；玩家突然变向时枪口要过一会儿才跟上
//  · 手会抖：站着比蹲着抖，边走边打抖得多，不开镜腰射更飘（腰射散布和玩家一样）
//  · 开枪有后坐力，数值和玩家同一套（第一发跳得最多、连射越来越跳、配件 / 蹲下减后坐），靠压枪抵消一部分
//  · 打移动目标按看到的速度估提前量，远距离按目测的距离抬枪；目测有误差，边打边看弹着点慢慢修正
//  · 瞄的是身体中间，不会专门瞄头；只有枪口上跳、手抖才会偶尔打到头（蹲着的人头离身体中间近，更容易被打到头）
//  · 看起来枪口压在人身上才扣扳机：按距离点射 / 连射，枪口飘出去就松开，压回来再打
// 没有任何命中率系数：子弹从枪口沿枪口真实指向飞出去，打不打得中完全由上面这些过程和子弹弹道决定
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ---- 玩家状态的历史记录：AI 按“稍早一点”的画面判断玩家在哪、往哪动 ----
const PLAYER_HIST_N = 48;
const playerHist = [];
for (let i = 0; i < PLAYER_HIST_N; i++) playerHist.push({ t: -1e12, x: 0, z: 0, y: 0, eyeH: 1.7, prone: false, vx: 0, vz: 0 });
let playerHistHead = -1;
function recordPlayerHistory(now) {
  // 高刷新率下也至少隔 8 毫秒记一条（48 条够覆盖 0.38 秒以上）
  if (playerHistHead >= 0 && now - playerHist[playerHistHead].t < 8) return;
  playerHistHead = (playerHistHead + 1) % PLAYER_HIST_N;
  const s = playerHist[playerHistHead];
  s.t = now; s.x = playerRig.position.x; s.z = playerRig.position.z; s.y = player.feetY;
  s.eyeH = player.eyeH; s.prone = player.stance === "prone"; s.vx = playerVel.x; s.vz = playerVel.z;
}
function copyPlayerSample(out, s) {
  out.x = s.x; out.z = s.z; out.y = s.y; out.eyeH = s.eyeH; out.prone = s.prone; out.vx = s.vx; out.vz = s.vz;
  return out;
}
// t 时刻（毫秒）玩家的位置 / 姿势 / 速度：在历史记录里插值
function samplePlayerAt(t, out) {
  if (playerHistHead < 0) {
    return copyPlayerSample(out, { x: playerRig.position.x, z: playerRig.position.z, y: player.feetY, eyeH: player.eyeH,
      prone: player.stance === "prone", vx: playerVel.x, vz: playerVel.z });
  }
  let i = playerHistHead, newer = null;
  for (let k = 0; k < PLAYER_HIST_N; k++) {
    const s = playerHist[i];
    if (s.t < -1e11) break;
    if (s.t <= t) {
      if (!newer) return copyPlayerSample(out, s);
      // 瞬移（复活 / 传送）不插值
      if (Math.abs(newer.x - s.x) + Math.abs(newer.z - s.z) > 6) return copyPlayerSample(out, newer);
      const f = (t - s.t) / Math.max(1e-3, newer.t - s.t);
      out.x = s.x + (newer.x - s.x) * f; out.z = s.z + (newer.z - s.z) * f; out.y = s.y + (newer.y - s.y) * f;
      out.eyeH = s.eyeH + (newer.eyeH - s.eyeH) * f; out.prone = f < 0.5 ? s.prone : newer.prone;
      out.vx = s.vx + (newer.vx - s.vx) * f; out.vz = s.vz + (newer.vz - s.vz) * f;
      return out;
    }
    newer = s;
    i = (i + PLAYER_HIST_N - 1) % PLAYER_HIST_N;
  }
  return copyPlayerSample(out, newer);
}

function gaussRand() { return Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(Math.PI * 2 * Math.random()); }

// ---- 瞄准：每个 AI 的枪口方向（aimYaw / aimPit，弧度，俯仰向上为正）像手一样被“拉”向想瞄的点 ----
// 刚看到人（或丢了视线一段时间后重新看到）：先反应，枪口从当前朝向开始转
function botAimAcquire(bot, now) {
  const away = now - bot.aimLostAt;
  // 本来就端着枪盯着那边（阴人 / 开着镜）反应快一些；刚丢了一下视线又看到，反应也快
  let r = bot.reactMs * (bot.tactic === "ambush" || bot.adsBlend > 0.5 ? 0.75 : 1);
  if (away < 1500) r *= 0.25 + 0.75 * away / 1500;
  bot.reactUntil = now + r;
  if (away > 300) {
    _botFwd.set(0, 0, 1).applyQuaternion(bot.group.quaternion);
    bot.aimYaw = Math.atan2(_botFwd.x, _botFwd.z);
    bot.aimPit = bot.aimPitch;
    bot.aimVY = 0; bot.aimVP = 0;
  }
  // 换了个交火对象 / 隔了很久：重新目测距离、重新估提前量
  if (away > 4000) {
    bot.rangeEst = 1 + gaussRand() * bot.rangeErr;
    bot.leadEst = bot.leadSkill * (0.85 + Math.random() * 0.3);
  }
  bot.desValid = false;
  bot.burstLeft = 0;
  bot.wanT = now;
}

// AI 自己认为该瞄哪：看到的玩家（带视觉延迟 + 脑补）身体中间 + 提前量 + 按目测距离补下坠
const _aimS = { x: 0, z: 0, y: 0, eyeH: 1.7, prone: false, vx: 0, vz: 0 };
const _aimMz = new THREE.Vector3();
function botComputeDesiredAim(bot, now) {
  const s = samplePlayerAt(now - bot.perceptLag * 1000, _aimS);
  const ant = bot.perceptLag * bot.anticipation;
  let tx = s.x + s.vx * ant, tz = s.z + s.vz * ant;
  // 瞄身体中间（站着约 1 米高，蹲着约 0.7 米）
  const ty = s.y + (s.prone ? 0.3 : s.eyeH * 0.6);
  const m = botMuzzlePosition(bot, _aimMz);
  const dEst = Math.max(1, Math.hypot(tx - m.x, ty - m.y, tz - m.z) * bot.rangeEst);
  const wId = bot.weaponKey, v0 = bulletSpeedOf(wId);
  let t = bulletFlightTime(dEst, v0, bulletDragOf(wId));
  if (!isFinite(t)) t = dEst / v0 * 1.6;
  // 提前量 = 子弹飞行时间 + 一帧（子弹下一帧才和玩家做碰撞）
  const tl = (t + frameDtAvg) * bot.leadEst;
  tx += s.vx * tl; tz += s.vz * tl;
  const dx = tx - m.x, dz = tz - m.z;
  // 准星放不到绝对正中：眼睛分辨和手指微调都有极限（远处的人在屏幕上只有几个像素），倍镜越高放得越准；这点偏差自己察觉不到
  const zoom = 1 + (botScopeZoom(bot) - 1) * bot.adsBlend, sig = bot.aimPrecision / zoom;
  const dtw = Math.min(0.1, Math.max(0, (now - bot.wanT) * 0.001)), a = Math.exp(-dtw / 0.5), b = sig * Math.sqrt(1 - a * a);
  bot.wanY = bot.wanY * a + b * gaussRand(); bot.wanP = bot.wanP * a + b * gaussRand(); bot.wanT = now;
  bot.desYaw = Math.atan2(dx, dz) + bot.wanY;
  bot.desPit = Math.atan2(ty + bulletDropAt(t) - m.y, Math.max(0.5, Math.hypot(dx, dz))) + bot.wanP;
  bot.desDist = dEst;
  bot.desProne = s.prone;
}

// 每帧：want = 正在和玩家交火（看得见、已警觉）。枪口按“弹簧 + 阻尼 + 转速上限”追向想瞄的点，
// 并带上目标角速度做跟枪（目标匀速横移时能跟住，突然变向时要慢半拍）
function botAimUpdate(bot, want, dt, now) {
  if (want && !bot.aimOn) botAimAcquire(bot, now);
  else if (!want && bot.aimOn) { bot.aimLostAt = now; bot.burstLeft = 0; }
  bot.aimOn = want;
  // 后坐力的上跳 / 左右晃：看着准星往回拉（压枪越好拉得越快）；连射中手被一发发顶着拉得慢，松开扳机后很快回正
  const firing = now - bot.lastFireTime < 150;
  const rec = Math.exp(-(firing ? 2.5 + 3 * bot.recoilControl : 6 + 4 * bot.recoilControl) * dt);
  bot.recP *= rec; bot.recY *= rec;
  if (!want || dt <= 0) return;

  botComputeDesiredAim(bot, now);
  if (bot.desValid) {
    const ry = Math.max(-4, Math.min(4, angleDiff(bot.desYaw, bot.desPrevYaw) / dt));
    const rp = Math.max(-4, Math.min(4, (bot.desPit - bot.desPrevPit) / dt));
    const k = Math.min(1, dt * 12);
    bot.desRY += (ry - bot.desRY) * k; bot.desRP += (rp - bot.desRP) * k;
  } else {
    bot.desRY = 0; bot.desRP = 0;
  }
  bot.desPrevYaw = bot.desYaw; bot.desPrevPit = bot.desPit; bot.desValid = true;

  if (now < bot.reactUntil) {
    // 还没反应过来：枪口还停在原来的方向
    bot.aimVY = 0; bot.aimVP = 0;
  } else {
    // 开了高倍镜转得慢（视野窄，甩不快）
    const zoom = 1 + (botScopeZoom(bot) - 1) * bot.adsBlend;
    const wMax = bot.maxTurn / (1 + 0.15 * (zoom - 1));
    const w = bot.aimOmega, z = bot.aimZeta;
    const n = Math.max(1, Math.ceil(dt * 60)), h = dt / n;
    for (let i = 0; i < n; i++) {
      const eY = angleDiff(bot.desYaw, bot.aimYaw), eP = bot.desPit - bot.aimPit;
      bot.aimVY += (w * w * eY + 2 * z * w * (bot.desRY - bot.aimVY)) * h;
      bot.aimVP += (w * w * eP + 2 * z * w * (bot.desRP - bot.aimVP)) * h;
      const sp = Math.hypot(bot.aimVY, bot.aimVP);
      if (sp > wMax) { bot.aimVY *= wMax / sp; bot.aimVP *= wMax / sp; }
      bot.aimYaw += bot.aimVY * h;
      bot.aimPit += bot.aimVP * h;
    }
    bot.aimYaw = Math.atan2(Math.sin(bot.aimYaw), Math.cos(bot.aimYaw));
    bot.aimPit = Math.max(-1.3, Math.min(1.3, bot.aimPit));
  }
  // 上半身跟着枪口俯仰（含后坐力上跳）
  bot.aimPitch = bot.aimPit + bot.recP;
}

// 手抖幅度（弧度）：站着 > 蹲着，跑动越快抖得越厉害，没开镜（枪没抵肩）更飘
function botTremorAmp(bot) {
  return bot.tremor * (1 + 0.45 * Math.min(6, bot.curSpeed)) * (1 - 0.25 * bot.crouchBlend) * (2 - Math.min(1, bot.adsBlend));
}
// 枪口（含后坐力）离 AI 想瞄的点差多少（弧度）
function botAimError(bot) {
  const ey = angleDiff(bot.desYaw, bot.aimYaw + bot.recY) * Math.cos(bot.desPit);
  return Math.hypot(ey, bot.desPit - bot.aimPit - bot.recP);
}
// 扣扳机的时机：看起来枪口压在对方身上（半个身宽对应的角度）才打；急躁的人要求低一些，手抖的时候也只能将就
// （half 换成半个身高 = 连射中枪口跳出人形了，该松手了）
function botFireTolerance(bot, half = bot.desProne ? 0.22 : 0.28) {
  return Math.atan(half / Math.max(1, bot.desDist)) * bot.triggerDiscipline + botTremorAmp(bot) * 1.2;
}

// 一枪一枪打的枪：狙击 / 连狙 / 喷子（连狙 MK14 有全自动也按单发打）
function botSingleShotGun(w) {
  return w.type === "SR" || w.type === "SG" || w.type === "DMR" || w.isBoltAction || (!w.modes.includes("auto") && !w.modes.includes("burst"));
}
// 一次扣扳机打几发：单发枪一枪一枪打，点射枪按点射（M16A4 三连发、MK47 两连发），全自动越近扫得越久
function botBurstLength(bot, dist) {
  const w = WEAPONS_DATA[bot.weaponKey];
  if (botSingleShotGun(w)) return 1;
  if (!w.modes.includes("auto")) return w.id === "mk47" ? 2 : 3;
  const base = dist < 12 ? 9 : (dist < 25 ? 6 : (dist < 45 ? 4 : (dist < 80 ? 3 : 2)));
  const k = w.type === "SMG" ? 1.4 : (w.type === "LMG" ? 1.6 : 1);
  return Math.max(1, Math.round(base * k * (0.75 + Math.random() * 0.5)));
}
// 两次扣扳机之间：拉栓 / 单发枪按手指节奏（真正的限制是等后坐力回落、重新压住），连发之间稍停让枪口回落
function botBurstPause(bot, dist) {
  const w = WEAPONS_DATA[bot.weaponKey];
  if (w.isBoltAction) return (w.boltTime || 1.2) * 1000 + 60;
  const gap = 60000 / w.rpm;
  if (botSingleShotGun(w)) return gap * (1.1 + Math.random() * 0.5) + 60;
  return Math.max(gap, 120 + Math.min(350, dist * 3) + Math.random() * 150);
}

// 每帧扣扳机逻辑：canFire = 能打（看得见、在射程、开好镜、没在换弹……）。返回这帧有没有开枪
function botTriggerUpdate(bot, now, dist, canFire) {
  if (!canFire || !bot.aimOn || now < bot.reactUntil || bot.mags[bot.activeSlot] <= 0) { bot.burstLeft = 0; return false; }
  const tol = botFireTolerance(bot), tolAbort = botFireTolerance(bot, bot.desProne ? 0.3 : 0.55);
  if (bot.burstLeft <= 0) {
    if (now < bot.burstHoldUntil || botAimError(bot) > tol) return false;
    bot.burstLeft = botBurstLength(bot, dist);
    bot.burstShots = 0;
    bot.nextShotAt = now;
  }
  const wKey = bot.weaponKey, gap = 60000 / WEAPONS_DATA[wKey].rpm;
  let fired = 0;
  while (bot.burstLeft > 0 && now >= bot.nextShotAt && fired < 3) {
    botFireShot(bot, now);
    fired++;
    bot.burstLeft--;
    bot.burstShots++;
    bot.nextShotAt += gap;
    // 打空了要换弹 / 切枪
    if (bot.weaponKey !== wKey || now < bot.reloadUntil || now < bot.swapUntil) { bot.burstLeft = 0; break; }
    // 枪口跳出去太多（压不住了）：松开扳机，等枪口回来再打
    if (botAimError(bot) > tolAbort) bot.burstLeft = 0;
  }
  if (bot.nextShotAt < now - gap) bot.nextShotAt = now;
  if (fired && bot.burstLeft <= 0 && bot.weaponKey === wKey) bot.burstHoldUntil = now + botBurstPause(bot, dist);
  return fired > 0;
}

// 后坐力数值：与玩家 getActiveWeaponEffectiveStats 一致（配件倍率、蹲下减后坐）
const _botRec = { vRec: 1, hRec: 0.5, firstMult: 1.5 };
function botRecoilStats(bot) {
  const w = WEAPONS_DATA[bot.weaponKey], atts = bot.weaponAtts[bot.activeSlot];
  let vM = 1, hM = 1, fM = w.firstMult || 1;
  for (const k in atts) {
    const a = ATTACHMENTS_DATA[atts[k]];
    if (!a) continue;
    if (a.vMult) vM *= a.vMult;
    if (a.hMult) hM *= a.hMult;
    if (a.firstMult) fM *= a.firstMult;
  }
  const cr = bot.crouchBlend;
  _botRec.vRec = w.vRec * vM * (1 - 0.18 * cr);
  _botRec.hRec = w.hRec * hM * (1 - 0.16 * cr);
  _botRec.firstMult = fM;
  return _botRec;
}

// 腰射视野（75°）下屏幕坐标偏移换算成角度：玩家腰射 / 霰弹散布用的是屏幕坐标
const BOT_NDC_Y = 0.767, BOT_NDC_X = 1.2;
const _shotDir = new THREE.Vector3(), _shotMz = new THREE.Vector3();
function botSpawnShot(bot, mz, yaw, pit, wKey, dmg) {
  const cp = Math.cos(pit);
  _shotDir.set(Math.sin(yaw) * cp, Math.sin(pit), Math.cos(yaw) * cp);
  spawnBullet({ pos: mz, dir: _shotDir, wId: wKey, owner: bot, info: { dmg, botName: bot.name, wName: WEAPONS_DATA[wKey].name } });
}
// 开一枪：子弹从枪口沿“瞄的方向 + 后坐力上跳 + 手抖（+ 腰射散布）”飞出去，然后枪口被后坐力顶开
function botFireShot(bot, now) {
  const wKey = bot.weaponKey, w = WEAPONS_DATA[wKey], atts = bot.weaponAtts[bot.activeSlot];
  const isSupp = atts.muzzle === "supp";
  const d = bot.group.position.distanceTo(playerRig.position);
  botShotSound(bot, isSupp, d);
  if (!isSupp && d < 320) spawnBotMuzzleFlash(bot);
  const mz = botMuzzlePosition(bot, _shotMz);
  const amp = botTremorAmp(bot), t = now * 0.001, ph = bot.tremorPh;
  const yaw = bot.aimYaw + bot.recY + amp * (0.62 * Math.sin(5.3 * t + ph[0]) + 0.3 * Math.sin(13.1 * t + ph[1]) + 0.16 * Math.sin(29.7 * t + ph[2]));
  const pit = bot.aimPit + bot.recP + amp * (0.62 * Math.sin(4.1 * t + ph[3]) + 0.3 * Math.sin(11.3 * t + ph[4]) + 0.16 * Math.sin(27.1 * t + ph[5]));
  if (w.type === "SG") {
    // 霰弹：每颗弹丸都是真实的子弹，散布形状和玩家的一样（扼流圈 / 鸭嘴照样生效）
    let sx = w.spreadX, sy = w.spreadY;
    for (const k in atts) {
      const a = ATTACHMENTS_DATA[atts[k]];
      if (a && a.spreadXMult) sx *= a.spreadXMult;
      if (a && a.spreadYMult) sy *= a.spreadYMult;
    }
    for (let p = 0; p < w.pellets; p++) {
      const ang = (p / w.pellets) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const r = p === 0 ? 0.15 : 0.45 + Math.random() * 0.55;
      botSpawnShot(bot, mz, yaw + Math.cos(ang) * r * sx * BOT_NDC_X, pit + Math.sin(ang) * r * sy * BOT_NDC_Y, wKey, w.dmgPerPellet);
    }
  } else {
    // 没开好镜就是腰射：和玩家一样有准星范围内的随机散布
    const hip = bot.adsBlend < 0.9;
    const sX = hip ? (Math.random() - 0.5) * 0.028 * BOT_NDC_X : 0, sY = hip ? (Math.random() - 0.5) * 0.028 * BOT_NDC_Y : 0;
    botSpawnShot(bot, mz, yaw + sX, pit + sY, wKey, botShotDamage(w, d));
  }
  // 后坐力（和玩家同一个公式：第一发跳得最多，后面每发递增），压枪当场抵消一部分
  const st = botRecoilStats(bot), n = bot.burstShots;
  const vCurve = n === 0 ? st.firstMult : 1.2 + Math.min((n + 1) * 0.025, 0.45);
  bot.recP += st.vRec * vCurve * 0.0165 * (1 - bot.recoilControl);
  bot.recY += (Math.random() - 0.48) * 2 * st.hRec * 0.0135 * (1 - 0.3 * bot.recoilControl);
  // 看到弹着点 / 曳光：目测距离、提前量慢慢修正
  bot.rangeEst += (1 - bot.rangeEst) * 0.12;
  bot.leadEst += (1 - bot.leadEst) * 0.05;
  bot.lastFireTime = now;
  botAfterShots(bot, 1, d, now);
}
