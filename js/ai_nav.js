// ai_nav.js：AI 寻路：上下楼梯、进出房门、过桥、触须避障、身体动画
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// 楼梯导航辅助：第 f 段楼梯（从 f 层到 f+1 层）位于 lanes[f % 2]，0 号道向南(+z)爬升，1 号道向北(-z)爬升
function floorOfY(b, y) {
  return Math.max(0, Math.min(b.floors - 1, Math.round((y - 0.1) / FLOOR_H)));
}
function stairLowApproach(b, f) {
  const st = b.stairs, L = f % 2, lane = st.lanes[L];
  return new THREE.Vector3((lane[0] + lane[1]) / 2, floorY(f), L === 0 ? st.zA - 0.8 : st.zB + 0.8);
}
function stairHighExit(b, f) {
  const st = b.stairs, L = f % 2, lane = st.lanes[L];
  return new THREE.Vector3((lane[0] + lane[1]) / 2, floorY(f + 1), L === 0 ? st.zB + 0.8 : st.zA - 0.8);
}
// 当前是否站在某段楼梯上（返回段号，否则 -1）
function flightAt(b, pos) {
  const st = b.stairs;
  if (!st || pos.z < st.zA - 0.02 || pos.z > st.zB + 0.02) return -1;
  for (let L = 0; L < 2; L++) {
    if (pos.x < st.lanes[L][0] - 0.05 || pos.x > st.lanes[L][1] + 0.05) continue;
    const f = Math.floor((pos.y - 0.05) / FLOOR_H);
    if (f >= 0 && f <= b.floors - 2 && f % 2 === L) return f;
  }
  return -1;
}

// 计算 AI 的下一个导航子目标（自动进出房门、上下楼梯、自动找桥过河）
function computeAINavSubTarget(botPos, finalGoal) {
  // 1. 跨河检测：如果 AI 与目标点分布在河流两侧，先导航到最近的跨河大桥
  const nearSide = RIVER_Z - RIVER_HALF - 5, farSide = RIVER_Z + RIVER_HALF + 5;
  if ((botPos.z < nearSide && finalGoal.z > farSide) || (botPos.z > farSide && finalGoal.z < nearSide)) {
    let bestBx = BRIDGE_XS[0];
    let minD = 99999;
    BRIDGE_XS.forEach(bx => {
      const d = Math.abs(botPos.x - bx);
      if (d < minD) { minD = d; bestBx = bx; }
    });
    if (Math.abs(botPos.x - bestBx) > 8) {
      return new THREE.Vector3(bestBx, 0, botPos.z < RIVER_Z ? RIVER_Z - 34 : RIVER_Z + 34);
    }
    return new THREE.Vector3(bestBx, 0, botPos.z < RIVER_Z ? RIVER_Z + 38 : RIVER_Z - 38);
  }

  const botHouse = getBuildingContainingPoint(botPos.x, botPos.z, -0.3);
  const goalHouse = getBuildingContainingPoint(finalGoal.x, finalGoal.z, 0.3);

  // 2. 楼层切换：目标在本楼另一层，或者人在楼上但要出门 → 先走楼梯
  if (botHouse && botHouse.stairs) {
    const goalFloor = goalHouse === botHouse ? floorOfY(botHouse, finalGoal.y || 0) : 0;
    const fl = flightAt(botHouse, botPos);
    if (fl >= 0) return goalFloor > fl ? stairHighExit(botHouse, fl) : stairLowApproach(botHouse, fl);
    const bf = floorOfY(botHouse, botPos.y);
    if (bf < goalFloor) {
      const la = stairLowApproach(botHouse, bf);
      return Math.hypot(botPos.x - la.x, botPos.z - la.z) < 0.7 ? stairHighExit(botHouse, bf) : la;
    }
    if (bf > goalFloor) {
      const he = stairHighExit(botHouse, bf - 1);
      return Math.hypot(botPos.x - he.x, botPos.z - he.z) < 0.7 ? stairLowApproach(botHouse, bf - 1) : he;
    }
  }

  // 3. 如果 AI 在某栋房子内部，而目标点在房子外面 -> 先走向最近的房门出去！
  if (botHouse && botHouse !== goalHouse) {
    const dNorth = Math.hypot(botPos.x - botHouse.northDoor.x, botPos.z - botHouse.northDoor.z);
    const dSouth = Math.hypot(botPos.x - botHouse.southDoor.x, botPos.z - botHouse.southDoor.z);
    const exitDoor = dNorth < dSouth ? botHouse.northDoor : botHouse.southDoor;
    return new THREE.Vector3(exitDoor.x, 0, exitDoor.z);
  }

  // 4. 如果目标物资在某栋房子内部，而 AI 在房子外面 -> 先导航到该房子的正门/后门外，再进屋！
  if (goalHouse && botHouse !== goalHouse) {
    const dNorth = Math.hypot(botPos.x - goalHouse.northDoor.x, botPos.z - goalHouse.northDoor.z);
    const dSouth = Math.hypot(botPos.x - goalHouse.southDoor.x, botPos.z - goalHouse.southDoor.z);
    const entryDoor = dNorth < dSouth ? goalHouse.northDoor : goalHouse.southDoor;
    // 如果还没走到门口（距离门口大于 1.8m 且偏离门框中轴线），先去门口对齐
    if (Math.hypot(botPos.x - entryDoor.x, botPos.z - entryDoor.z) > 1.8 && Math.abs(botPos.x - goalHouse.cx) > 1.1) {
      return new THREE.Vector3(entryDoor.x, 0, entryDoor.z);
    }
  }

  return finalGoal;
}

// 角度工具：最短转向差值 / 限速逼近
function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function approachAngle(cur, target, maxStep) {
  const d = angleDiff(target, cur);
  if (Math.abs(d) <= maxStep) return target;
  return cur + Math.sign(d) * maxStep;
}

// AI 身体朝向：平滑转身（不再瞬间 180° 甩头）
const _botFwd = new THREE.Vector3();
function turnBotTowardYaw(bot, targetYaw, maxStep) {
  _botFwd.set(0, 0, 1).applyQuaternion(bot.group.quaternion);
  const cur = Math.atan2(_botFwd.x, _botFwd.z);
  bot.group.rotation.set(0, approachAngle(cur, targetYaw, maxStep), 0);
}
// 让 AI 在接下来一段时间内转向某个方位（听到枪声、被击中、向别人开火时）
function setBotFaceHint(bot, x, z, holdMs) {
  bot.faceHintYaw = Math.atan2(x - bot.group.position.x, z - bot.group.position.z);
  bot.faceHintUntil = performance.now() + holdMs;
}

// 7向触须前瞻避障移动：彻底根除 AI 撞墙卡死
const WHISKER_ANGLES = [0, 0.45, -0.45, 0.92, -0.92, 1.45, -1.45, 2.2, -2.2];
function steerAndMoveAI(bot, desiredTarget, speed, dt) {
  const pos = bot.group.position;
  const subGoal = computeAINavSubTarget(pos, desiredTarget);
  let desiredAngle = Math.atan2(subGoal.x - pos.x, subGoal.z - pos.z);

  // 拟人化：远离子目标时叠加缓慢的蛇形偏移，不再像机器人一样走绝对直线
  // （接近门口/目标 6 米内自动收敛为直线，保证进门与拾取精度）
  const distToSub = Math.hypot(subGoal.x - pos.x, subGoal.z - pos.z);
  if (bot.wanderAmp > 0 && distToSub > 6) {
    const fade = Math.min(1, (distToSub - 6) / 10);
    desiredAngle += Math.sin(performance.now() * 0.001 * bot.wanderFreq + bot.wanderPhase) * bot.wanderAmp * fade;
  }

  let chosenAngle = desiredAngle;
  let foundClear = false;

  for (let i = 0; i < WHISKER_ANGLES.length; i++) {
    const testAngle = desiredAngle + WHISKER_ANGLES[i];
    const vx = Math.sin(testAngle);
    const vz = Math.cos(testAngle);
    // 检测前方 0.9m 和 1.7m 两个采样点是否畅通（按该点的地面高度判断，楼梯坡道不会被当成墙）
    const nx = pos.x + vx * 0.9, nz = pos.z + vz * 0.9, fx = pos.x + vx * 1.7, fz = pos.z + vz * 1.7;
    const clearNear = !isPointBlocked2D(nx, nz, 0.44, Math.max(pos.y, getGroundHeight(nx, nz, pos.y + STEP_UP)));
    const clearFar  = !isPointBlocked2D(fx, fz, 0.44, Math.max(pos.y, getGroundHeight(fx, fz, pos.y + STEP_UP * 2)));
    if (clearNear && clearFar) {
      chosenAngle = testAngle;
      foundClear = true;
      break;
    }
  }

  if (!foundClear) {
    // 极端死角时旋转脱困
    chosenAngle = bot.moveHeading + Math.PI * 0.65;
  }

  // 平滑转向 + 起步/刹车惯性：转身有角速度上限，速度渐变，告别“直角转弯、瞬间启停”
  bot.curHeading = approachAngle(bot.curHeading, chosenAngle, (foundClear ? 7.5 : 12) * dt);
  bot.curSpeed += (speed - bot.curSpeed) * Math.min(1, (speed > bot.curSpeed ? 7 : 10) * dt);
  if (speed === 0 && bot.curSpeed < 0.05) bot.curSpeed = 0;

  const prevX = pos.x, prevZ = pos.z;
  const stepX = Math.sin(bot.curHeading) * bot.curSpeed * dt;
  const stepZ = Math.cos(bot.curHeading) * bot.curSpeed * dt;
  moveWithWallCollisions(pos, stepX, stepZ, 0.44, pos.y);
  // 竖直方向：跟随脚下楼板/楼梯/台基，踩空则下落
  const groundY = getGroundHeight(pos.x, pos.z, pos.y + STEP_UP);
  pos.y = groundY < pos.y - 0.4 ? Math.max(groundY, pos.y - 14 * dt) : groundY;

  const moved = Math.hypot(pos.x - prevX, pos.z - prevZ);
  if (speed > 0.5 && bot.curSpeed > speed * 0.5 && moved < bot.curSpeed * dt * 0.15) {
    // 按时间累计卡住（约等于原版 60 帧下的 10 帧），低帧率手机上表现一致
    bot.stuckTime += dt;
    if (bot.stuckTime > 0.18) {
      // 连续受阻时切换新的脱困目标点
      const escapeAngle = bot.moveHeading + (Math.random() < 0.5 ? 1.8 : -1.8);
      bot.targetPos.set(pos.x + Math.sin(escapeAngle) * 18, 0, pos.z + Math.cos(escapeAngle) * 18);
      bot.stuckTime = 0;
    }
  } else {
    bot.stuckTime = 0;
    if (moved > 0.0001) bot.moveHeading = bot.curHeading;
  }

  // 驱动双腿以髋部为轴自然交替摆动，步幅随速度变化
  if (moved > 0.004) {
    bot.walkCycle += moved * 5.2;
    const amp = Math.min(0.6, 0.15 + (moved / Math.max(dt, 0.001)) * 0.08);
    const swing = Math.sin(bot.walkCycle) * amp;
    bot.legLPivot.rotation.x = swing;
    bot.legRPivot.rotation.x = -swing;
  } else {
    const decay = Math.max(0, 1 - dt * 9);
    bot.legLPivot.rotation.x *= decay;
    bot.legRPivot.rotation.x *= decay;
  }

  return moved;
}

// AI 上半身动画：跑动前倾与起伏、自然摆臂、交火时举枪瞄准、远距离隐藏装备细节
function animateBotBody(bot, dt, aiming, distToPlayer, now) {
  const k = Math.min(1, dt * 8);
  bot.aimBlend += ((aiming ? 1 : 0) - bot.aimBlend) * k;
  const aim = bot.aimBlend;
  const speedN = Math.min(1, bot.curSpeed / 6);
  const swing = Math.sin(bot.walkCycle);

  // 开镜：枪托抵肩、枪抬到眼前、歪头贴腮；上半身随目标高度俯仰（枪口真的对着目标）
  const ads = (bot.adsBlend || 0) * aim;
  const targetLean = 0.03 + speedN * 0.17 * (1 - aim * 0.6) - (bot.aimPitch || 0) * aim * 0.9;
  bot.upper.rotation.x += (targetLean - bot.upper.rotation.x) * k;
  bot.upper.rotation.y = swing * 0.07 * speedN * (1 - aim);
  bot.upper.position.y = 0.72 + Math.abs(Math.cos(bot.walkCycle)) * 0.045 * speedN + Math.sin(now * 0.002 + bot.wanderPhase) * 0.006;
  bot.head.rotation.z = 0.16 * ads;

  const armSwing = swing * 0.55 * speedN * (1 - aim);
  bot.armLPivot.rotation.x = (-0.1 - armSwing) * (1 - aim) + (-1.38 - 0.22 * ads) * aim;
  bot.armRPivot.rotation.x = (-0.1 + armSwing) * (1 - aim) + (-1.22 - 0.3 * ads) * aim;
  bot.armLPivot.rotation.y = (0.62 + 0.08 * ads) * aim;
  bot.armRPivot.rotation.y = (-0.22 - 0.14 * ads) * aim;
  bot.armLPivot.rotation.z = -0.06 * (1 - aim);
  bot.armRPivot.rotation.z = 0.06 * (1 - aim);

  bot.botGunMesh.position.set(0.16 - 0.04 * aim - 0.06 * ads, 0.42 + 0.3 * aim + 0.25 * ads, 0.3 + 0.14 * aim - 0.05 * ads);
  // 换弹 / 切枪时枪口下压晃动，打药时双手收在胸前
  const reloading = now < bot.reloadUntil || now < bot.swapUntil;
  bot.botGunMesh.rotation.x = 0.55 * (1 - aim) + (reloading ? 0.35 + Math.sin(now * 0.012) * 0.15 : 0);
  if (bot.healUntil > 0) {
    bot.armLPivot.rotation.set(-0.9, 0.5, 0);
    bot.armRPivot.rotation.set(-0.9, -0.5, 0);
  }

  // 装备外观随 AI 实际捡到的等级变化（防弹衣/头盔颜色 = 等级，背包大小 = 等级）
  bot.vestMesh.visible = bot.vestLv > 0;
  if (bot.vestLv > 0) bot.vestMesh.material = BOT_MAT.vest[bot.vestLv - 1];
  const showDetail = distToPlayer < quality.detailDist;
  bot.helmetMesh.visible = showDetail && bot.helmLv > 0;
  if (bot.helmLv > 0) bot.helmetMesh.material = BOT_MAT.helmet[bot.helmLv - 1];
  bot.packMesh.visible = showDetail && bot.bagLv > 0;
  if (bot.bagLv > 0) bot.packMesh.scale.setScalar(0.75 + bot.bagLv * 0.15);
  if (showDetail !== bot.detailShown) {
    bot.detailShown = showDetail;
    bot.detailMeshes.forEach(m => { m.visible = showDetail; });
  }
}

// 空中姿态：自由落体张开四肢俯冲，开伞后双手上举拉伞绳
function poseBotInAir(bot, inChute) {
  bot.upper.rotation.set(inChute ? 0.05 : 0.95, 0, 0);
  bot.upper.position.y = 0.72;
  bot.armLPivot.rotation.set(inChute ? -2.8 : 0, inChute ? 0.25 : 0, inChute ? 0 : -1.35);
  bot.armRPivot.rotation.set(inChute ? -2.8 : 0, inChute ? -0.25 : 0, inChute ? 0 : 1.35);
  bot.legLPivot.rotation.x = inChute ? 0.12 : 0.45;
  bot.legRPivot.rotation.x = inChute ? -0.08 : 0.3;
}

function alertNearbyAIsOnPlayerShot(isSuppressed) {
  const hearRadius = isSuppressed ? 65 : 210;
  const now = performance.now();
  aiPlayers.forEach(bot => {
    if (!bot.alive || bot.phase !== "ground") return;
    const d = bot.group.position.distanceTo(playerRig.position);
    if (d <= hearRadius) {
      bot.alertUntil = now + 9500;
      bot.targetPos.set(
        playerRig.position.x + (Math.random() - 0.5) * 10,
        0,
        playerRig.position.z + (Math.random() - 0.5) * 10
      );
      // 听到枪声后循声转身（平滑转向，而不是所有人瞬间齐刷刷转头）
      setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 1400);
    }
  });
}
