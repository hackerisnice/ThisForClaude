// combat.js：玩家开火、弹道、命中、AI 受击反应
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 6. 开火、栓狙闭镜拉栓自动重开镜（AMR除外）、AI受击反应
// ============================================================================
const raycaster = new THREE.Raycaster();

function getActiveWeaponEffectiveStats(wepInstance) {
  const base = WEAPONS_DATA[wepInstance.id];
  const atts = wepInstance.attachments;

  let vMult = 1.0, hMult = 1.0, firstMult = base.firstMult;
  let spreadX = base.spreadX || 0, spreadY = base.spreadY || 0;
  let rpm = base.rpm;
  let isSupp = false;
  let reloadMult = 1.0;
  let hasBumpStock = false;

  Object.values(atts).forEach(attId => {
    const a = ATTACHMENTS_DATA[attId];
    if (!a) return;
    if (a.vMult) vMult *= a.vMult;
    if (a.hMult) hMult *= a.hMult;
    if (a.firstMult) firstMult *= a.firstMult;
    if (a.spreadXMult) spreadX *= a.spreadXMult;
    if (a.spreadYMult) spreadY *= a.spreadYMult;
    if (a.isSupp) isSupp = true;
    if (a.reloadMult) reloadMult *= a.reloadMult;
    if (a.forceAuto) { hasBumpStock = true; rpm = Math.round(rpm * a.rpmMult); }
  });

  if (player.stance === "crouch") { vMult *= 0.82; hMult *= 0.84; }
  else if (player.stance === "prone") {
    const hasBipod = ["dp28", "mk14", "m249", "amr"].includes(base.id);
    vMult *= hasBipod ? 0.34 : 0.65;
    hMult *= hasBipod ? 0.36 : 0.68;
  }

  const maxMag = atts.mag === "ext_mag" ? base.ext : base.mag;
  return {
    vRec: base.vRec * vMult,
    hRec: base.hRec * hMult,
    firstMult, spreadX, spreadY, rpm, isSupp, reloadMult, maxMag, hasBumpStock
  };
}

// 弹孔贴花：单个实例化网格承载全部弹孔（最多 240 个，与原版上限相同，但只需 1 次绘制）
const MAX_BULLET_HOLES = 240;
const bulletHoleMesh = new THREE.InstancedMesh(
  new THREE.CircleGeometry(1, 10),
  new THREE.MeshBasicMaterial({
    map: holeTex, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4
  }),
  MAX_BULLET_HOLES
);
bulletHoleMesh.count = 0;
bulletHoleMesh.frustumCulled = false;
scene.add(bulletHoleMesh);
let bulletHoleCursor = 0;
const _holeDummy = new THREE.Object3D();
const _holeLook = new THREE.Vector3();

function addBulletHoleDecal(point, normal, radius) {
  _holeDummy.position.copy(point).addScaledVector(normal, 0.015);
  _holeDummy.lookAt(_holeLook.copy(point).add(normal));
  _holeDummy.scale.setScalar(radius);
  _holeDummy.updateMatrix();
  bulletHoleMesh.setMatrixAt(bulletHoleCursor, _holeDummy.matrix);
  bulletHoleCursor = (bulletHoleCursor + 1) % MAX_BULLET_HOLES;
  bulletHoleMesh.count = Math.min(MAX_BULLET_HOLES, bulletHoleMesh.count + 1);
  bulletHoleMesh.instanceMatrix.needsUpdate = true;
}

function showHitMarker() {
  const hm = document.getElementById("hit-marker");
  hm.style.opacity = 1;
  clearTimeout(hm._t);
  hm._t = setTimeout(() => { hm.style.opacity = 0; }, 110);
}

// 血雾粒子：共享材质的柔边精灵（原版每颗粒子新建几何体+材质且从不释放）
const bloodSpriteMat = new THREE.SpriteMaterial({ map: softDotTex, color: 0xb00000, transparent: true, depthWrite: false });
function spawnBloodEffect(pos) {
  for (let i = 0; i < 6; i++) {
    const p = new THREE.Sprite(bloodSpriteMat);
    p.scale.setScalar(0.12 + Math.random() * 0.12);
    p.position.copy(pos);
    p.userData = {
      vel: new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3),
      born: performance.now()
    };
    scene.add(p);
    bloodParticles.push(p);
  }
}

function startCastProgress(title, durationSec, onFinish) {
  player.casting = {
    title,
    startTime: performance.now(),
    endTime: performance.now() + durationSec * 1000,
    totalMs: durationSec * 1000,
    onFinish
  };
  document.getElementById("cast-label").innerText = title;
  document.getElementById("cast-progress-box").style.display = "block";
}

function cancelCastProgress() {
  player.casting = null;
  document.getElementById("cast-progress-box").style.display = "none";
}

function fireCurrentWeapon() {
  if (player.phase !== "ground") return;
  const now = performance.now();
  if (now < player.boltLockedUntil) return;
  if (player.casting) cancelCastProgress();

  const wep = player.weapons[player.activeSlot];
  if (!wep) {
    sfx.playShot(true, 2.0, 0);
    fpGunGroup.position.z = -0.3;
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    raycaster.far = 2.6;
    const hits = raycaster.intersectObjects(aiHitboxes, false);
    if (hits.length > 0) {
      const bot = hits[0].object.userData.bot;
      if (bot && bot.alive) {
        bot.hp -= 35;
        bot.alertUntil = now + 9500;
        setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 1500);
        showHitMarker();
        sfx.playHit(false);
        spawnBloodEffect(hits[0].point);
        if (bot.hp <= 0) killAIBot(bot, "你 (Player)", "铁拳", false, true);
      }
    }
    return;
  }

  const base = WEAPONS_DATA[wep.id];
  const st = getActiveWeaponEffectiveStats(wep);

  if (wep.ammoInMag <= 0) {
    player.isFiring = false;
    reloadActiveWeapon();
    return;
  }

  wep.ammoInMag--;
  player.consecutiveShots++;
  sfx.playShot(st.isSupp, base.dmg ? base.dmg / 42 : 1.5, 0);

  alertNearbyAIsOnPlayerShot(st.isSupp);

  if (muzzleFlashMesh && !st.isSupp) {
    muzzleFlashMesh.material.opacity = 0.9;
    setTimeout(() => { if (muzzleFlashMesh) muzzleFlashMesh.material.opacity = 0; }, 35);
  }
  fpGunGroup.position.z = -0.38;

  const pelletCount = base.type === "SG" ? base.pellets : 1;
  let anyHeadshot = false;
  let anyHit = false;

  for (let p = 0; p < pelletCount; p++) {
    let offsetX = 0, offsetY = 0;
    if (base.type === "SG") {
      const angle = (p / pelletCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const radius = p === 0 ? 0.15 : (0.45 + Math.random() * 0.55);
      offsetX = Math.cos(angle) * radius * st.spreadX;
      offsetY = Math.sin(angle) * radius * st.spreadY;
    } else if (!player.isADS) {
      offsetX = (Math.random() - 0.5) * 0.028;
      offsetY = (Math.random() - 0.5) * 0.028;
    }

    raycaster.setFromCamera(new THREE.Vector2(offsetX, offsetY), camera);
    raycaster.far = 850;
    const hits = raycaster.intersectObjects(gatherShootCandidates(raycaster.ray, 850), false);
    if (p < 3) {
      // 录像：子弹轨迹（从枪口略下方出发，打到命中点或 300 米外）
      const ro = raycaster.ray.origin, rd = raycaster.ray.direction;
      const end = hits.length ? hits[0].point : ro.clone().addScaledVector(rd, 300);
      const impact = !hits.length ? 0 : (hits[0].object.userData && hits[0].object.userData.isAI ? 1 : 2);
      replayShotEvent(-1, ro.x + rd.x * 0.6, ro.y - 0.2 + rd.y * 0.6, ro.z + rd.z * 0.6, [end.x, end.y, end.z], [impact]);
    }

    if (hits.length > 0) {
      const hit = hits[0];
      if (hit.object.userData && hit.object.userData.isAI) {
        const bot = hit.object.userData.bot;
        if (bot.alive) {
          anyHit = true;
          const isHead = hit.object.userData.isHead;
          if (isHead) anyHeadshot = true;
          const rawDmg = base.type === "SG" ? base.dmgPerPellet : base.dmg;
          // 爆头按 AI 头盔等级减伤，打身体按防弹衣等级减伤
          const finalDmg = Math.round(rawDmg * (isHead ? 2.35 : 1.0) * (1 - botArmorReduction(bot, isHead)));
          bot.hp -= finalDmg;
          player.totalDmg += finalDmg;
          spawnBloodEffect(hit.point);

          bot.alertUntil = now + 12000;
          bot.strafeDir = -bot.strafeDir;
          setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 1500);

          if (bot.hp <= 0 && bot.alive) {
            killAIBot(bot, "你 (Player)", base.name, isHead, true);
          }
        }
      } else {
        addBulletHoleDecal(hit.point, hit.face.normal, base.type === "SG" ? 0.038 : 0.055);
      }
    }
  }

  if (anyHit) {
    showHitMarker();
    sfx.playHit(anyHeadshot);
  }

  if (base.isBoltAction) {
    player.isFiring = false;
    const bt = (base.boltTime || 1.25) * st.reloadMult;
    player.boltLockedUntil = now + bt * 1000;

    const wasADS = player.isADS;
    if (wasADS) {
      player.isADS = false;
      player.reopenADSAfterBolt = true;
      updateScopeState();
    }
    sfx.playBoltAction();

    setTimeout(() => {
      if (player.reopenADSAfterBolt && player.phase === "ground") {
        const cur = player.weapons[player.activeSlot];
        if (cur && cur.id === wep.id && cur.ammoInMag > 0) {
          player.isADS = true;
          updateScopeState();
        }
        player.reopenADSAfterBolt = false;
      }
    }, bt * 1000);
  }

  const isFirst = player.consecutiveShots === 1;
  const vCurve = isFirst ? st.firstMult : (1.2 + Math.min(player.consecutiveShots * 0.025, 0.45));
  const vKick = st.vRec * vCurve * 0.0165;
  const hKick = (Math.random() - 0.48) * 2 * st.hRec * 0.0135;

  pitch += vKick;
  yaw -= hKick;
  pitch = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, pitch));

  updateAllHUD();
}

function reloadActiveWeapon() {
  const wep = player.weapons[player.activeSlot];
  if (!wep) return;
  const base = WEAPONS_DATA[wep.id];
  const st = getActiveWeaponEffectiveStats(wep);
  const avail = player.ammoBag[base.ammoType] || 0;
  if (avail <= 0 || wep.ammoInMag >= st.maxMag) return;

  player.isFiring = false;
  player.reopenADSAfterBolt = false;
  if (player.isADS) {
    player.isADS = false;
    updateScopeState();
  }

  const rTime = 2.1 * st.reloadMult;
  sfx.playBoltAction();
  startCastProgress(`🔄 装填 ${base.name}...`, rTime, () => {
    const need = st.maxMag - wep.ammoInMag;
    const take = Math.min(need, player.ammoBag[base.ammoType]);
    wep.ammoInMag += take;
    player.ammoBag[base.ammoType] -= take;
    updateAllHUD();
  });
}
