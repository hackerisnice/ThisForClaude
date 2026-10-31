// difficulty.js：AI 难度（主菜单里选）。
// 枪法：三档都是同一套“像真人一样瞄准”的模型（见 botaim.js），没有命中率系数 —— 难度低就是把反应、手速、
// 手抖、压枪、估提前量这些“人的水平”换成更差的玩家；
// 策略：难度低的 AI 少用（或不用）阴人、搜猎包抄、架狙、投掷物，发现人更慢、听力更差，交火时走位更呆
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const AI_DIFFICULTY = {
  easy: {
    name: "简单",
    // 枪法倍率（乘在每个 AI 自己的水平上）：反应 / 视觉延迟更长，脑补少，手慢，准星放不准，手抖，压枪差，估距离差
    aim: { reactMs: 1.7, perceptLag: 1.45, anticipation: 0.45, aimOmega: 0.68, maxTurn: 0.68, aimPrecision: 2.0, tremor: 1.9,
      recoilControl: 0.55, sprayReactMs: 1.8, rangeErr: 2.3, triggerDiscipline: 1.2, leadSkill: 0.78 },
    spot: 0.5,        // 发现远处的人有多快
    sight: 0.75,      // 能看多远
    tactics: 0,       // 阴人 / 搜猎 / 架狙 / 决赛圈找人：不用
    throws: 0,        // 投掷物：不用
    strafe: 0.25,     // 交火走位：基本站着打
    hear: 0.6,        // 听到枪声的距离
    steps: false,     // 不会听脚步
    weaponSwitch: false, // 不会按距离换枪
    volley: 0.7       // AI 互殴的命中（和打玩家的枪法保持一致）
  },
  normal: {
    name: "普通",
    aim: { reactMs: 1.35, perceptLag: 1.25, anticipation: 0.7, aimOmega: 0.82, maxTurn: 0.82, aimPrecision: 1.6, tremor: 1.5,
      recoilControl: 0.72, sprayReactMs: 1.4, rangeErr: 1.6, triggerDiscipline: 1.1, leadSkill: 0.88 },
    spot: 0.75, sight: 0.9, tactics: 0.45, throws: 0.45, strafe: 0.6, hear: 0.85, steps: true, weaponSwitch: true, volley: 0.85
  },
  hard: {
    name: "困难",
    aim: {},
    spot: 1, sight: 1, tactics: 1, throws: 1, strafe: 1, hear: 1, steps: true, weaponSwitch: true, volley: 1
  }
};
let AI_DIFF = AI_DIFFICULTY.hard;
let aiDifficultyKey = "hard";

// 开局时调用：按难度换算每个 AI 的枪法（基础水平在生成 AI 时随机好了，存在 bot.aimBase 里）
function applyAIDifficulty(key) {
  aiDifficultyKey = AI_DIFFICULTY[key] ? key : "hard";
  AI_DIFF = AI_DIFFICULTY[aiDifficultyKey];
  aiPlayers.forEach(bot => {
    const base = bot.aimBase;
    if (!base) return;
    for (const k in base) bot[k] = base[k] * (AI_DIFF.aim[k] || 1);
    bot.recoilControl = Math.min(0.9, bot.recoilControl);
    bot.anticipation = Math.min(0.95, bot.anticipation);
  });
}
