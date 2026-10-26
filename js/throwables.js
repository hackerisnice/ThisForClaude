// throwables.js：投掷物：手雷 / 烟雾弹 / 震爆弹 / 燃烧瓶
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 6.5 投掷物：破片手榴弹 / 烟雾弹 / 震爆弹 / 燃烧瓶（玩家与 AI 共用一套物理与效果）
// ============================================================================
const THROW_GRAVITY = 16;
const activeThrows = [];
const smokeClouds = [];
const fireZones = [];
const fxSprites = [];
const throwGeoCache = {};
let cameraShake = 0;
function throwableGeo(id) {
  if (!throwGeoCache[id]) throwGeoCache[id] = mergeColoredParts(buildThrowablePartsGroup(id));
  return throwGeoCache[id];
}

// 通用特效精灵：在寿命内从 s0 放大到 s1、透明度从 a0 变到 a1，可上升、旋转
function spawnFx(o) {
  const mat = new THREE.SpriteMaterial({
    map: o.tex || softDotTex, color: o.color, transparent: true, opacity: o.a0, depthWrite: false,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending
  });
  mat.rotation = Math.random() * Math.PI * 2;
  const sp = new THREE.Sprite(mat);
  sp.position.copy(o.pos);
  sp.scale.setScalar(o.s0);
  scene.add(sp);
  fxSprites.push({ sp, born: performance.now(), life: o.life * 1000, s0: o.s0, s1: o.s1, a0: o.a0, a1: o.a1 || 0, rise: o.rise || 0, spin: (Math.random() - 0.5) * (o.spin || 0.6) });
}
function updateFx(dt, now) {
  for (let i = fxSprites.length - 1; i >= 0; i--) {
    const f = fxSprites[i];
    const t = (now - f.born) / f.life;
    if (t >= 1) { scene.remove(f.sp); f.sp.material.dispose(); fxSprites.splice(i, 1); continue; }
    const e = 1 - (1 - t) * (1 - t);
    f.sp.scale.setScalar(f.s0 + (f.s1 - f.s0) * e);
    f.sp.material.opacity = f.a0 + (f.a1 - f.a0) * t;
    f.sp.position.y += f.rise * dt;
    f.sp.material.rotation += f.spin * dt;
  }
}

// 投掷物物理（飞行中的手雷与瞄准轨迹预览共用）：重力、撞墙/地面/天花板反弹、落地滚动摩擦
function throwPhysicsStep(p, v, h) {
  v.y -= THROW_GRAVITY * h;
  let impact = false;
  const nx = p.x + v.x * h;
  if (isSolidAt(nx, p.y, p.z, 0.08)) { v.x *= -0.45; v.z *= 0.85; impact = true; } else p.x = nx;
  const nz = p.z + v.z * h;
  if (isSolidAt(p.x, p.y, nz, 0.08)) { v.z *= -0.45; v.x *= 0.85; impact = true; } else p.z = nz;
  let ny = p.y + v.y * h;
  if (v.y > 0) {
    const c = getCeilingAbove(p.x, p.z, p.y);
    if (c !== null && ny > c - 0.08) { ny = c - 0.08; v.y *= -0.3; impact = true; }
  } else if (isSolidAt(p.x, ny, p.z, 0.05)) {
    // 落在箱子/矮墙顶上
    ny = p.y;
    if (v.y < -2.5) { v.y *= -0.3; impact = true; } else v.y = 0;
    v.x *= 0.6; v.z *= 0.6;
  }
  const g = getGroundHeight(p.x, p.z, p.y + 0.05);
  if (ny <= g + 0.07) {
    ny = g + 0.07;
    // 落地反弹明显衰减、滚动摩擦较大：最终停在预览落点圈附近 2~3 米内
    if (v.y < -2.5) { v.y *= -0.26; v.x *= 0.45; v.z *= 0.45; impact = true; }
    else { v.y = 0; const fr = Math.max(0, 1 - 8 * h); v.x *= fr; v.z *= fr; }
  }
  p.y = ny;
  p.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, p.x));
  p.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, p.z));
  return impact;
}

function spawnThrowable(id, origin, vel, ownerName, byPlayer, fuseOverride) {
  const mesh = new THREE.Mesh(throwableGeo(id), lootMergedMat);
  mesh.position.copy(origin);
  mesh.castShadow = true;
  scene.add(mesh);
  activeThrows.push({
    id, mesh, p: origin.clone(), v: vel.clone(),
    fuse: fuseOverride !== undefined ? fuseOverride : THROWABLES_DATA[id].fuse,
    ownerName, byPlayer, lastBounce: 0, age: 0
  });
}

function updateThrowables(dt, now) {
  for (let i = activeThrows.length - 1; i >= 0; i--) {
    const t = activeThrows[i];
    const sub = Math.max(1, Math.ceil(t.v.length() * dt / 0.2));
    let impact = false;
    for (let k = 0; k < sub; k++) impact = throwPhysicsStep(t.p, t.v, dt / sub) || impact;
    t.age += dt;
    t.mesh.position.copy(t.p);
    const spd = t.v.length();
    t.mesh.rotation.x += spd * dt * 1.5;
    t.mesh.rotation.z += spd * dt * 0.9;
    if (impact && now - t.lastBounce > 120 && t.id !== "molotov") {
      t.lastBounce = now;
      sfx.playBounce(playerRig.position.distanceTo(t.p), stereoPanFor(t.p.x, t.p.z));
    }
    t.fuse -= dt;
    // 附近 AI 发现脚边的手雷 / 正在飞来的燃烧瓶会跑开
    if ((t.id === "frag" && t.fuse < 2.8) || t.id === "molotov") {
      for (let b = 0; b < aiPlayers.length; b++) {
        const bot = aiPlayers[b];
        if (!bot.alive || bot.phase !== "ground") continue;
        const d = Math.hypot(bot.group.position.x - t.p.x, bot.group.position.z - t.p.z);
        if (d < 7.5 && Math.random() < 0.08) {
          bot.fleeX = t.p.x; bot.fleeZ = t.p.z;
          bot.fleeUntil = now + Math.max(0.6, t.fuse + 0.5) * 1000;
        }
      }
    }
    const done = t.id === "molotov" ? (impact || t.age > 6) : t.fuse <= 0;
    if (done) {
      scene.remove(t.mesh);
      activeThrows.splice(i, 1);
      detonateThrowable(t, now);
    }
  }
}

function detonateThrowable(t, now) {
  const p = t.p;
  const dist = playerRig.position.distanceTo(p);
  const pan = stereoPanFor(p.x, p.z);
  registerRadarSound("shot", p.x, p.z, false);
  replayFxEvent(t.id, p.x, p.y, p.z);
  if (t.id === "frag") explodeFrag(p, t, dist, pan);
  else if (t.id === "smoke") deploySmoke(p, dist, pan, now);
  else if (t.id === "stun") explodeStun(p, t, dist, pan, now);
  else igniteMolotov(p, t, dist, pan, now);
}

const _up = new THREE.Vector3(0, 1, 0);
function explodeFrag(p, t, dist, pan) {
  sfx.playExplosion(dist, pan);
  const c = p.clone(); c.y += 0.4;
  spawnFx({ pos: c, color: 0xfff2c0, s0: 1.5, s1: 10, a0: 1, a1: 0, life: 0.22, additive: true });
  for (let i = 0; i < 4; i++) {
    const q = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6));
    spawnFx({ pos: q, color: 0xff8a2a, s0: 1.2, s1: 5 + Math.random() * 2.5, a0: 0.95, a1: 0, life: 0.5, additive: true });
  }
  for (let i = 0; i < 9; i++) {
    const q = c.clone().add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3));
    spawnFx({ pos: q, color: 0x3d3935, s0: 2, s1: 6 + Math.random() * 3, a0: 0.75, a1: 0, life: 2.4 + Math.random(), rise: 1.4 });
  }
  addBulletHoleDecal(new THREE.Vector3(p.x, p.y - 0.05, p.z), _up, 1.6); // 地面焦痕
  if (dist < 40) cameraShake = Math.max(cameraShake, (1 - dist / 40) * 0.14);
  const R = 9;
  // 玩家
  if (player.phase === "ground") {
    const ex = playerRig.position.x, ey = playerRig.position.y - 0.5, ez = playerRig.position.z;
    const d = Math.hypot(ex - p.x, ey - p.y, ez - p.z);
    if (d < R && losSegmentClear(p.x, p.y + 0.35, p.z, ex, ey, ez)) {
      damagePlayer(Math.round(140 * Math.pow(1 - d / R, 1.5)), t.ownerName, "破片手榴弹");
    }
  }
  // AI
  aiPlayers.forEach(bot => {
    if (!bot.alive || bot.phase !== "ground") return;
    const bp = bot.group.position;
    const d = Math.hypot(bp.x - p.x, bp.y + 1.0 - p.y, bp.z - p.z);
    if (d < 80) setBotFaceHint(bot, p.x, p.z, 1000);
    if (d >= R || !losSegmentClear(p.x, p.y + 0.35, p.z, bp.x, bp.y + 1.0, bp.z)) return;
    const dmg = Math.round(140 * Math.pow(1 - d / R, 1.5) * (1 - botArmorReduction(bot, false)));
    bot.hp -= dmg;
    bot.alertUntil = performance.now() + 9000;
    if (t.byPlayer) { player.totalDmg += dmg; showHitMarker(); }
    if (bot.hp <= 0) killAIBot(bot, t.ownerName, "破片手榴弹", false, t.byPlayer);
  });
}

function deploySmoke(p, dist, pan, now) {
  sfx.playSmokeHiss(dist, pan);
  const mat = new THREE.SpriteMaterial({ map: softDotTex, color: 0xd6d9db, transparent: true, opacity: 0, depthWrite: false });
  const cloud = { x: p.x, y: p.y + 2.2, z: p.z, r: 0.4, born: now, until: now + 26000, mat, sprites: [] };
  for (let i = 0; i < 18; i++) {
    const sp = new THREE.Sprite(mat);
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
    sp.userData.off = new THREE.Vector3(Math.cos(a) * rr, (Math.random() - 0.35) * 0.7, Math.sin(a) * rr);
    sp.userData.size = 4 + Math.random() * 3;
    sp.position.set(p.x, p.y + 0.5, p.z);
    sp.scale.setScalar(1);
    scene.add(sp);
    cloud.sprites.push(sp);
  }
  smokeClouds.push(cloud);
}
function updateSmoke(dt, now) {
  for (let i = smokeClouds.length - 1; i >= 0; i--) {
    const c = smokeClouds[i];
    const age = (now - c.born) / 1000, left = (c.until - now) / 1000;
    c.r = 6.5 * smoothstep(0, 3.2, age);
    c.mat.opacity = 0.93 * smoothstep(0, 2, age) * Math.min(1, left / 4);
    c.sprites.forEach((sp, k) => {
      const o = sp.userData.off;
      sp.position.set(c.x + o.x * c.r + Math.sin(now * 0.0004 + k) * 0.4, c.y + o.y * c.r * 0.6, c.z + o.z * c.r + Math.cos(now * 0.00035 + k) * 0.4);
      sp.scale.setScalar(sp.userData.size * (0.35 + 0.65 * smoothstep(0, 3, age)));
    });
    if (left <= 0) {
      c.sprites.forEach(sp => scene.remove(sp));
      c.mat.dispose();
      smokeClouds.splice(i, 1);
    }
  }
}

const stunFlashEl = document.getElementById("stun-flash");
function triggerStunFlash(k, seconds) {
  stunFlashEl.style.transition = "none";
  stunFlashEl.style.opacity = Math.min(1, k * 1.25).toFixed(2);
  void stunFlashEl.offsetWidth;
  stunFlashEl.style.transition = `opacity ${seconds.toFixed(2)}s cubic-bezier(0.7, 0, 0.9, 0.6)`;
  stunFlashEl.style.opacity = "0";
}
function explodeStun(p, t, dist, pan, now) {
  sfx.playExplosion(dist * 1.8 + 20, pan);
  const c = p.clone(); c.y += 0.4;
  spawnFx({ pos: c, color: 0xffffff, s0: 2, s1: 15, a0: 1, a1: 0, life: 0.35, additive: true });
  if (player.phase === "ground" && dist < 18) {
    const eye = playerRig.position;
    if (losSegmentClear(p.x, p.y + 0.3, p.z, eye.x, eye.y, eye.z)) {
      const view = new THREE.Vector3();
      camera.getWorldDirection(view);
      const to = new THREE.Vector3(p.x - eye.x, p.y - eye.y, p.z - eye.z).normalize();
      const k = (1 - dist / 18) * (0.35 + 0.65 * Math.max(0, view.dot(to)));
      if (k > 0.05) {
        triggerStunFlash(k, 1.2 + 3.2 * k);
        sfx.stunEars(k, 1.5 + 3 * k);
      }
    }
  }
  aiPlayers.forEach(bot => {
    if (!bot.alive || bot.phase !== "ground") return;
    const bp = bot.group.position;
    const d = Math.hypot(bp.x - p.x, bp.y + 1.5 - p.y, bp.z - p.z);
    if (d < 14 && losSegmentClear(p.x, p.y + 0.3, p.z, bp.x, bp.y + 1.5, bp.z)) {
      bot.stunnedUntil = now + 1500 + 2500 * (1 - d / 14);
      bot.alertUntil = now + 9000;
    }
  });
}

function igniteMolotov(p, t, dist, pan, now) {
  sfx.playIgnite(dist, pan);
  const gy = getGroundHeight(p.x, p.z, p.y + 0.2);
  const zone = { x: p.x, y: gy, z: p.z, r: 4.2, born: now, until: now + 9000, nextTick: now, nextSmoke: now, ownerName: t.ownerName, byPlayer: t.byPlayer, flames: [] };
  for (let i = 0; i < 12; i++) {
    const mat = new THREE.SpriteMaterial({ map: softDotTex, color: Math.random() < 0.5 ? 0xff7a1a : 0xffb030, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    const sp = new THREE.Sprite(mat);
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * zone.r * 0.9;
    sp.position.set(p.x + Math.cos(a) * rr, gy + 0.5, p.z + Math.sin(a) * rr);
    sp.userData.base = 1.0 + Math.random() * 1.3;
    sp.userData.phase = Math.random() * 10;
    scene.add(sp);
    zone.flames.push(sp);
  }
  fireZones.push(zone);
}
function updateFire(dt, now) {
  for (let i = fireZones.length - 1; i >= 0; i--) {
    const z = fireZones[i];
    const left = (z.until - now) / 1000;
    const fade = Math.min(1, left / 1.5);
    z.flames.forEach(sp => {
      const f = 0.75 + 0.35 * Math.sin(now * 0.02 + sp.userData.phase) + 0.15 * Math.sin(now * 0.047 + sp.userData.phase * 2);
      sp.scale.set(sp.userData.base * f, sp.userData.base * f * 1.5, 1);
      sp.material.opacity = 0.85 * fade;
    });
    if (now > z.nextSmoke) {
      z.nextSmoke = now + 450;
      spawnFx({ pos: new THREE.Vector3(z.x + (Math.random() - 0.5) * z.r, z.y + 1.5, z.z + (Math.random() - 0.5) * z.r), color: 0x2e2a27, s0: 1.5, s1: 5, a0: 0.5 * fade, a1: 0, life: 2.2, rise: 1.8 });
    }
    if (now > z.nextTick) {
      z.nextTick = now + 250;
      // 火海伤害：每 0.25 秒 3 点（约 12 点/秒），不受防弹衣减免
      if (player.phase === "ground" && Math.hypot(playerRig.position.x - z.x, playerRig.position.z - z.z) < z.r && Math.abs(player.feetY - z.y) < 1.5) {
        damagePlayer(3, z.ownerName, "燃烧瓶");
      }
      aiPlayers.forEach(bot => {
        if (!bot.alive || bot.phase !== "ground") return;
        const d = Math.hypot(bot.group.position.x - z.x, bot.group.position.z - z.z);
        if (Math.abs(bot.group.position.y - z.y) > 1.5) return;
        if (d < z.r + 1.5) { bot.fleeX = z.x; bot.fleeZ = z.z; bot.fleeUntil = now + 1200; }
        if (d < z.r) {
          bot.hp -= 3;
          bot.alertUntil = now + 6000;
          if (z.byPlayer) player.totalDmg += 3;
          if (bot.hp <= 0) killAIBot(bot, z.ownerName, "燃烧瓶", false, z.byPlayer);
        }
      });
    }
    if (left <= 0) {
      z.flames.forEach(sp => { scene.remove(sp); sp.material.dispose(); });
      fireZones.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// AI 投掷：出手前先“在脑子里”模拟一遍抛物线（正常 / 高抛 / 低平三种出手），
// 确认会落到目标附近、不会撞墙弹回自己脚下才扔
// ---------------------------------------------------------------------------
function botPlanThrow(bot, id, tx, ty, tz) {
  const pos = bot.group.position;
  const origin = new THREE.Vector3(pos.x, pos.y + 1.75, pos.z);
  const d = Math.hypot(tx - origin.x, tz - origin.z);
  const p = new THREE.Vector3(), v = new THREE.Vector3();
  for (const k of [1, 1.45, 0.72]) {
    const T = Math.max(0.55, Math.min(2.4, d / 13 * k));
    const vel = new THREE.Vector3((tx - origin.x) / T, (ty - origin.y + 0.5 * THROW_GRAVITY * T * T) / T, (tz - origin.z) / T);
    if (vel.length() > 23) continue;
    p.copy(origin); v.copy(vel);
    let t = 0, hitEarly = false;
    const simT = id === "molotov" ? T + 0.6 : T + 0.9;
    while (t < simT) {
      const imp = throwPhysicsStep(p, v, 1 / 30);
      t += 1 / 30;
      if (imp && t < T * 0.7) { hitEarly = true; break; } // 出手没多远就撞上墙 / 窗框
      if (imp && id === "molotov") break;
    }
    if (hitEarly) continue;
    const miss = Math.hypot(p.x - tx, p.z - tz), self = Math.hypot(p.x - pos.x, p.z - pos.z);
    if (miss < 5 && Math.abs(p.y - ty) < 2.5 && self > (id === "smoke" ? 2.5 : 7)) return { origin, vel, T };
  }
  return null;
}
// 真正扔出去（扔不过去返回 false）：转身、抬手甩臂，近处能听到拉环声
function botThrowNade(bot, id, tx, ty, tz) {
  const plan = botPlanThrow(bot, id, tx, ty, tz);
  if (!plan) return false;
  bot.nades[id]--;
  setBotFaceHint(bot, tx, tz, 900);
  bot.throwAnimUntil = performance.now() + 520;
  const d = playerRig.position.distanceTo(bot.group.position);
  if (d < 25) sfx.playPinPull();
  if (d < 45) sfx.playThrow();
  // AI 拉保险后捏一会儿再扔：手雷落地后 1~2 秒炸，震爆弹接近目标时空爆，烟雾弹落地就冒烟
  const fuse = id === "frag" ? plan.T + 1.0 + Math.random() : (id === "stun" ? plan.T + 0.25 : (id === "smoke" ? plan.T + 0.5 : undefined));
  spawnThrowable(id, plan.origin, plan.vel, bot.name, false, fuse);
  return true;
}

// ---------------------------------------------------------------------------
// 玩家投掷：点 💣 把投掷物拿到手上（枪收起来）→ 按住开火键拉保险（燃烧瓶是点燃），开始倒计时、显示抛物线 →
// 松开开火键扔出，扔完自动切回枪。手雷拉保险后 6 秒爆炸，烟雾弹 / 震爆弹 5 秒（可以捏着等，捏太久会在手里炸），
// 燃烧瓶点燃后不限时、撞到东西就燃。按住期间出现“✕ 取消投掷”：手指拖过去松开、或另一根手指点它，保险插回去不扔
// ---------------------------------------------------------------------------
const THROW_PREVIEW_POINTS = 60;
const throwPreviewLine = new THREE.Line(
  new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(THROW_PREVIEW_POINTS * 3), 3)),
  new THREE.LineBasicMaterial({ color: 0xfff1b0, transparent: true, opacity: 0.85, depthWrite: false })
);
throwPreviewLine.frustumCulled = false;
throwPreviewLine.visible = false;
scene.add(throwPreviewLine);
const throwPreviewRing = new THREE.Mesh(new THREE.RingGeometry(0.35, 0.5, 24), new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
throwPreviewRing.rotation.x = -Math.PI / 2;
throwPreviewRing.visible = false;
scene.add(throwPreviewRing);

// 第一人称：握着投掷物的手（图层 1，和枪模一样最后单独画，贴墙不穿模）；燃烧瓶点燃后瓶口有火苗
const throwHandGroup = new THREE.Group();
const throwHandMesh = new THREE.Mesh(throwableGeo("frag"), lootMergedMat);
throwHandMesh.scale.setScalar(0.8);
const throwGlove = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.075, 0.11), new THREE.MeshLambertMaterial({ color: 0x1f211e }));
throwGlove.position.set(0.012, -0.045, 0.02);
const throwSleeve = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.3), new THREE.MeshLambertMaterial({ color: 0x4b5338 }));
throwSleeve.position.set(0.04, -0.17, 0.1);
throwSleeve.rotation.set(1.05, 0, -0.25);
const throwFlame = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDotTex, color: 0xff9a2a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
throwFlame.position.set(0, 0.165, 0);
throwFlame.visible = false;
throwHandGroup.add(throwHandMesh, throwGlove, throwSleeve, throwFlame);
throwHandGroup.traverse(o => o.layers.set(1));
throwHandGroup.scale.setScalar(0.7);
throwHandGroup.visible = false;
camera.add(throwHandGroup);
const throwHandPose = { aim: 0, raise: 0 };

function throwLaunch(id) {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  const origin = new THREE.Vector3();
  camera.getWorldPosition(origin);
  const start = origin.clone().addScaledVector(dir, 0.45);
  start.y -= 0.12;
  if (isSolidAt(start.x, start.y, start.z, 0.1)) start.copy(origin);
  const vel = dir.multiplyScalar(THROWABLES_DATA[id].speed);
  vel.y += 2.2;
  return { origin: start, vel };
}

// 引信：手雷 / 烟雾弹 / 震爆弹拉保险就开始倒计时，燃烧瓶点燃后不限时
const COOKABLE_THROWS = { frag: true, smoke: true, stun: true };
const throwHudEl = document.getElementById("throw-hud");
const throwHudRing = document.getElementById("throw-hud-ring");
const throwHudTime = document.getElementById("throw-hud-time");
const throwHudName = document.getElementById("throw-hud-name");
const throwHudTip = document.getElementById("throw-hud-tip");
const throwCancelBtn = document.getElementById("btn-throw-cancel");
const THROW_LINE_COLOR = new THREE.Color(0xfff1b0), THROW_DANGER_COLOR = new THREE.Color(0xff4a3a);

function showThrowAimUI(on) {
  throwHudEl.style.display = on ? "flex" : "none";
  throwCancelBtn.style.display = on ? "flex" : "none";
  throwCancelBtn.classList.remove("armed");
  throwHudEl.dataset.key = "";
}

// 拿出 / 收起投掷物（点 💣 或按 G）
function equipThrowable() {
  if (player.phase !== "ground" || player.throwEquipped) return;
  if ((player.throwBag[player.throwSel] || 0) <= 0) {
    const next = THROW_ORDER.find(k => player.throwBag[k] > 0);
    if (!next) { showToast("没有投掷物"); return; }
    player.throwSel = next;
  }
  if (player.isADS) { player.isADS = false; player.reopenADSAfterBolt = false; updateScopeState(); }
  if (player.casting && player.casting.title.includes("💊")) cancelCastProgress();
  player.isFiring = false;
  player.burstRemaining = 0;
  player.throwEquipped = true;
  throwHandMesh.geometry = throwableGeo(player.throwSel);
  throwHandPose.raise = 0;
  throwHandGroup.visible = true;
  sfx.playBoltAction();
  updateAllHUD();
}
function unequipThrowable() {
  if (player.aimingThrow) cancelThrowAim(false);
  if (!player.throwEquipped) return;
  player.throwEquipped = false;
  throwHandGroup.visible = false;
  updateAllHUD();
}
function toggleThrowEquip() {
  if (player.throwEquipped) unequipThrowable(); else equipThrowable();
}

// 按住开火键：拉保险（燃烧瓶：点燃）
function beginThrowAim() {
  if (player.phase !== "ground" || !player.throwEquipped || player.aimingThrow) return;
  if ((player.throwBag[player.throwSel] || 0) <= 0) { unequipThrowable(); return; }
  player.aimingThrow = true;
  player.throwCook = 0;
  showThrowAimUI(true);
  if (player.throwSel === "molotov") sfx.playIgnite(0, 0); else sfx.playPinPull();
  updateAllHUD();
}

// 剩余引信（燃烧瓶不限时）
function throwFuseLeft() {
  return Math.max(0, THROWABLES_DATA[player.throwSel].fuse - player.throwCook);
}

function endThrowAim() {
  player.aimingThrow = false;
  throwPreviewLine.visible = false;
  throwPreviewRing.visible = false;
  showThrowAimUI(false);
}

// 松开开火键：扔出去，然后切回枪
function releaseThrow() {
  if (!player.aimingThrow) return;
  endThrowAim();
  const id = player.throwSel;
  if (player.phase !== "ground" || (player.throwBag[id] || 0) <= 0) return;
  const { origin, vel } = throwLaunch(id);
  player.throwBag[id]--;
  player.lastThrowTime = performance.now();
  sfx.playThrow();
  // 拉过保险的雷出手后只剩剩余引信
  spawnThrowable(id, origin, vel, "你 (Player)", true, COOKABLE_THROWS[id] ? Math.max(0.05, throwFuseLeft()) : undefined);
  if (player.throwBag[id] <= 0) {
    const next = THROW_ORDER.find(k => player.throwBag[k] > 0);
    if (next) player.throwSel = next;
  }
  unequipThrowable();
}

// 不扔出、把保险插回去（点“取消投掷” / 阵亡 / 打开背包时）；投掷物还拿在手上
function cancelThrowAim(byUser) {
  if (!player.aimingThrow) return;
  endThrowAim();
  if (byUser) showToast(player.throwSel === "molotov" ? "已掐灭燃烧瓶" : "已插回保险");
  updateAllHUD();
}

// 捏太久：在自己手里炸开（烟雾弹就在脚下冒烟）
function throwExplodeInHand() {
  const id = player.throwSel;
  endThrowAim();
  player.throwBag[id] = Math.max(0, (player.throwBag[id] || 0) - 1);
  const p = new THREE.Vector3(playerRig.position.x, player.feetY + 0.9, playerRig.position.z);
  spawnThrowable(id, p, new THREE.Vector3(0, 0, 0), "你 (Player)", true, 0);
  showToast(id === "frag" ? "💥 手雷捏太久，在手里炸了！" : (id === "stun" ? "⚡ 震爆弹在手里炸开了！" : "💨 烟雾弹在手里放烟了"));
  unequipThrowable();
}

function cycleThrowable() {
  const owned = THROW_ORDER.filter(k => player.throwBag[k] > 0);
  if (!owned.length) { showToast("没有投掷物"); return; }
  // 拉着保险时换种类：先把保险插回去
  if (player.aimingThrow) cancelThrowAim(false);
  const i = owned.indexOf(player.throwSel);
  player.throwSel = owned[(i + 1) % owned.length];
  if (player.throwEquipped) { throwHandMesh.geometry = throwableGeo(player.throwSel); throwHandPose.raise = 0.4; }
  sfx.playBoltAction();
  updateAllHUD();
}

// 倒计时界面
function updateThrowHud() {
  const id = player.throwSel, data = THROWABLES_DATA[id];
  let time, frac = 1, tip;
  const releaseTip = IS_MOBILE ? "松开开火键投掷 · 拖到 ✕ 取消" : "松开左键投掷 · 右键 / X 取消";
  const danger = COOKABLE_THROWS[id] && throwFuseLeft() < 1.2;
  if (COOKABLE_THROWS[id]) {
    const left = throwFuseLeft();
    time = left.toFixed(1);
    frac = left / data.fuse;
    tip = releaseTip;
  } else {
    time = "🔥";
    tip = "已点燃 · 撞到东西即燃 · " + releaseTip;
  }
  const key = id + "|" + time + "|" + danger;
  if (throwHudEl.dataset.key === key) return;
  throwHudEl.dataset.key = key;
  throwHudTime.innerText = time;
  throwHudName.innerText = `${data.icon} ${data.name}`;
  throwHudTip.innerText = tip;
  throwHudEl.classList.toggle("danger", !!danger);
  const deg = Math.round(frac * 360);
  throwHudRing.style.background = `conic-gradient(${danger ? "#ff3b2f" : "#ffd000"} ${deg}deg, rgba(255,255,255,0.14) ${deg}deg)`;
}

// 手的姿势：拿着时放在右下方，拉保险后举到耳边准备扔；燃烧瓶点燃后火苗跳动
function updateThrowHand(dt, now) {
  if (!throwHandGroup.visible) return;
  const P = throwHandPose;
  P.aim += ((player.aimingThrow ? 1 : 0) - P.aim) * Math.min(1, dt * 10);
  P.raise = Math.min(1, P.raise + dt * 4);
  const r = 1 - (1 - P.raise) * (1 - P.raise), a = P.aim;
  const bob = Math.sin(now * 0.002) * 0.006;
  throwHandGroup.position.set(0.2 + 0.05 * a, -0.2 + 0.08 * a - 0.2 * (1 - r) + bob, -0.55 + 0.04 * a);
  throwHandGroup.rotation.set(0.15 - 0.5 * a, -0.15 * a, 0.08 * a);
  const lit = player.aimingThrow && player.throwSel === "molotov";
  throwFlame.visible = lit;
  if (lit) {
    const f = 0.07 + 0.025 * Math.sin(now * 0.03) + 0.015 * Math.sin(now * 0.071);
    throwFlame.scale.set(f, f * 1.6, 1);
  }
}

// 每帧：手的动画；拉着保险时计时、倒计时界面、抛物线预览（画到第一次落地或空爆的位置）
function updateThrowAim(dt) {
  updateThrowHand(dt, performance.now());
  if (!player.aimingThrow) return;
  const id = player.throwSel;
  if (COOKABLE_THROWS[id]) {
    player.throwCook += dt;
    if (throwFuseLeft() <= 0) { throwExplodeInHand(); return; }
  }
  updateThrowHud();
  const maxT = COOKABLE_THROWS[id] ? throwFuseLeft() : Infinity;
  const { origin, vel } = throwLaunch(id);
  const p = origin.clone(), v = vel.clone();
  const arr = throwPreviewLine.geometry.attributes.position.array;
  let n = 0, stopped = false, simT = 0;
  for (; n < THROW_PREVIEW_POINTS; n++) {
    arr[n * 3] = p.x; arr[n * 3 + 1] = p.y; arr[n * 3 + 2] = p.z;
    if (stopped) continue;
    for (let k = 0; k < 3; k++) {
      simT += 1 / 45;
      if (throwPhysicsStep(p, v, 1 / 45) || simT >= maxT) { stopped = true; break; }
    }
  }
  for (let k = n; k < THROW_PREVIEW_POINTS; k++) { arr[k * 3] = p.x; arr[k * 3 + 1] = p.y; arr[k * 3 + 2] = p.z; }
  throwPreviewLine.geometry.attributes.position.needsUpdate = true;
  const danger = COOKABLE_THROWS[id] && throwFuseLeft() < 1.2;
  throwPreviewLine.material.color.copy(danger ? THROW_DANGER_COLOR : THROW_LINE_COLOR);
  throwPreviewRing.material.color.copy(danger || simT >= maxT ? THROW_DANGER_COLOR : THROW_LINE_COLOR);
  throwPreviewLine.visible = true;
  throwPreviewRing.position.set(p.x, p.y - 0.03, p.z);
  throwPreviewRing.visible = true;
}
