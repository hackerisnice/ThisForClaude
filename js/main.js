// main.js：游戏主循环与渲染
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 12. 游戏主循环
// ============================================================================
const clock = new THREE.Clock();
let lastLootScanTime = 0;
let lastSecondTick = 0;
let lastFrameStamp = performance.now();
let lastLootSignature = "";
// 第一人称持枪晃动（纯视觉）
let gunBobPhase = 0, gunSwayX = 0, gunSwayY = 0, lastSwayYaw = yaw, lastSwayPitch = pitch;
const PLAYER_SPRINT_MULT = 1.3; // 玩家移动一律按冲刺速度（原步行速度 × 1.3）
let lastAutoPickupTime = 0;

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  const elapsed = clock.getElapsedTime();
  updateAutoQuality(Math.min((now - lastFrameStamp) / 1000, 0.5));
  lastFrameStamp = now;
  quality.frameCounter++;
  // 淘汰回放播放中：整个战场暂停，只播放录像
  if (replayState.active) {
    updateReplayPlayback(dt, now);
    renderFrame(elapsed);
    return;
  }
  const adsEase = updateADSAnimation(dt);

  // 空投刷新与降落
  if (elapsed >= nextAirdropTime) {
    nextAirdropTime = elapsed + 75;
    spawnAirdropEvent();
  }
  airdrops.forEach(ad => {
    if (!ad.landed) {
      ad.crateGroup.position.y -= 14 * dt;
      if (ad.crateGroup.position.y <= ad.landY) {
        ad.crateGroup.position.y = ad.landY;
        ad.landed = true;
        ad.chute.visible = false;
        ad.smokeEndTime = elapsed + 110;
        ad.lootEntries = populateAirdropLoot(ad.x, ad.z, ad.landY);
        addCollider(ad.x - 0.75, ad.x + 0.75, ad.z - 0.75, ad.z + 0.75, ad.landY, ad.landY + 1.2);
      }
    } else if (elapsed < ad.smokeEndTime) {
      ad.smokeParticles.forEach((sp, idx) => {
        sp.material.opacity = 0.52;
        sp.position.y += 2.2 * dt;
        sp.position.x = ad.x + Math.sin(elapsed * 2 + idx) * 0.45;
        if (sp.position.y > ad.landY + 13) sp.position.y = ad.landY + 1.2;
      });
    } else {
      ad.smokeParticles.forEach(sp => { sp.material.opacity = 0; });
    }
  });

  if (planeGroup.visible) {
    flightPath.travel += PLANE_SPEED * dt;
    const pp = flightPointAt(flightPath.travel);
    planeGroup.position.set(pp.x, PLANE_ALT, pp.z);
    if (player.phase === "plane") {
      // 机舱视角：机身后上方
      playerRig.position.set(pp.x - flightPath.dx * 20, PLANE_ALT + 8, pp.z - flightPath.dz * 20);
      if (flightPath.travel > flightPath.len - 60) jumpFromPlane(); // 航线尽头强制跳伞
    }
    if (flightPath.travel > flightPath.len + 300) planeGroup.visible = false;
  }

  if (player.phase === "sky" || player.phase === "chute") {
    const fallSpeed = player.phase === "sky" ? 42 : 12;
    const moveSpeed = player.phase === "sky" ? 32 : 20;
    playerRig.position.y -= fallSpeed * dt;

    let mx = moveVec.x, mz = moveVec.z;
    if (keysPressed["KeyW"]) mz = -1;
    if (keysPressed["KeyS"]) mz = 1;
    if (keysPressed["KeyA"]) mx = -1;
    if (keysPressed["KeyD"]) mx = 1;

    const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const step = new THREE.Vector3()
      .addScaledVector(forward, (mz !== 0 ? mz : -0.6) * moveSpeed * dt)
      .addScaledVector(right, mx * moveSpeed * dt);
    const skyFeet = playerRig.position.y - 1.7;
    const landY = getGroundHeight(playerRig.position.x, playerRig.position.z, skyFeet + 0.5);
    if (skyFeet > landY + 8) {
      // 高空中不受地面墙体/树木的平面碰撞阻挡（原版跳伞时在半空会被看不见的墙卡住，甚至直直落进墙里）
      playerRig.position.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, playerRig.position.x + step.x));
      playerRig.position.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, playerRig.position.z + step.z));
    } else {
      // 接近落点才恢复碰撞；若此刻正好处在墙/树/石头上方，先推到旁边空地
      pushOutOfColliders(playerRig.position, 0.5, skyFeet);
      moveWithWallCollisions(playerRig.position, step.x, step.z, 0.5, skyFeet);
    }

    if (player.phase === "sky" && skyFeet - landY <= 55) {
      player.phase = "chute";
      actionBtn.style.display = "none";
    }
    // 落地：可以落在地面、平顶楼的屋顶、遗迹台基或桥面上
    const touch = getGroundHeight(playerRig.position.x, playerRig.position.z, skyFeet + 0.05);
    if (skyFeet <= touch) {
      player.phase = "ground";
      player.feetY = touch;
      player.eyeH = 1.7;
      player.velY = 0;
      playerRig.position.y = touch + 1.7;
      pushOutOfColliders(playerRig.position, 0.48, touch);
      actionBtn.style.display = "none";
      sfx.playLanding(0.5);
      rebuildFPGunModel();
    }
  }

  if (player.phase === "ground") {
    // 防卡墙兜底：被空投箱砸中等极端情况下自动挤出（正常时只是一次碰撞查询）
    pushOutOfColliders(playerRig.position, 0.48, player.feetY);

    let mx = moveVec.x, mz = moveVec.z;
    if (keysPressed["KeyW"]) mz = -1;
    if (keysPressed["KeyS"]) mz = 1;
    if (keysPressed["KeyA"]) mx = -1;
    if (keysPressed["KeyD"]) mx = 1;

    if (mx !== 0 || mz !== 0) {
      if (player.casting && player.casting.title.includes("💊")) cancelCastProgress();
      const boostSpeed = player.boost > 60 ? 1.12 : 1.0;
      const stanceSpeed = player.stance === "stand" ? 6.8 : (player.stance === "crouch" ? 4.4 : 2.3);
      // 取消走路：所有姿态一律按冲刺速度移动（站立 8.84 m/s，蹲 5.7，趴 3.0）
      const speed = stanceSpeed * boostSpeed * PLAYER_SPRINT_MULT * dt;
      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const moveDelta = new THREE.Vector3()
        .addScaledVector(forward, mz * speed)
        .addScaledVector(right, mx * speed);

      const px0 = playerRig.position.x, pz0 = playerRig.position.z;
      movePlayerWithCornerAssist(playerRig.position, moveDelta.x, moveDelta.z, 0.48, player.feetY);
      // 脚步声：按实际移动距离计步（站立跑动 / 蹲走 / 匍匐的步幅与音量不同）
      if (player.velY === 0) {
        player.stepAccum += Math.hypot(playerRig.position.x - px0, playerRig.position.z - pz0);
        const stride = player.stance === "stand" ? 2.3 : (player.stance === "crouch" ? 1.5 : 1.1);
        if (player.stepAccum >= stride) {
          player.stepAccum = 0;
          const vol = player.stance === "stand" ? 0.2 : (player.stance === "crouch" ? 0.09 : 0.06);
          sfx.playFootstep(surfaceTypeAt(playerRig.position.x, playerRig.position.z, player.feetY), vol, 0, player.stance === "prone");
          notifyBotsOfPlayerStep();
        }
      }
    }

    // 竖直方向：跟随脚下表面（楼梯坡道连续爬升、小台阶直接迈上），悬空则受重力下落
    const gx = playerRig.position.x, gz = playerRig.position.z;
    const groundNow = getGroundHeight(gx, gz, player.feetY + (player.velY > 0 ? 0.05 : STEP_UP));
    if (player.velY !== 0 || player.feetY > groundNow + 0.4) {
      const prevFeet = player.feetY;
      player.feetY += player.velY * dt;
      player.velY -= 18 * dt;
      const land = getGroundHeight(gx, gz, prevFeet + 0.05);
      if (player.velY <= 0 && player.feetY <= land) {
        const impact = -player.velY;
        player.feetY = land;
        player.velY = 0;
        if (impact > 4) sfx.playLanding(Math.min(1, impact / 16));
        // 坠落伤害：从 5 米以上跳下开始掉血（三层楼顶跳下约掉 30 血）
        if (impact > 13) damagePlayer(Math.round((impact - 13) * 5.5), "坠落", "跌落");
      }
    } else {
      player.feetY = groundNow;
    }
    player.eyeH += (STANCE_EYE[player.stance] - player.eyeH) * Math.min(1, dt * 10);
    playerRig.position.y = player.feetY + player.eyeH;

    const curWep = player.weapons[player.activeSlot];
    if (curWep && now >= player.boltLockedUntil) {
      const st = getActiveWeaponEffectiveStats(curWep);
      const intervalMs = 60000 / st.rpm;
      const mode = st.hasBumpStock ? "auto" : curWep.fireMode;

      if (player.isFiring && mode === "auto") {
        if (now - player.lastShotTime >= intervalMs) {
          player.lastShotTime = now;
          fireCurrentWeapon();
        }
      } else if (player.burstRemaining > 0) {
        if (now - player.lastShotTime >= intervalMs) {
          player.lastShotTime = now;
          fireCurrentWeapon();
          player.burstRemaining--;
        }
      }
    }

    if (now < player.boltLockedUntil) {
      fpGunGroup.rotation.x = 0.28 * Math.sin(((player.boltLockedUntil - now) / 1000) * Math.PI);
    } else {
      fpGunGroup.rotation.x += (0 - fpGunGroup.rotation.x) * 12 * dt;
    }
    // 腰射位 ↔ 开镜位 之间按开镜动画进度插值（开镜位：瞄具正对视线中心）
    const adsE = adsEase;
    const restZ = -0.48 + (-0.3 + 0.48) * adsE;
    fpGunGroup.position.z += (restZ - fpGunGroup.position.z) * 14 * dt;

    // 跑动晃枪 + 转视角时枪身惯性滞后（只影响枪模显示，不影响准星与弹道）；开镜时晃动大幅减弱
    const movingNow = mx !== 0 || mz !== 0;
    gunBobPhase += dt * (movingNow ? (player.stance === "stand" ? 12.5 : 8.5) : 1.6);
    const bobAmp = (movingNow ? (player.stance === "stand" ? 0.018 : 0.012) : 0.0025) * (1 - adsE * 0.85);
    const dYaw = angleDiff(yaw, lastSwayYaw), dPitch = pitch - lastSwayPitch;
    lastSwayYaw = yaw; lastSwayPitch = pitch;
    const swayK = Math.min(1, dt * 10);
    gunSwayX += (Math.max(-0.035, Math.min(0.035, dYaw * 0.5)) - gunSwayX) * swayK;
    gunSwayY += (Math.max(-0.03, Math.min(0.03, dPitch * 0.4)) - gunSwayY) * swayK;
    const hipX = 0.24 + Math.sin(gunBobPhase) * bobAmp + gunSwayX;
    const hipY = -0.22 + Math.abs(Math.cos(gunBobPhase)) * bobAmp * 0.8 - gunSwayY;
    const aimX = Math.sin(gunBobPhase) * bobAmp + gunSwayX * 0.3;
    const aimY = -adsAnim.sightY + Math.abs(Math.cos(gunBobPhase)) * bobAmp * 0.8 - gunSwayY * 0.3;
    fpGunGroup.position.x = hipX + (aimX - hipX) * adsE;
    fpGunGroup.position.y = hipY + (aimY - hipY) * adsE;
    // 抬枪过程中枪身轻微侧倾，到位后回正
    fpGunGroup.rotation.z = Math.sin(adsAnim.t * Math.PI) * 0.09;
    if (muzzleFlashMesh && muzzleFlashMesh.material.opacity > 0) {
      muzzleFlashMesh.material.rotation = Math.random() * Math.PI;
    }
  }

  if (player.casting) {
    const pct = Math.min(100, ((now - player.casting.startTime) / player.casting.totalMs) * 100);
    document.getElementById("cast-bar-fill").style.width = `${pct}%`;
    if (now >= player.casting.endTime) {
      const fn = player.casting.onFinish;
      cancelCastProgress();
      fn();
    }
  }

  // AI 完整生命周期（逐帧逻辑见 updateAIBot）；绕路寻路每帧最多算一次
  navSearchesThisFrame = 0;
  aiPlayers.forEach(bot => updateAIBot(bot, dt, now, elapsed));

  // 毒圈平滑缩圈
  const curStageCfg = ZONE_STAGES[zoneState.stageIdx];
  if (curStageCfg) {
    zoneState.timerSec -= dt;
    if (zoneState.mode === "shrinking") {
      const shrinkSpeed = (zoneState.startR - zoneState.targetR) / curStageCfg.shrinkSec;
      zoneState.curR = Math.max(zoneState.targetR, zoneState.curR - shrinkSpeed * dt);
      blueZoneMesh.scale.set(zoneState.curR, 1, zoneState.curR);
    }

    if (zoneState.timerSec <= 0) {
      if (zoneState.mode === "waiting") {
        zoneState.mode = "shrinking";
        zoneState.startR = zoneState.curR;
        zoneState.timerSec = curStageCfg.shrinkSec;
      } else {
        zoneState.curR = zoneState.targetR;
        blueZoneMesh.scale.set(zoneState.curR, 1, zoneState.curR);
        if (zoneState.stageIdx < ZONE_STAGES.length - 1) {
          zoneState.stageIdx++;
          const nextCfg = ZONE_STAGES[zoneState.stageIdx];
          zoneState.targetR = nextCfg.targetR;
          zoneState.dps = nextCfg.dps;
          zoneState.mode = "waiting";
          zoneState.timerSec = nextCfg.waitSec;
        } else {
          zoneState.timerSec = 0;
        }
      }
    }
  }

  // 每秒结算玩家与 AI 的毒圈扣血淘汰
  if (now - lastSecondTick > 1000) {
    lastSecondTick = now;
    const stNum = zoneState.stageIdx + 1;
    document.getElementById("zone-timer").innerText = zoneState.mode === "waiting"
      ? `⏳ 阶段${stNum}等待: ${formatMMSS(zoneState.timerSec)}`
      : `⚡ 阶段${stNum}缩圈: ${formatMMSS(zoneState.timerSec)}`;

    if (player.boost > 0 && player.phase === "ground") {
      player.boost = Math.max(0, player.boost - 1.2);
      if (player.hp < 100) player.hp = Math.min(100, player.hp + (player.boost > 60 ? 3 : 1.5));
      updateAllHUD();
    }

    const pDist = Math.hypot(playerRig.position.x - zoneState.cx, playerRig.position.z - zoneState.cz);
    const inBlue = player.phase === "ground" && pDist > zoneState.curR;
    document.getElementById("bluezone-overlay").style.display = inBlue ? "block" : "none";
    if (inBlue) {
      damagePlayer(zoneState.dps, "电网蓝圈 (Blue Zone)", "电击");
    }

    aiPlayers.forEach(bot => {
      if (!bot.alive || bot.phase !== "ground") return;
      const bDist = Math.hypot(bot.group.position.x - zoneState.cx, bot.group.position.z - zoneState.cz);
      if (bDist > zoneState.curR) {
        bot.hp -= zoneState.dps * 1.4;
        if (bot.hp <= 0) {
          killAIBot(bot, "电网蓝圈", "BlueZone", false, false);
        }
      }
    });
  }

  if (now - lastLootScanTime > 120) {
    lastLootScanTime = now;
    const deg = Math.round(((-yaw * 180 / Math.PI) % 360 + 360) % 360);
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    const dirStr = dirs[Math.round(deg / 45) % 8];
    document.getElementById("compass-bar").innerText = `${dirStr} ${deg}° | ${currentAreaName()}`;

    let near = getNearbyLoot();
    if (near.length > 0 && now - lastAutoPickupTime > 240) {
      tryAutoPickup(near);
      if (near.some(e => e.gone)) {
        lastAutoPickupTime = now;
        near = near.filter(e => !e.gone);
      }
    }
    const floatBox = document.getElementById("nearby-loot-float");
    const listDiv = document.getElementById("quick-loot-list");
    // 列表内容没变化就不重建 DOM：省掉每秒 8 次重排，也避免手指按下瞬间按钮被替换导致“点了没反应”
    const lootSignature = near.slice(0, 5).map(e => worldLootItems.indexOf(e) + ":" + (e.item.count || 0)).join("|") + "#" + near.length;
    if (lootSignature !== lastLootSignature) {
      lastLootSignature = lootSignature;
      if (near.length === 0) {
        floatBox.style.display = "none";
      } else {
        floatBox.style.display = "block";
        document.getElementById("loot-count-tag").innerText = near.length;
        listDiv.innerHTML = "";
        near.slice(0, 5).forEach(entry => {
          const div = document.createElement("div");
          div.className = "quick-loot-item";
          div.innerHTML = `<span>${entry.item.name} ${entry.item.count ? "x" + entry.item.count : ""}</span><strong style="color:#00ff88;">+捡</strong>`;
          div.onclick = () => pickupLootObject(entry);
          listDiv.appendChild(div);
        });
      }
    }
    drawMinimap();
    if (bigMapOpen && quality.frameCounter % 3 === 0) drawBigMap();

    // 远处物资不渲染（太小看不见，却占大量绘制调用）
    const lootD2 = quality.lootDist * quality.lootDist;
    const lpx = playerRig.position.x, lpz = playerRig.position.z;
    for (let i = 0; i < worldLootItems.length; i++) {
      const e = worldLootItems[i];
      const dx = e.x - lpx, dz = e.z - lpz;
      e.mesh.visible = dx * dx + dz * dz < lootD2;
    }
  }

  for (let i = bloodParticles.length - 1; i >= 0; i--) {
    const p = bloodParticles[i];
    p.position.addScaledVector(p.userData.vel, dt);
    p.userData.vel.y -= 9.8 * dt;
    if (now - p.userData.born > 380) {
      scene.remove(p);
      bloodParticles.splice(i, 1);
    }
  }

  // 投掷物飞行/爆炸、烟雾、火海、爆炸特效
  updateThrowables(dt, now);
  updateFx(dt, now);
  updateSmoke(dt, now);
  updateFire(dt, now);
  updateThrowAim(dt);
  // 远处的静态合批块整块隐藏（地图变大后视野外的城镇不再提交绘制）
  cullStaticBatches();
  // 录像：最近 16 秒战场（用于淘汰回放）
  replayRecordTick(dt);

  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
  // 近处爆炸震屏（只抖动镜头位置，不改变瞄准方向）
  if (cameraShake > 0.001) {
    camera.position.set((Math.random() - 0.5) * cameraShake, (Math.random() - 0.5) * cameraShake, 0);
    cameraShake = Math.max(0, cameraShake - dt * 0.35);
  } else if (camera.position.x !== 0 || camera.position.y !== 0) {
    camera.position.set(0, 0, 0);
    cameraShake = 0;
  }
  renderFrame(elapsed);
}

// 渲染：第一遍画世界（含阴影），第二遍清深度后只画第一人称枪械与手臂（图层1）→ 贴墙不穿模
function renderFrame(elapsed) {
  skyDome.position.copy(playerRig.position);
  skyMat.uniforms.time.value = elapsed;
  blueZoneMat.uniforms.time.value = elapsed;
  waterNormalTex.offset.set(elapsed * 0.012, elapsed * 0.02);
  updateSunShadowCenter();
  if (sunLight.castShadow) {
    renderer.shadowMap.needsUpdate = quality.frameCounter % QUALITY_PRESETS[quality.tier].shadowEvery === 0;
  }

  renderer.clear();
  camera.layers.set(0);
  renderer.render(scene, camera);
  if (((fpGunGroup.visible && fpGunGroup.children.length > 0) || throwHandMesh.visible) && player.phase === "ground") {
    renderer.clearDepth();
    camera.layers.set(1);
    renderer.render(scene, camera);
    camera.layers.set(0);
  }
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// 视线/射击网格在加载时一次建好（避免开局第一次索敌时卡一下）
syncLOSGrid();
syncShootGrid();
updateAllHUD();
animate();

