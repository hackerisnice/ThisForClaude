// actors.js：玩家数据、AI 模型与创建、AI 跳伞落点规划
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

// ============================================================================
// 5. 玩家与高智商 AI 系统（真实跳伞开伞、双腿迈步动画、房门寻路、7向触须避障、交火左右走位）
// ============================================================================
const player = {
  phase: "plane",
  hp: 100,
  boost: 0,
  velY: 0,
  kills: 0,
  totalDmg: 0,
  stance: "stand",
  helm: null,
  vest: null,
  bagLv: 0,
  maxCap: 150,
  weapons: [null, null],
  activeSlot: 0,
  ammoBag: { "5.56mm": 0, "7.62mm": 0, "9mm": 0, ".45ACP": 0, "12Gauge": 0, ".50BMG": 0 },
  medBag: { "medkit": 0, "firstaid": 0, "bandage": 2, "adrenaline": 0, "painkiller": 0, "drink": 1 },
  attBag: [],
  isADS: false,
  reopenADSAfterBolt: false,
  isFiring: false,
  burstRemaining: 0,
  consecutiveShots: 0,
  lastShotTime: 0,
  lastFiredAt: -1e9,      // 最近一次开枪时刻（远处 AI 更容易发现正在开枪的人）
  lastFiredSupp: false,
  boltLockedUntil: 0,
  casting: null,
  // 立体移动：脚底高度（站在哪层楼/楼梯/屋顶上）+ 视线高度（随站/蹲/趴平滑过渡）
  feetY: 0,
  eyeH: 1.7,
  stepAccum: 0,
  // 投掷物
  throwBag: { frag: 0, smoke: 0, stun: 0, molotov: 0 },
  throwSel: "frag",
  vault: null,          // 正在翻越（路径与进度）
  throwEquipped: false, // 投掷物拿在手上（枪收起来了）
  aimingThrow: false,   // 已拉保险 / 点燃，松开开火键就扔
  throwCook: 0, // 拔销后已经过去的秒数（捏雷）
  lastThrowTime: 0
};
const STANCE_EYE = { stand: 1.7, crouch: 1.15, prone: 0.45 };

function getUsedBagWeight() {
  let w = 0;
  Object.keys(player.ammoBag).forEach(k => {
    w += (player.ammoBag[k] || 0) * (AMMO_WEIGHT[k] || 0.5);
  });
  Object.keys(player.medBag).forEach(k => {
    w += (player.medBag[k] || 0) * (MEDS_DATA[k]?.weight || 5);
  });
  player.attBag.forEach(a => {
    w += (ATTACHMENTS_DATA[a.id]?.weight || 10);
  });
  Object.keys(player.throwBag).forEach(k => {
    w += (player.throwBag[k] || 0) * THROWABLES_DATA[k].weight;
  });
  return Math.round(w);
}

let yaw = Math.atan2(-flightPath.dx, -flightPath.dz); // 开局视角朝向航线前方
let pitch = -0.25;

const aiPlayers = [];
const aiHitboxes = [];
const bloodParticles = [];

const AI_NAMES = [
  "TGLTN_PC", "Pio_KR", "Shroud_NA", "XDD_Aixleft", "17_Shou", "4AM_GodV", "Inonix_GenG",
  "Loki_Dawa", "Kickstart", "batulinS", "Fuzzface", "Jeemzz", "Kaymind", "ubone", "Mming_NH",
  "ZpYan1", "LongSkr", "Summer_PeRo", "Cui71", "xwudd", "Himan", "Soniqs_hwinn", "Hakatory"
];

// AI 模型共享几何体与材质（49 个 AI 只上传一份，省显存省切换）
const BOT_GEO = {
  leg: new THREE.BoxGeometry(0.26, 0.72, 0.28),
  body: new THREE.BoxGeometry(0.74, 0.92, 0.42),
  head: new THREE.BoxGeometry(0.40, 0.42, 0.40),
  arm: new THREE.BoxGeometry(0.19, 0.64, 0.21),
  boot: new THREE.BoxGeometry(0.28, 0.13, 0.36),
  gun: new THREE.BoxGeometry(0.12, 0.14, 0.68),
  scope: new THREE.BoxGeometry(0.075, 0.085, 0.26),
  vest: new THREE.BoxGeometry(0.8, 0.6, 0.48),
  helmet: new THREE.SphereGeometry(0.255, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55),
  visor: new THREE.BoxGeometry(0.34, 0.07, 0.05),
  pack: new THREE.BoxGeometry(0.5, 0.56, 0.24),
  chute: new THREE.SphereGeometry(2.4, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.48)
};
const BOT_MAT = {
  pants: [0x262b30, 0x3a3f2c, 0x2f3a4a, 0x4a4036].map(c => new THREE.MeshLambertMaterial({ color: c })),
  skin: [0xe0ac69, 0xc68642, 0xf1c27d, 0x8d5524].map(c => new THREE.MeshLambertMaterial({ color: c })),
  gun: new THREE.MeshLambertMaterial({ color: 0x1a1a1a }),
  boot: new THREE.MeshLambertMaterial({ color: 0x1c1a17 }),
  vest: [0x7d8778, 0x4b5638, 0x26282a].map(c => new THREE.MeshLambertMaterial({ color: c })),
  helmet: [0x7d8778, 0x55603f, 0x26282a].map(c => new THREE.MeshLambertMaterial({ color: c })),
  visor: new THREE.MeshLambertMaterial({ color: 0x111316 }),
  pack: new THREE.MeshLambertMaterial({ color: 0x5b4d37 }),
  chute: new THREE.MeshLambertMaterial({ color: 0xffffff, map: chuteTex, side: THREE.DoubleSide })
};

// 士兵模型（AI 与回放里的玩家替身共用）：双腿 / 上半身 / 双臂 / 枪 / 装备 / 降落伞
function buildSoldierModel(shirtColorOverride) {
  const group = new THREE.Group();
  const shirtColor = shirtColorOverride || new THREE.Color().setHSL(Math.random(), 0.45, 0.35);
  const pantsMat = BOT_MAT.pants[Math.floor(Math.random() * BOT_MAT.pants.length)];
  const skinMat = BOT_MAT.skin[Math.floor(Math.random() * BOT_MAT.skin.length)];
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirtColor });

  // 双腿（髋关节为轴心摆动，迈步更自然；腿部网格本身的尺寸与位置与原版一致，用作命中判定）
  const legLPivot = new THREE.Group();
  legLPivot.position.set(-0.18, 0.72, 0);
  const legL = new THREE.Mesh(BOT_GEO.leg, pantsMat);
  legL.position.y = -0.36;
  const legRPivot = new THREE.Group();
  legRPivot.position.set(0.18, 0.72, 0);
  const legR = new THREE.Mesh(BOT_GEO.leg, pantsMat);
  legR.position.y = -0.36;
  const bootL = new THREE.Mesh(BOT_GEO.boot, BOT_MAT.boot);
  bootL.position.set(0, -0.665, 0.03);
  const bootR = new THREE.Mesh(BOT_GEO.boot, BOT_MAT.boot);
  bootR.position.set(0, -0.665, 0.03);
  legLPivot.add(legL, bootL);
  legRPivot.add(legR, bootR);

  // 上半身（以髋部为轴，可前倾/起伏），躯干与头部的世界位置与原版相同
  const upper = new THREE.Group();
  upper.position.y = 0.72;
  const body = new THREE.Mesh(BOT_GEO.body, shirtMat);
  body.position.y = 1.18 - 0.72;
  const head = new THREE.Mesh(BOT_GEO.head, skinMat);
  head.position.y = 1.88 - 0.72;

  // 双臂（肩关节为轴，巡逻摆臂 / 交火举枪）
  const armLPivot = new THREE.Group();
  armLPivot.position.set(-0.47, 1.56 - 0.72, 0);
  armLPivot.rotation.order = "YXZ";
  const armL = new THREE.Mesh(BOT_GEO.arm, shirtMat);
  armL.position.y = -0.3;
  armLPivot.add(armL);
  const armRPivot = new THREE.Group();
  armRPivot.position.set(0.47, 1.56 - 0.72, 0);
  armRPivot.rotation.order = "YXZ";
  const armR = new THREE.Mesh(BOT_GEO.arm, shirtMat);
  armR.position.y = -0.3;
  armRPivot.add(armR);

  // 手持枪模（原版枪模位于身体背后，这里修正到正前方双手位置）
  const botGunMesh = new THREE.Mesh(BOT_GEO.gun, BOT_MAT.gun);
  botGunMesh.position.set(0.16, 0.45, 0.3);
  botGunMesh.visible = false;
  // 枪上的倍镜（装了倍镜才显示），开镜时贴在眼前
  const scopeMesh = new THREE.Mesh(BOT_GEO.scope, BOT_MAT.visor);
  scopeMesh.position.set(0, 0.115, 0.02);
  scopeMesh.visible = false;
  botGunMesh.add(scopeMesh);

  // 装备外观（纯视觉）：防弹衣（捡到枪后出现）、头盔、护目镜、背包
  const vestMesh = new THREE.Mesh(BOT_GEO.vest, BOT_MAT.vest[0]);
  vestMesh.position.y = 1.24 - 0.72;
  vestMesh.visible = false;
  const visor = new THREE.Mesh(BOT_GEO.visor, BOT_MAT.visor);
  visor.position.set(0, 1.93 - 0.72, 0.205);
  const pack = new THREE.Mesh(BOT_GEO.pack, BOT_MAT.pack);
  pack.position.set(0, 1.2 - 0.72, -0.33);
  // 头盔 / 背包按 AI 实际捡到的装备等级显示
  const helmetMesh = new THREE.Mesh(BOT_GEO.helmet, BOT_MAT.helmet[0]);
  helmetMesh.position.y = 2.0 - 0.72;
  helmetMesh.scale.set(1.2, 1.1, 1.2);
  helmetMesh.visible = false;
  pack.visible = false;
  upper.add(body, head, armLPivot, armRPivot, botGunMesh, vestMesh, visor, pack, helmetMesh);
  const detailMeshes = [bootL, bootR, visor];

  // 专属空降降落伞模型（跳伞开伞阶段显示）
  const chuteMesh = new THREE.Mesh(BOT_GEO.chute, BOT_MAT.chute);
  chuteMesh.position.y = 3.2;
  chuteMesh.visible = false;

  group.add(legLPivot, legRPivot, upper, chuteMesh);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  chuteMesh.castShadow = false;
  group.visible = false;
  scene.add(group);
  return { group, legL, legR, body, head, botGunMesh, scopeMesh, chuteMesh, legLPivot, legRPivot, upper, armLPivot, armRPivot, vestMesh, helmetMesh, pack, detailMeshes };
}

function createAIBot(id) {
  const { group, legL, legR, body, head, botGunMesh, scopeMesh, chuteMesh, legLPivot, legRPivot, upper, armLPivot, armRPivot, vestMesh, helmetMesh, pack, detailMeshes } = buildSoldierModel();

  // 跳伞规划：按本局航线挑一个够得着的落点（城镇/学校/遗迹/农场/野外），并在飞机最接近落点时跳下
  const plan = planBotLanding();
  const landTarget = new THREE.Vector3(plan.x, 0, plan.z);

  const bot = {
    id,
    name: (AI_NAMES[id % AI_NAMES.length] || "Survivor") + "_" + (10 + id),
    group, legL, legR, body, head, botGunMesh, scopeMesh, chuteMesh,
    legLPivot, legRPivot, upper, armLPivot, armRPivot, vestMesh, helmetMesh, packMesh: pack, detailMeshes, detailShown: true,
    phase: "plane", // plane -> sky -> chute -> ground
    hp: 100,
    dropS: plan.dropS,
    landedAt: Infinity,
    // AI 背包：两把主武器（各自配件与弹匣）、头盔/防弹衣/背包等级、药品数量
    weapons: [null, null],
    activeSlot: 0,
    weaponAtts: [{}, {}],
    mags: [0, 0],
    helmLv: 0, vestLv: 0, bagLv: 0,
    meds: 0,
    lootTarget: null,
    lootTargetSince: 0,
    nextLootScan: 0,
    reloadUntil: 0,
    swapUntil: 0,
    nextWeaponEval: 0,
    healUntil: 0,
    nades: { frag: 0, smoke: 0, stun: 0, molotov: 0 }, // 投掷物
    nextGrenadeTime: 0,
    throwAnimUntil: 0,
    pushUntil: 0,      // 闪完冲楼
    lkp: null,         // 最后一次看到 / 听到玩家的位置
    foe: null,         // 正在对枪的另一个 AI
    stunnedUntil: 0,
    fleeX: 0, fleeZ: 0, fleeUntil: 0,
    stepAccum: 0,
    // 抢空投：贪心程度（0~1）与当前目标
    greed: Math.random(),
    airdropTarget: null,
    nextAirdropCheck: 0,
    // 开镜瞄准：开镜进度、瞄准稳定度、枪口俯仰角
    adsBlend: 0,
    aimSettle: 0,
    aimPitch: 0,
    foeUntil: 0, foeY: 0, foeDist: 30,
    // 枪法：打移动目标给提前量的准确度、远距离抬枪补下坠的准确度（每个 AI 不一样）
    leadSkill: 0.55 + Math.random() * 0.45,
    dropSkill: 0.85 + Math.random() * 0.2,
    // 性格：好斗（主动搜人）、爱蹲点（阴人）、爱架狙（找高楼窗口远距离狙）
    aggr: Math.random(),
    camper: Math.random(),
    sniperPref: 0.3 + Math.random() * 0.7,
    // 战术状态：hunt 搜猎 / ambush 阴人 / overwatch 架点狙击
    tactic: null, tacticSince: 0, tacticUntil: 0, nextTacticEval: 0, tacticInfoT: -1e9,
    huntIgnoreT: -1, huntSearchUntil: 0, huntSearchPt: null, huntSearchNext: 0, flankSide: 1, nextIntelT: 0,
    huntFlankPt: null, huntFlankNext: 0, huntNear: false,
    ambushYaw: 0, owSpot: null, owAt: false, nextOverwatchTry: 0, nextCampTry: 0,
    // 远距离发现：发现进度（0~1，到 1 才算看见）、远距离视线检测缓存
    spot: 0, farLOS: false, nextFarLOS: 0,
    // 蹲下（阴人 / 打药 / 远距离架枪时）；standUntil 内强制站起来探头
    crouchWant: false, crouchBlend: 0, standUntil: 0,
    landTarget,
    weaponKey: null,
    targetPos: new THREE.Vector3(0, 0, 0),
    moveHeading: Math.random() * Math.PI * 2,
    walkCycle: Math.random() * 10,
    stuckTime: 0,
    strafeDir: Math.random() < 0.5 ? 1 : -1,
    nextStrafeFlip: 0,
    alertUntil: 0,
    lastFireTime: 0,
    lastStepTime: 0,
    alive: true,
    // 拟人化移动状态：当前朝向/速度带惯性，个体性格（速度、走位距离偏好、蛇形摆动频率）各不相同
    curHeading: 0,
    curSpeed: 0,
    speedMul: 0.93 + Math.random() * 0.14,
    rangeBias: (Math.random() - 0.5) * 16,
    wanderPhase: Math.random() * Math.PI * 2,
    wanderFreq: 0.35 + Math.random() * 0.5,
    wanderAmp: 0,
    pauseUntil: 0,
    strafePauseUntil: 0,
    faceHintYaw: 0,
    faceHintUntil: 0,
    aimBlend: 0
  };
  bot.curHeading = bot.moveHeading;
  body.userData = { isAI: true, isHead: false, bot };
  head.userData = { isAI: true, isHead: true, bot };
  legL.userData = { isAI: true, isHead: false, bot };
  legR.userData = { isAI: true, isHead: false, bot };
  aiHitboxes.push(body, head, legL, legR);
  aiPlayers.push(bot);
}

// AI 跳伞落点规划：只考虑离航线 ≤ 520 米（开伞滑翔够得着）的地点，按热度加权随机。
// 每个地点有人数上限（按楼栋数），每栋楼最多分给一个 AI，落在门外；热门点满了就去别的点或野外
// → 不再几十个 AI 挤进同一个城、同一扇门。跳伞时机 = 飞机飞到落点在航线上投影附近的位置
const BOT_GLIDE_REACH = 520;
const botLandingUse = { perPoi: {}, usedBuildings: new Set() };
function poiLandingCap(p) {
  if (p.key.startsWith("farm")) return 2;
  if (p.key === "ruins") return 4;
  if (p.key === "school") return 6;
  return Math.min(13, Math.max(3, Math.round(p.buildings.length * 0.3)));
}
function planBotLanding() {
  const fp = flightPath;
  const cands = [];
  POIS.forEach(p => {
    const s = (p.x - fp.sx) * fp.dx + (p.z - fp.sz) * fp.dz;
    const perp = Math.abs((p.x - fp.sx) * -fp.dz + (p.z - fp.sz) * fp.dx);
    if ((botLandingUse.perPoi[p.key] || 0) >= poiLandingCap(p)) return;
    if (s > 60 && s < fp.len - 30 && perp < BOT_GLIDE_REACH) cands.push({ p, s, w: p.weight * (1.15 - perp / BOT_GLIDE_REACH * 0.6) });
  });
  let x, z, s;
  if (cands.length && Math.random() < 0.85) {
    let total = 0;
    cands.forEach(c => { total += c.w; });
    let r = Math.random() * total;
    const c = cands.find(c2 => (r -= c2.w) <= 0) || cands[cands.length - 1];
    botLandingUse.perPoi[c.p.key] = (botLandingUse.perPoi[c.p.key] || 0) + 1;
    const free = c.p.buildings.filter(b => !botLandingUse.usedBuildings.has(b));
    if (free.length) {
      const b = free[Math.floor(Math.random() * free.length)];
      botLandingUse.usedBuildings.add(b);
      const door = Math.random() < 0.5 ? b.northDoor : b.southDoor;
      const out = Math.sign(door.z - b.cz) || 1;
      x = door.x + (Math.random() - 0.5) * 6; z = door.z + out * (2 + Math.random() * 3);
    } else {
      const a = Math.random() * Math.PI * 2, rr = c.p.r * (0.3 + Math.random() * 0.5);
      x = c.p.x + Math.cos(a) * rr; z = c.p.z + Math.sin(a) * rr;
    }
    s = c.s;
  } else {
    // 少数 AI 落野外：航线附近随机一点
    s = 100 + Math.random() * Math.max(10, fp.len - 200);
    const side = (Math.random() - 0.5) * 2 * BOT_GLIDE_REACH * 0.8;
    x = fp.sx + fp.dx * s - fp.dz * side; z = fp.sz + fp.dz * s + fp.dx * side;
  }
  x = Math.max(-MAP_LIMIT + 20, Math.min(MAP_LIMIT - 20, x));
  z = Math.max(-MAP_LIMIT + 20, Math.min(MAP_LIMIT - 20, z));
  return { x, z, dropS: Math.min(fp.len - 40, Math.max(70, s - 60 + Math.random() * 110)) };
}

for (let i = 0; i < 49; i++) createAIBot(i);
