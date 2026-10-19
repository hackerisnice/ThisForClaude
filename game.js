function showToast(msg) {
  const el = document.getElementById("toast-msg");
  el.innerText = msg;
  el.style.opacity = 1;
  clearTimeout(el._t);
  el._t = setTimeout(() => { el.style.opacity = 0; }, 1600);
}

// ============================================================================
// 0. 设置：画质档位 / 视角灵敏度 / 按键外观（自动记忆到本机）
// ============================================================================
const IS_MOBILE = /Android|iPhone|iPad|iPod|Mobile|HarmonyOS/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && Math.min(window.innerWidth, window.innerHeight) < 900);

const gameSettings = { quality: "auto", lookSens: 1.0, adsSens: 1.0, btnScale: 1.0, btnOpacity: 0.74 };
try {
  const saved = JSON.parse(localStorage.getItem("pubg_lite_settings") || "{}");
  if (["auto", "low", "mid", "high"].includes(saved.quality)) gameSettings.quality = saved.quality;
  ["lookSens", "adsSens", "btnScale", "btnOpacity"].forEach(k => {
    if (typeof saved[k] === "number" && isFinite(saved[k])) gameSettings[k] = saved[k];
  });
} catch (e) { /* 隐私模式或存储被禁用时使用默认值 */ }

function saveGameSettings() {
  try { localStorage.setItem("pubg_lite_settings", JSON.stringify(gameSettings)); } catch (e) {}
}

function syncSettingsUI() {
  document.documentElement.style.setProperty("--btn-scale", gameSettings.btnScale);
  document.documentElement.style.setProperty("--btn-opacity", gameSettings.btnOpacity);
  document.getElementById("rng-btn-scale").value = gameSettings.btnScale;
  document.getElementById("rng-btn-op").value = gameSettings.btnOpacity;
  document.getElementById("rng-look-sens").value = gameSettings.lookSens;
  document.getElementById("rng-ads-sens").value = gameSettings.adsSens;
  document.getElementById("val-look-sens").innerText = gameSettings.lookSens.toFixed(2);
  document.getElementById("val-ads-sens").innerText = gameSettings.adsSens.toFixed(2);
  document.getElementById("sel-quality").value = gameSettings.quality;
}

document.getElementById("btn-ui-cfg").addEventListener("click", () => {
  const p = document.getElementById("ui-cfg-panel");
  p.style.display = p.style.display === "block" ? "none" : "block";
});
document.getElementById("btn-close-cfg").addEventListener("click", () => {
  document.getElementById("ui-cfg-panel").style.display = "none";
});
document.getElementById("rng-btn-scale").addEventListener("input", e => {
  document.documentElement.style.setProperty("--btn-scale", e.target.value);
  gameSettings.btnScale = parseFloat(e.target.value);
  saveGameSettings();
});
document.getElementById("rng-btn-op").addEventListener("input", e => {
  document.documentElement.style.setProperty("--btn-opacity", e.target.value);
  gameSettings.btnOpacity = parseFloat(e.target.value);
  saveGameSettings();
});
document.getElementById("rng-look-sens").addEventListener("input", e => {
  gameSettings.lookSens = parseFloat(e.target.value);
  document.getElementById("val-look-sens").innerText = gameSettings.lookSens.toFixed(2);
  saveGameSettings();
});
document.getElementById("rng-ads-sens").addEventListener("input", e => {
  gameSettings.adsSens = parseFloat(e.target.value);
  document.getElementById("val-ads-sens").innerText = gameSettings.adsSens.toFixed(2);
  saveGameSettings();
});
document.getElementById("sel-quality").addEventListener("change", e => {
  gameSettings.quality = e.target.value;
  saveGameSettings();
  applyQualityTier(gameSettings.quality === "auto" ? defaultAutoTier() : gameSettings.quality, false);
  showToast(`画质已切换为：${e.target.options[e.target.selectedIndex].text}`);
});
syncSettingsUI();

// ============================================================================
// 1. 武器库、配件与真实负重表
// ============================================================================
const AMMO_WEIGHT = { "5.56mm": 0.5, "7.62mm": 0.7, "9mm": 0.35, ".45ACP": 0.4, "12Gauge": 1.2, ".50BMG": 2.0 };

const WEAPONS_DATA = {
  "beryl": { id: "beryl", name: "Beryl M762", type: "AR", ironType: "ak", ammoType: "7.62mm", rpm: 700, dmg: 46, mag: 30, ext: 40, vRec: 1.48, hRec: 0.68, firstMult: 2.15, modes: ["auto", "burst", "single"], slots: ["scope", "muzzle", "grip", "mag"], color: 0x222224 },
  "m416":  { id: "m416", name: "M416", type: "AR", ironType: "ar_ring", ammoType: "5.56mm", rpm: 700, dmg: 41, mag: 30, ext: 40, vRec: 1.05, hRec: 0.48, firstMult: 1.72, modes: ["auto", "single"], slots: ["scope", "muzzle", "grip", "mag", "stock"], color: 0x2c2f33 },
  "akm":   { id: "akm", name: "AKM", type: "AR", ironType: "ak", ammoType: "7.62mm", rpm: 600, dmg: 48, mag: 30, ext: 40, vRec: 1.38, hRec: 0.64, firstMult: 2.00, modes: ["auto", "single"], slots: ["scope", "muzzle", "mag"], color: 0x6e472b },
  "aug":   { id: "aug", name: "AUG A3", type: "AR", ironType: "ar_ring", ammoType: "5.56mm", rpm: 750, dmg: 43, mag: 30, ext: 40, vRec: 0.96, hRec: 0.42, firstMult: 1.55, modes: ["auto", "single"], slots: ["scope", "muzzle", "grip", "mag"], color: 0x4d5d43, airdropOnly: true },
  "scar":  { id: "scar", name: "SCAR-L", type: "AR", ironType: "scar", ammoType: "5.56mm", rpm: 650, dmg: 42, mag: 30, ext: 40, vRec: 0.94, hRec: 0.43, firstMult: 1.60, modes: ["auto", "single"], slots: ["scope", "muzzle", "grip", "mag"], color: 0xa89267 },
  "m16a4": { id: "m16a4", name: "M16A4", type: "AR", ironType: "ar_ring", ammoType: "5.56mm", rpm: 800, dmg: 43, mag: 30, ext: 40, vRec: 1.12, hRec: 0.45, firstMult: 1.60, modes: ["burst", "single"], slots: ["scope", "muzzle", "mag", "stock"], color: 0x1c1e21 },
  "mk47":  { id: "mk47", name: "MK47", type: "AR", ironType: "ar_ring", ammoType: "7.62mm", rpm: 650, dmg: 49, mag: 20, ext: 30, vRec: 1.38, hRec: 0.52, firstMult: 1.80, modes: ["burst", "single"], slots: ["scope", "muzzle", "grip", "mag", "stock"], color: 0x333333 },

  "ump45":  { id: "ump45", name: "UMP45", type: "SMG", ironType: "smg", ammoType: ".45ACP", rpm: 670, dmg: 41, mag: 25, ext: 35, vRec: 0.72, hRec: 0.34, firstMult: 1.35, modes: ["auto", "burst", "single"], slots: ["scope", "muzzle", "grip", "mag"], color: 0x222528 },
  "vector": { id: "vector", name: "Vector", type: "SMG", ironType: "smg", ammoType: "9mm", rpm: 1100, dmg: 31, mag: 19, ext: 33, vRec: 0.82, hRec: 0.42, firstMult: 1.45, modes: ["auto", "burst", "single"], slots: ["scope", "muzzle", "grip", "mag", "stock"], color: 0x3b3834 },
  "uzi":    { id: "uzi", name: "UZI", type: "SMG", ironType: "smg", ammoType: "9mm", rpm: 1250, dmg: 26, mag: 25, ext: 35, vRec: 0.85, hRec: 0.44, firstMult: 1.45, modes: ["auto", "single"], slots: ["scope", "muzzle", "mag", "stock"], color: 0x1f1f1f },
  "mp5k":   { id: "mp5k", name: "MP5K", type: "SMG", ironType: "smg", ammoType: "9mm", rpm: 900, dmg: 33, mag: 30, ext: 40, vRec: 0.76, hRec: 0.38, firstMult: 1.38, modes: ["auto", "burst", "single"], slots: ["scope", "muzzle", "grip", "mag", "stock"], color: 0x1d2124 },

  "s1897": { id: "s1897", name: "S1897 霰弹", type: "SG", ironType: "sg_bead", ammoType: "12Gauge", rpm: 75, isBoltAction: true, boltTime: 0.72, pellets: 9, dmgPerPellet: 26, spreadX: 0.068, spreadY: 0.068, mag: 5, ext: 5, vRec: 2.60, hRec: 0.65, firstMult: 1.5, modes: ["single"], slots: ["sg_muzzle", "loops"], color: 0x5c3c24 },
  "s686":  { id: "s686", name: "S686 双管", type: "SG", ironType: "sg_bead", ammoType: "12Gauge", rpm: 300, pellets: 9, dmgPerPellet: 26, spreadX: 0.062, spreadY: 0.062, mag: 2, ext: 2, vRec: 2.75, hRec: 0.70, firstMult: 1.6, modes: ["single"], slots: ["sg_muzzle", "loops"], color: 0x6b4423 },
  "s12k":  { id: "s12k", name: "S12K 连喷", type: "SG", ironType: "ak", ammoType: "12Gauge", rpm: 240, pellets: 9, dmgPerPellet: 24, spreadX: 0.075, spreadY: 0.075, mag: 5, ext: 10, vRec: 2.85, hRec: 0.85, firstMult: 1.8, modes: ["single"], slots: ["scope", "sg_muzzle", "mag"], color: 0x26282a },
  "dbs":   { id: "dbs", name: "DBS 霰弹", type: "SG", ironType: "ar_ring", ammoType: "12Gauge", rpm: 220, pellets: 9, dmgPerPellet: 26, spreadX: 0.052, spreadY: 0.052, mag: 14, ext: 14, vRec: 2.40, hRec: 0.60, firstMult: 1.5, modes: ["single"], slots: ["scope"], color: 0x353839 },

  "slr":      { id: "slr", name: "SLR 大炮", type: "DMR", ironType: "sr", ammoType: "7.62mm", rpm: 450, dmg: 56, mag: 10, ext: 20, vRec: 2.05, hRec: 0.72, firstMult: 2.05, modes: ["single"], slots: ["scope", "muzzle", "mag", "stock"], color: 0x252525 },
  "sks":      { id: "sks", name: "SKS", type: "DMR", ironType: "ak", ammoType: "7.62mm", rpm: 500, dmg: 53, mag: 10, ext: 20, vRec: 1.72, hRec: 0.65, firstMult: 1.85, modes: ["single"], slots: ["scope", "muzzle", "grip", "mag", "stock"], color: 0x6e5233 },
  "mini14":   { id: "mini14", name: "Mini14", type: "DMR", ironType: "ar_ring", ammoType: "5.56mm", rpm: 550, dmg: 48, mag: 20, ext: 30, vRec: 1.32, hRec: 0.45, firstMult: 1.55, modes: ["single"], slots: ["scope", "muzzle", "mag"], color: 0x3b3f42 },
  "dragunov": { id: "dragunov", name: "德拉贡诺夫", type: "DMR", ironType: "ak", ammoType: "7.62mm", rpm: 180, dmg: 60, mag: 10, ext: 20, vRec: 2.55, hRec: 0.85, firstMult: 2.30, modes: ["single"], slots: ["scope", "muzzle", "mag", "stock"], color: 0x5c3e26 },
  "mk14":     { id: "mk14", name: "MK14 EBR", type: "DMR", ironType: "ar_ring", ammoType: "7.62mm", rpm: 670, dmg: 61, mag: 10, ext: 20, vRec: 2.15, hRec: 0.85, firstMult: 2.25, modes: ["auto", "single"], slots: ["scope", "muzzle", "mag", "stock"], color: 0x434648, airdropOnly: true },

  "kar98k": { id: "kar98k", name: "Kar98k", type: "SR", ironType: "sr", ammoType: "7.62mm", rpm: 38, isBoltAction: true, boltTime: 1.25, dmg: 79, mag: 5, ext: 5, vRec: 2.60, hRec: 0.50, firstMult: 1.4, modes: ["bolt"], slots: ["scope", "muzzle", "loops"], color: 0x6b4423 },
  "m24":    { id: "m24", name: "M24", type: "SR", ironType: "sr", ammoType: "7.62mm", rpm: 40, isBoltAction: true, boltTime: 1.18, dmg: 75, mag: 5, ext: 7, vRec: 2.45, hRec: 0.48, firstMult: 1.4, modes: ["bolt"], slots: ["scope", "muzzle", "mag", "stock"], color: 0x262626 },
  "awm":    { id: "awm", name: "AWM", type: "SR", ironType: "sr", ammoType: "7.62mm", rpm: 35, isBoltAction: true, boltTime: 1.35, dmg: 105, mag: 5, ext: 7, vRec: 2.90, hRec: 0.55, firstMult: 1.5, modes: ["bolt"], slots: ["scope", "muzzle", "mag", "stock"], color: 0x3b533a, airdropOnly: true },
  "amr":    { id: "amr", name: "Lynx AMR", type: "SR", ironType: "sr", ammoType: ".50BMG", rpm: 85, isBoltAction: false, dmg: 118, mag: 10, ext: 10, vRec: 2.75, hRec: 0.45, firstMult: 1.45, modes: ["single"], slots: ["scope"], color: 0x8b7d6b, airdropOnly: true },

  "dp28": { id: "dp28", name: "DP-28", type: "LMG", ironType: "ak", ammoType: "7.62mm", rpm: 550, dmg: 52, mag: 47, ext: 47, vRec: 1.25, hRec: 0.52, firstMult: 1.75, modes: ["auto"], slots: ["scope"], color: 0x4a3828 },
  "m249": { id: "m249", name: "M249", type: "LMG", ironType: "ar_ring", ammoType: "5.56mm", rpm: 800, dmg: 41, mag: 75, ext: 150, vRec: 1.32, hRec: 0.64, firstMult: 1.90, modes: ["auto"], slots: ["scope", "mag", "stock"], color: 0x2b2f33, airdropOnly: true }
};

const ATTACHMENTS_DATA = {
  "reddot": { id: "reddot", name: "红点瞄准镜", slot: "scope", fov: 55, zoom: 1.35, weight: 10 },
  "holo":   { id: "holo", name: "全息瞄准镜", slot: "scope", fov: 55, zoom: 1.35, weight: 10 },
  "2x":     { id: "2x", name: "2倍瞄准镜", slot: "scope", fov: 40, zoom: 2.0, weight: 12 },
  "3x":     { id: "3x", name: "3倍瞄准镜", slot: "scope", fov: 26, zoom: 3.0, weight: 14 },
  "4x":     { id: "4x", name: "4倍镜 ACOG", slot: "scope", fov: 19, zoom: 4.0, weight: 15 },
  "6x":     { id: "6x", name: "6倍瞄准镜", slot: "scope", fov: 13, zoom: 6.0, weight: 18 },
  "8x":     { id: "8x", name: "8倍镜 CQBSS", slot: "scope", fov: 9.5, zoom: 8.0, weight: 20 },

  "comp":  { id: "comp", name: "枪口补偿器 (-25%垂直)", slot: "muzzle", vMult: 0.75, hMult: 0.80, weight: 10 },
  "brake": { id: "brake", name: "枪口制退器 (-15%后坐)", slot: "muzzle", vMult: 0.85, hMult: 0.85, weight: 10 },
  "flash": { id: "flash", name: "消焰器 (-10%后坐)", slot: "muzzle", vMult: 0.90, hMult: 0.90, weight: 8 },
  "supp":  { id: "supp", name: "消音器 (消音隐蔽)", slot: "muzzle", vMult: 0.98, hMult: 0.98, isSupp: true, weight: 15 },

  "duckbill": { id: "duckbill", name: "鸭嘴枪口 (横向扩散)", slot: "sg_muzzle", spreadXMult: 1.35, spreadYMult: 0.32, weight: 10 },
  "choke":    { id: "choke", name: "扼流圈 (散射缩小35%)", slot: "sg_muzzle", spreadXMult: 0.65, spreadYMult: 0.65, weight: 10 },

  "vert":   { id: "vert", name: "垂直握把 (-18%垂直)", slot: "grip", vMult: 0.82, hMult: 1.0, firstMult: 0.80, weight: 10 },
  "angled": { id: "angled", name: "直角握把 (-22%水平)", slot: "grip", vMult: 1.0, hMult: 0.78, firstMult: 1.0, weight: 10 },
  "half":   { id: "half", name: "半截式握把 (-10%后坐)", slot: "grip", vMult: 0.90, hMult: 0.90, firstMult: 1.1, weight: 10 },
  "light":  { id: "light", name: "轻型握把 (-30%首发)", slot: "grip", vMult: 0.95, hMult: 0.95, firstMult: 0.70, weight: 10 },
  "thumb":  { id: "thumb", name: "拇指握把 (-8%垂直)", slot: "grip", vMult: 0.92, hMult: 1.0, firstMult: 0.95, weight: 10 },

  "ext_mag": { id: "ext_mag", name: "快速扩容弹匣", slot: "mag", isExt: true, reloadMult: 0.70, weight: 14 },

  "tac_stock":  { id: "tac_stock", name: "战术枪托 (-12%后坐)", slot: "stock", vMult: 0.88, hMult: 0.88, weight: 12 },
  "bump_stock": { id: "bump_stock", name: "撞火枪托 (全自动高射速)", slot: "stock", vMult: 1.12, hMult: 1.15, forceAuto: true, rpmMult: 1.18, weight: 14 },

  "bullet_loops": { id: "bullet_loops", name: "子弹袋 (-35%装填/拉栓)", slot: "loops", reloadMult: 0.65, weight: 10 }
};

const MEDS_DATA = {
  "medkit":     { id: "medkit", name: "医疗箱", castTime: 6.0, healTo: 100, boostAdd: 0, weight: 20 },
  "firstaid":   { id: "firstaid", name: "急救包", castTime: 4.5, healTo: 75, boostAdd: 0, weight: 10 },
  "bandage":    { id: "bandage", name: "绷带", castTime: 2.5, healAdd: 15, maxCap: 75, boostAdd: 0, weight: 2 },
  "adrenaline": { id: "adrenaline", name: "肾上腺素", castTime: 4.5, healTo: 0, boostAdd: 100, weight: 20 },
  "painkiller": { id: "painkiller", name: "止痛药", castTime: 4.0, healTo: 0, boostAdd: 60, weight: 10 },
  "drink":      { id: "drink", name: "能量饮料", castTime: 2.8, healTo: 0, boostAdd: 40, weight: 4 }
};

// ============================================================================
// 2. 声纹雷达与音效系统
// ============================================================================
const radarSoundMarkers = [];

function registerRadarSound(type, wx, wz, isSuppressed = false) {
  if (player.phase !== "ground") return;
  const dist = Math.hypot(wx - playerRig.position.x, wz - playerRig.position.z);
  const maxHearDist = type === "shot" ? (isSuppressed ? 85 : 220) : 38;
  if (dist > maxHearDist) return;
  radarSoundMarkers.push({
    type, x: wx, z: wz, born: performance.now(),
    maxAge: type === "shot" ? 1300 : 650
  });
}

class SoundEngine {
  constructor() { this.ctx = null; }
  init() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  playShot(isSuppressed, weight = 1.0, dist = 0) {
    this.init();
    const volScale = Math.max(0, 1 - dist / 240);
    if (volScale <= 0.02) return;
    const now = this.ctx.currentTime;
    const dur = isSuppressed ? 0.065 : 0.13;
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * dur, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * (isSuppressed ? 0.016 : 0.035)));
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = isSuppressed ? "bandpass" : "lowpass";
    filter.frequency.setValueAtTime(isSuppressed ? 1050 : (1700 / weight), now);
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime((isSuppressed ? 0.25 : 0.65) * volScale, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + dur);
    src.connect(filter); filter.connect(gain); gain.connect(this.ctx.destination);
    src.start(now);
  }
  playFootstep(dist = 0) {
    this.init();
    const vol = Math.max(0, (1 - dist / 38) * 0.22);
    if (vol <= 0.01) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(48, now + 0.055);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.005, now + 0.06);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.06);
  }
  playBoltAction() {
    this.init();
    const now = this.ctx.currentTime;
    [0.14, 0.42].forEach((offset, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(idx === 0 ? 520 : 680, now + offset);
      osc.frequency.exponentialRampToValueAtTime(180, now + offset + 0.09);
      gain.gain.setValueAtTime(0.24, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.09);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(now + offset); osc.stop(now + offset + 0.09);
    });
  }
  playHit(isHeadshot) {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = isHeadshot ? "triangle" : "sine";
    osc.frequency.setValueAtTime(isHeadshot ? 1650 : 380, now);
    if (isHeadshot) osc.frequency.exponentialRampToValueAtTime(2450, now + 0.08);
    gain.gain.setValueAtTime(0.42, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.09);
    osc.connect(gain); gain.connect(this.ctx.destination);
    osc.start(now); osc.stop(now + 0.09);
  }
  playKillConfirm() {
    this.init();
    const now = this.ctx.currentTime;
    [520, 780, 1040].forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.3, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.01, now + idx * 0.06 + 0.14);
      osc.connect(gain); gain.connect(this.ctx.destination);
      osc.start(now + idx * 0.06); osc.stop(now + idx * 0.06 + 0.14);
    });
  }
}
const sfx = new SoundEngine();

// ============================================================================
// 3. 场景、碰撞与 7向触须智能避障寻路引擎
// ============================================================================
const container = document.getElementById("canvas-container");
const scene = new THREE.Scene();
// 场景根节点永不移动：关闭其矩阵自动更新，静态物体冻结矩阵后每帧可省掉上千次矩阵运算
scene.matrixAutoUpdate = false;

// 天空 / 雾色统一取地平线颜色，远景与天空无缝融合
const SKY_TOP_COLOR = new THREE.Color(0x3f7cc8);
const SKY_HORIZON_COLOR = new THREE.Color(0xc3d5e3);
const SKY_BELOW_COLOR = new THREE.Color(0xb6c8d4); // 地平线以下接近雾色，高空俯视时远处不会出现色带
const SUN_DIR = new THREE.Vector3(160, 260, 120).normalize();
scene.background = null; // 由天空球绘制背景（Color 背景会强制清屏，影响第二遍持枪渲染）
scene.fog = new THREE.FogExp2(SKY_HORIZON_COLOR.getHex(), 0.0013);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1100);
const playerRig = new THREE.Group();
playerRig.add(camera);
scene.add(playerRig);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setClearColor(SKY_HORIZON_COLOR, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.shadowMap.autoUpdate = false; // 阴影按需刷新（中档隔帧刷新）
renderer.autoClear = false;            // 手动清屏：先画世界，再清深度画第一人称枪械（防止枪穿墙）
container.appendChild(renderer.domElement);
const MAX_ANISO = Math.min(4, renderer.capabilities.getMaxAnisotropy());

// ---------------------------------------------------------------------------
// 3.1 程序化贴图（全部运行时生成，无需任何图片文件，生成一次常驻显存）
// ---------------------------------------------------------------------------
function hash2(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function valueNoise(x, y, seed, period = 0) {
  let ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  let ix1 = ix + 1, iy1 = iy + 1;
  if (period > 0) {
    ix = ((ix % period) + period) % period; iy = ((iy % period) + period) % period;
    ix1 = (ix + 1) % period; iy1 = (iy + 1) % period;
  }
  const a = hash2(ix, iy, seed), b = hash2(ix1, iy, seed);
  const c = hash2(ix, iy1, seed), d = hash2(ix1, iy1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, seed, octaves = 4, period = 0) {
  let sum = 0, amp = 0.5, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(x * f, y * f, seed + o * 17, period ? period * f : 0) * amp;
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}
function smoothstep(e0, e1, x) {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

function makeCanvasTexture(size, painter, repeat = true) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const ctx = cv.getContext("2d");
  painter(ctx, size);
  const tex = new THREE.CanvasTexture(cv);
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = MAX_ANISO;
  return tex;
}
function paintPixels(ctx, size, fn) {
  const img = ctx.createImageData(size, size);
  const d = img.data, out = [0, 0, 0, 255];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      out[3] = 255;
      fn(x, y, out);
      const i = (y * size + x) * 4;
      d[i] = out[0]; d[i + 1] = out[1]; d[i + 2] = out[2]; d[i + 3] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
}
// 在贴图边缘自动镜像绘制，保证笔触可无缝平铺
function strokeWrapped(ctx, size, x, y, drawFn) {
  for (let ox = -size; ox <= size; ox += size) {
    for (let oy = -size; oy <= size; oy += size) {
      if (x + ox < -12 || x + ox > size + 12 || y + oy < -12 || y + oy > size + 12) continue;
      drawFn(x + ox, y + oy);
    }
  }
}

const grassTex = makeCanvasTexture(256, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n1 = fbm(u * 8, v * 8, 11, 4, 8);
    const n2 = valueNoise(u * 64, v * 64, 5, 64);
    const k = 0.78 + n1 * 0.3 + (n2 - 0.5) * 0.14 + (hash2(x, y, 3) - 0.5) * 0.12;
    const dry = smoothstep(0.62, 0.8, n1) * 0.45;
    o[0] = (84 + dry * 26) * k; o[1] = (110 + dry * 6) * k; o[2] = (58 - dry * 6) * k;
  });
  for (let i = 0; i < 1500; i++) {
    const x = Math.random() * s, y = Math.random() * s;
    const len = 2 + Math.random() * 4, ang = -Math.PI / 2 + (Math.random() - 0.5) * 1.2;
    const light = Math.random() < 0.5;
    ctx.strokeStyle = light ? "rgba(150,170,85,0.35)" : "rgba(40,62,30,0.35)";
    ctx.lineWidth = 1;
    strokeWrapped(ctx, s, x, y, (px, py) => {
      ctx.beginPath(); ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); ctx.stroke();
    });
  }
});

const plasterTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n = fbm(u * 4, v * 4, 21, 4, 4);
    const stain = smoothstep(0.62, 0.8, fbm(u * 2, v * 2, 29, 3, 2)) * 0.1;
    const k = Math.min(1, 0.84 + n * 0.16 - stain + (hash2(x, y, 7) - 0.5) * 0.07);
    o[0] = o[1] = o[2] = 255 * k;
  });
});

const woodTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const plank = Math.floor(v * 4);
    const base = 0.72 + hash2(plank, 1, 13) * 0.2;
    const grain = 0.5 + 0.5 * Math.sin((u * 48 + fbm(u * 4, v * 16, 17, 3, 4) * 6) * Math.PI);
    const seam = (v * 4) % 1 < 0.05 ? 0.55 : 1;
    const k = (base + grain * 0.1) * seam;
    o[0] = 255 * k; o[1] = 228 * k; o[2] = 196 * k;
  });
});

const rockTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n = fbm(u * 6, v * 6, 31, 5, 6);
    const crack = Math.abs(fbm(u * 3, v * 3, 37, 3, 3) - 0.5) < 0.018 ? 0.6 : 1;
    const k = Math.min(1, (0.6 + n * 0.5 + (hash2(x, y, 9) - 0.5) * 0.12) * crack);
    o[0] = o[1] = o[2] = 255 * k;
  });
});

const barkTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n = valueNoise(u * 24, v * 3, 41, 0) * 0.5 + valueNoise(u * 48, v * 6, 43, 0) * 0.5;
    const k = 0.55 + n * 0.45;
    o[0] = 255 * k; o[1] = 236 * k; o[2] = 214 * k;
  });
});

const leafTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n = fbm(u * 8, v * 8, 51, 3, 8);
    const k = 0.66 + n * 0.38 + (hash2(x, y, 11) - 0.5) * 0.18;
    o[0] = 236 * k; o[1] = 255 * k; o[2] = 214 * k;
  });
});

function makeAsphaltTexture(vertical) {
  return makeCanvasTexture(256, (ctx, s) => {
    paintPixels(ctx, s, (x, y, o) => {
      const n = fbm(x / s * 8, y / s * 8, 61, 3, 8);
      const k = 52 + n * 22 + (hash2(x, y, 15) - 0.5) * 16;
      o[0] = k; o[1] = k * 1.01; o[2] = k * 1.04;
    });
    // 道路标线：两侧白色边线 + 中间黄色虚线（带磨损）
    const line = (a0, a1, b0, b1, color) => {
      ctx.fillStyle = color;
      if (vertical) ctx.fillRect(b0 * s, a0 * s, (b1 - b0) * s, (a1 - a0) * s);
      else ctx.fillRect(a0 * s, b0 * s, (a1 - a0) * s, (b1 - b0) * s);
    };
    line(0, 1, 0.055, 0.075, "rgba(225,225,215,0.78)");
    line(0, 1, 0.925, 0.945, "rgba(225,225,215,0.78)");
    line(0, 0.32, 0.488, 0.512, "rgba(222,184,60,0.85)");
    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(48,48,50,${0.25 + Math.random() * 0.4})`;
      ctx.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 3, 1 + Math.random() * 3);
    }
  });
}

const waterNormalTex = makeCanvasTexture(128, (ctx, s) => {
  const h = (x, y) => fbm(x / s * 4, y / s * 4, 71, 4, 4);
  paintPixels(ctx, s, (x, y, o) => {
    const dx = (h((x + 1) % s, y) - h((x - 1 + s) % s, y)) * 6;
    const dy = (h(x, (y + 1) % s) - h(x, (y - 1 + s) % s)) * 6;
    const len = Math.hypot(dx, dy, 1);
    o[0] = (-dx / len * 0.5 + 0.5) * 255; o[1] = (-dy / len * 0.5 + 0.5) * 255; o[2] = (1 / len * 0.5 + 0.5) * 255;
  });
});

const cloudTex = makeCanvasTexture(256, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const n = fbm(x / s * 4, y / s * 4, 81, 5, 4);
    o[0] = o[1] = o[2] = 255 * smoothstep(0.47, 0.78, n);
  });
});

const softDotTex = makeCanvasTexture(64, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.45, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
}, false);

const flashTex = makeCanvasTexture(64, (ctx, s) => {
  ctx.translate(s / 2, s / 2);
  for (let i = 0; i < 6; i++) {
    ctx.rotate(Math.PI / 3);
    const g = ctx.createLinearGradient(0, 0, s / 2, 0);
    g.addColorStop(0, "rgba(255,240,190,0.95)"); g.addColorStop(1, "rgba(255,150,40,0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, -3); ctx.lineTo(s / 2, 0); ctx.lineTo(0, 3); ctx.fill();
  }
  const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, s / 3);
  g2.addColorStop(0, "rgba(255,255,230,1)"); g2.addColorStop(0.4, "rgba(255,190,80,0.8)"); g2.addColorStop(1, "rgba(255,120,20,0)");
  ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(0, 0, s / 3, 0, Math.PI * 2); ctx.fill();
}, false);

const holeTex = makeCanvasTexture(32, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(8,8,8,1)"); g.addColorStop(0.45, "rgba(20,20,20,0.95)");
  g.addColorStop(0.7, "rgba(60,58,55,0.55)"); g.addColorStop(1, "rgba(60,58,55,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
}, false);

const chuteTex = makeCanvasTexture(64, (ctx, s) => {
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? "#5d7a45" : "#c9b98a";
    ctx.fillRect(i * s / 8, 0, s / 8, s);
  }
});

// ---------------------------------------------------------------------------
// 3.2 天空球（渐变 + 太阳光晕 + 飘动云层，一次贴图采样，手机也很轻）
// ---------------------------------------------------------------------------
const skyMat = new THREE.ShaderMaterial({
  uniforms: {
    topColor: { value: SKY_TOP_COLOR },
    horizonColor: { value: SKY_HORIZON_COLOR },
    belowColor: { value: SKY_BELOW_COLOR },
    sunDir: { value: SUN_DIR },
    cloudMap: { value: cloudTex },
    time: { value: 0 }
  },
  vertexShader: `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform vec3 topColor; uniform vec3 horizonColor; uniform vec3 belowColor; uniform vec3 sunDir;
    uniform sampler2D cloudMap; uniform float time;
    varying vec3 vDir;
    void main() {
      vec3 d = normalize(vDir);
      float h = d.y;
      vec3 col = mix(horizonColor, topColor, pow(clamp(h, 0.0, 1.0), 0.55));
      col = mix(col, belowColor, smoothstep(0.0, -0.35, h));
      float s = max(dot(d, sunDir), 0.0);
      if (h > 0.015) {
        vec2 cuv = d.xz / (h + 0.12) * 0.2 + vec2(time * 0.004, time * 0.0016);
        float c = texture2D(cloudMap, cuv).r * smoothstep(0.015, 0.22, h);
        vec3 cloudCol = mix(vec3(0.84, 0.87, 0.92), vec3(1.0, 0.97, 0.92), pow(s, 6.0));
        col = mix(col, cloudCol, c * 0.85);
      }
      col += vec3(1.0, 0.9, 0.72) * (pow(s, 700.0) * 1.5 + pow(s, 10.0) * 0.16);
      gl_FragColor = vec4(col, 1.0);
    }`,
  side: THREE.BackSide,
  depthWrite: false
});
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(1080, 32, 16), skyMat);
skyDome.renderOrder = 1000;   // 最后绘制不透明物体：被建筑/地面挡住的天空像素直接被深度测试跳过
skyDome.frustumCulled = false;
scene.add(skyDome);

// ---------------------------------------------------------------------------
// 3.3 光照：天光半球光 + 太阳平行光（阴影只覆盖玩家周围，跟随玩家移动）
// ---------------------------------------------------------------------------
const hemiLight = new THREE.HemisphereLight(0xd8e8ff, 0x5c5240, 0.64);
hemiLight.layers.enable(1);
scene.add(hemiLight);
const fillLight = new THREE.AmbientLight(0xffffff, 0.12);
fillLight.layers.enable(1);
scene.add(fillLight);
const sunLight = new THREE.DirectionalLight(0xfff1d8, 0.95);
sunLight.position.set(160, 260, 120);
sunLight.layers.enable(1);
sunLight.shadow.bias = -0.0006;
sunLight.shadow.normalBias = 0.04;
sunLight.shadow.camera.near = 10;
sunLight.shadow.camera.far = 720;
scene.add(sunLight);
scene.add(sunLight.target);

const SUN_SHADOW_OFFSET = SUN_DIR.clone().multiplyScalar(340);
let shadowCenterX = 1e9, shadowCenterZ = 1e9;
function updateSunShadowCenter() {
  const px = playerRig.position.x, pz = playerRig.position.z;
  // 玩家每移动 6 米才平移一次阴影相机，静止时阴影边缘完全不闪烁
  if (Math.abs(px - shadowCenterX) < 6 && Math.abs(pz - shadowCenterZ) < 6) return;
  shadowCenterX = px; shadowCenterZ = pz;
  sunLight.target.position.set(px, 0, pz);
  sunLight.position.set(px + SUN_SHADOW_OFFSET.x, SUN_SHADOW_OFFSET.y, pz + SUN_SHADOW_OFFSET.z);
}

// ---------------------------------------------------------------------------
// 3.4 画质档位 + 自动动态分辨率（帧率低自动降分辨率/关阴影，保证手机不卡）
// ---------------------------------------------------------------------------
const QUALITY_PRESETS = {
  low:  { maxPR: 1.0, minPR: 0.7,  shadows: false, shadowSize: 512,  shadowType: THREE.BasicShadowMap,   shadowRange: 40, shadowEvery: 2, lootDist: 50, detailDist: 45 },
  mid:  { maxPR: 1.5, minPR: 0.85, shadows: true,  shadowSize: 1024, shadowType: THREE.PCFShadowMap,     shadowRange: 55, shadowEvery: 2, lootDist: 65, detailDist: 70 },
  high: { maxPR: 2.0, minPR: 1.0,  shadows: true,  shadowSize: 2048, shadowType: THREE.PCFSoftShadowMap, shadowRange: 75, shadowEvery: 1, lootDist: 90, detailDist: 110 }
};
const quality = {
  tier: "mid", pr: 1, maxPR: 1, minPR: 1, lootDist: 65, detailDist: 70,
  frames: 0, accum: 0, warmup: 3.0, lowStreak: 0, highStreak: 0, fps: 0, frameCounter: 0
};

function defaultAutoTier() {
  return IS_MOBILE ? "mid" : "high";
}

function setRenderPixelRatio(pr) {
  quality.pr = Math.max(quality.minPR, Math.min(quality.maxPR, pr));
  renderer.setPixelRatio(quality.pr);
  renderer.setSize(window.innerWidth, window.innerHeight);
}

function applyQualityTier(tier, keepPR) {
  const p = QUALITY_PRESETS[tier] || QUALITY_PRESETS.mid;
  const prevTier = quality.tier;
  quality.tier = tier;
  quality.lootDist = p.lootDist;
  quality.detailDist = p.detailDist;
  const dpr = window.devicePixelRatio || 1;
  quality.maxPR = Math.min(dpr, p.maxPR);
  quality.minPR = Math.min(quality.maxPR, p.minPR);
  setRenderPixelRatio(keepPR ? quality.pr : quality.maxPR);

  sunLight.castShadow = p.shadows;
  if (sunLight.shadow.mapSize.x !== p.shadowSize) {
    sunLight.shadow.mapSize.set(p.shadowSize, p.shadowSize);
    if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
  }
  const sc = sunLight.shadow.camera;
  sc.left = -p.shadowRange; sc.right = p.shadowRange; sc.top = p.shadowRange; sc.bottom = -p.shadowRange;
  sc.updateProjectionMatrix();
  renderer.shadowMap.needsUpdate = true;

  if (renderer.shadowMap.type !== p.shadowType || prevTier !== tier) {
    renderer.shadowMap.type = p.shadowType;
    // 阴影类型变化需要重新编译着色器（只在切换档位时发生一次）
    scene.traverse(o => {
      if (!o.material) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; });
    });
  }
  quality.frames = 0; quality.accum = 0; quality.lowStreak = 0; quality.highStreak = 0;
  quality.warmup = 2.0;
}

function updateAutoQuality(rawDt) {
  if (quality.warmup > 0) { quality.warmup -= rawDt; return; }
  quality.frames++;
  quality.accum += rawDt;
  if (quality.accum < 2.0) return;
  quality.fps = quality.frames / quality.accum;
  quality.frames = 0; quality.accum = 0;
  const fpsEl = document.getElementById("fps-readout");
  if (fpsEl && document.getElementById("ui-cfg-panel").style.display === "block") {
    fpsEl.innerText = `FPS ${Math.round(quality.fps)} · 渲染倍率 ${quality.pr.toFixed(2)}`;
  }
  if (gameSettings.quality !== "auto" || document.hidden) return;

  if (quality.fps < 42) {
    quality.highStreak = 0;
    if (quality.pr > quality.minPR + 0.01) {
      setRenderPixelRatio(quality.pr - 0.15);
    } else if (++quality.lowStreak >= 2) {
      quality.lowStreak = 0;
      if (quality.tier === "high") applyQualityTier("mid", true);
      else if (quality.tier === "mid") applyQualityTier("low", true);
    }
  } else if (quality.fps > 56) {
    quality.lowStreak = 0;
    if (++quality.highStreak >= 3 && quality.pr < quality.maxPR - 0.01) {
      quality.highStreak = 0;
      setRenderPixelRatio(quality.pr + 0.1);
    }
  } else {
    quality.lowStreak = 0;
    quality.highStreak = 0;
  }
}

applyQualityTier(gameSettings.quality === "auto" ? defaultAutoTier() : gameSettings.quality, false);

// ---------------------------------------------------------------------------
// 3.5 静态场景合批：上千个房屋/树木/岩石网格合并成几十个绘制批次（DrawCall 从 3000+ 降到几十）
//     原始网格对象原样保留，继续用于子弹命中与视线射线检测 —— 判定结果与原版完全一致
// ---------------------------------------------------------------------------
const BATCH_CELL = 200;
const staticBatchMaterials = {
  plaster: new THREE.MeshLambertMaterial({ vertexColors: true, map: plasterTex }),
  wood:    new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex }),
  rock:    new THREE.MeshLambertMaterial({ vertexColors: true, map: rockTex }),
  bark:    new THREE.MeshLambertMaterial({ vertexColors: true, map: barkTex }),
  leaf:    new THREE.MeshLambertMaterial({ vertexColors: true, map: leafTex })
};
const STATIC_BATCH_UV_SCALE = { plaster: 0.36, wood: 0.5, rock: 0.45, bark: 0.6, leaf: 0.35 };
const staticBatchBuckets = new Map();
const _bp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _bn = new THREE.Vector3(), _bFace = new THREE.Vector3(), _bE1 = new THREE.Vector3(), _bE2 = new THREE.Vector3();
const _bNormalMat = new THREE.Matrix3();
const _bColor = new THREE.Color();

function addToStaticBatch(mesh, matKey, colorHex, opts = {}) {
  mesh.updateMatrixWorld(true);
  const srcGeo = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry;
  const pos = srcGeo.attributes.position, nor = srcGeo.attributes.normal;
  const mw = mesh.matrixWorld;
  _bNormalMat.getNormalMatrix(mw);
  const cx = Math.floor(mw.elements[12] / BATCH_CELL), cz = Math.floor(mw.elements[14] / BATCH_CELL);
  const key = matKey + "|" + cx + "|" + cz;
  let b = staticBatchBuckets.get(key);
  if (!b) { b = { matKey, pos: [], nor: [], uv: [], col: [] }; staticBatchBuckets.set(key, b); }
  _bColor.setHex(colorHex);
  const uvs = STATIC_BATCH_UV_SCALE[matKey] || 0.4;
  const useAO = opts.ao !== false;

  for (let i = 0; i + 2 < pos.count; i += 3) {
    for (let k = 0; k < 3; k++) _bp[k].fromBufferAttribute(pos, i + k).applyMatrix4(mw);
    // 按三角面朝向选择世界坐标投影轴：贴图密度与物体大小无关，不会拉伸
    _bE1.subVectors(_bp[1], _bp[0]); _bE2.subVectors(_bp[2], _bp[0]);
    _bFace.crossVectors(_bE1, _bE2);
    const ax = Math.abs(_bFace.x), ay = Math.abs(_bFace.y), az = Math.abs(_bFace.z);
    for (let k = 0; k < 3; k++) {
      const p = _bp[k];
      _bn.fromBufferAttribute(nor, i + k).applyMatrix3(_bNormalMat).normalize();
      b.pos.push(p.x, p.y, p.z);
      b.nor.push(_bn.x, _bn.y, _bn.z);
      if (ay >= ax && ay >= az) b.uv.push(p.x * uvs, p.z * uvs);
      else if (ax >= az) b.uv.push(p.z * uvs, p.y * uvs);
      else b.uv.push(p.x * uvs, p.y * uvs);
      // 墙根/天花板压暗：零成本的环境光遮蔽，房屋立刻有“落地感”
      let shade = 1;
      if (useAO) {
        if (_bn.y < -0.5) shade = 0.62;
        else if (Math.abs(_bn.y) < 0.5) shade = 0.7 + 0.3 * Math.min(1, Math.max(0, p.y / 2.6));
      }
      if (opts.shadeFn) shade *= opts.shadeFn(p, _bn);
      b.col.push(_bColor.r * shade, _bColor.g * shade, _bColor.b * shade);
    }
  }
  if (srcGeo !== mesh.geometry) srcGeo.dispose();
}

function flushStaticBatches() {
  staticBatchBuckets.forEach(b => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(b.pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(b.nor, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(b.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(b.col, 3));
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, staticBatchMaterials[b.matKey]);
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
    m.updateMatrixWorld(true);
  });
  staticBatchBuckets.clear();
}

// 冻结静态物体矩阵（物资、弹孔、盒子等放下后不再移动）
function freezeObject(obj) {
  obj.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  obj.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// 3.6 地形、道路、河流、桥梁
// ---------------------------------------------------------------------------
const MAP_SIZE = 1600;
// 原始地面平面保留为子弹射线检测代理（不参与渲染），渲染使用下方带起伏远山的高细节地形
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
  new THREE.MeshLambertMaterial({ color: 0x4d5b41 })
);
ground.rotation.x = -Math.PI / 2;
ground.updateMatrixWorld(true);

const TERRAIN_SIZE = 3400;
const TERRAIN_SEG = 100;
const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
terrainGeo.rotateX(-Math.PI / 2);
{
  const tPos = terrainGeo.attributes.position;
  const tCol = new Float32Array(tPos.count * 3);
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i), z = tPos.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    let h = 0;
    if (edge > 830) {
      // 地图边界外隆起远山；沿河流与公路留出山谷，让河与路一直延伸到地平线
      const valley = Math.min(smoothstep(20, 95, Math.abs(z - 165)), smoothstep(14, 75, Math.abs(x)), smoothstep(14, 75, Math.abs(z)));
      h = smoothstep(830, 1180, edge) * (30 + fbm(x / 230, z / 230, 7, 4) * 150) * valley;
    }
    tPos.setY(i, h);
    const n = fbm(x / 150, z / 150, 3, 4);
    const n2 = valueNoise(x / 38, z / 38, 9);
    const dry = smoothstep(0.58, 0.74, n);
    const bank = 1 - smoothstep(19, 28, Math.abs(z - 165));
    const rocky = smoothstep(45, 120, h);
    let r = 0.96 + (n - 0.5) * 0.3 + (n2 - 0.5) * 0.12 + dry * 0.22;
    let g = 0.98 + (n - 0.5) * 0.26 + (n2 - 0.5) * 0.1 + dry * 0.05;
    let bl = 0.95 + (n - 0.5) * 0.2 - dry * 0.08;
    r += bank * 0.35; g += bank * 0.12; bl += bank * 0.05;
    r = r * (1 - rocky) + 1.05 * rocky; g = g * (1 - rocky) + 0.92 * rocky; bl = bl * (1 - rocky) + 1.0 * rocky;
    tCol[i * 3] = r; tCol[i * 3 + 1] = g; tCol[i * 3 + 2] = bl;
  }
  terrainGeo.setAttribute("color", new THREE.Float32BufferAttribute(tCol, 3));
  terrainGeo.computeVertexNormals();
}
grassTex.repeat.set(TERRAIN_SIZE / 7, TERRAIN_SIZE / 7);
const terrainMesh = new THREE.Mesh(terrainGeo, new THREE.MeshLambertMaterial({ map: grassTex, vertexColors: true }));
terrainMesh.receiveShadow = true;
terrainMesh.frustumCulled = false;
scene.add(terrainMesh);
freezeObject(terrainMesh);

const ROAD_LEN = TERRAIN_SIZE;
const roadTexH = makeAsphaltTexture(false);
roadTexH.repeat.set(ROAD_LEN / 16, 1);
const roadTexV = makeAsphaltTexture(true);
roadTexV.repeat.set(1, ROAD_LEN / 16);
const roadMat = new THREE.MeshLambertMaterial({ map: roadTexH, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
const roadMatV = new THREE.MeshLambertMaterial({ map: roadTexV, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
const mainRoadH = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_LEN, 16), roadMat);
mainRoadH.rotation.x = -Math.PI / 2; mainRoadH.position.y = 0.04;
mainRoadH.receiveShadow = true;
scene.add(mainRoadH);
freezeObject(mainRoadH);
const mainRoadV = new THREE.Mesh(new THREE.PlaneGeometry(16, ROAD_LEN), roadMatV);
mainRoadV.rotation.x = -Math.PI / 2; mainRoadV.position.y = 0.05;
mainRoadV.receiveShadow = true;
scene.add(mainRoadV);
freezeObject(mainRoadV);

waterNormalTex.repeat.set(ROAD_LEN / 24, 38 / 24);
const riverMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(ROAD_LEN, 38),
  new THREE.MeshPhongMaterial({
    color: 0x24607f, specular: 0x9fc4d8, shininess: 70,
    normalMap: waterNormalTex, normalScale: new THREE.Vector2(0.55, 0.55),
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  })
);
riverMesh.rotation.x = -Math.PI / 2;
riverMesh.position.set(0, 0.02, 165);
riverMesh.receiveShadow = true;
scene.add(riverMesh);
freezeObject(riverMesh);

const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x62666a });
const BRIDGE_XS = [-360, 0, 360];
BRIDGE_XS.forEach(bx => {
  const deck = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 44), bridgeMat);
  deck.position.set(bx, 0.2, 165);
  addToStaticBatch(deck, "plaster", 0x7c8084, { ao: false });
  const railL = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 44), bridgeMat);
  railL.position.set(bx - 9.5, 1.3, 165);
  const railR = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.2, 44), bridgeMat);
  railR.position.set(bx + 9.5, 1.3, 165);
  addToStaticBatch(railL, "plaster", 0x6e7276);
  addToStaticBatch(railR, "plaster", 0x6e7276);
});

// 蓝圈电网：竖向流动扫描线 + 底部辉光，顶部渐隐
const blueZoneGeo = new THREE.CylinderGeometry(1, 1, 180, 72, 1, true);
const blueZoneMat = new THREE.ShaderMaterial({
  uniforms: { time: { value: 0 }, color: { value: new THREE.Color(0x0a86ff) } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform float time; uniform vec3 color; varying vec2 vUv;
    void main() {
      float band = smoothstep(0.7, 1.0, 0.5 + 0.5 * sin(vUv.y * 42.0 - time * 1.6));
      float fadeTop = 1.0 - smoothstep(0.3, 1.0, vUv.y);
      float glow = 1.0 - smoothstep(0.0, 0.06, vUv.y);
      float a = (0.17 + band * 0.13 + glow * 0.22) * fadeTop;
      gl_FragColor = vec4(color + vec3(0.25, 0.3, 0.3) * (band + glow), a);
    }`,
  transparent: true, side: THREE.DoubleSide, depthWrite: false
});
const blueZoneMesh = new THREE.Mesh(blueZoneGeo, blueZoneMat);
blueZoneMesh.position.y = 90;
blueZoneMesh.frustumCulled = false;
scene.add(blueZoneMesh);

const shootableEnvironment = [ground];
const wallMeshesForLOS = [];
const wallColliders2D = [];
const buildingFootprints = [];
const worldLootItems = [];

// ---------------------------------------------------------------------------
// 3.7 碰撞空间网格：只检查附近格子的碰撞盒（与逐个遍历结果完全一致，AI 寻路 CPU 开销降低约 20 倍）
// ---------------------------------------------------------------------------
const COLLIDER_CELL = 6;
const colliderGrid = new Map();
let colliderGridCount = 0;
function gridKey(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }

function syncColliderGrid() {
  while (colliderGridCount < wallColliders2D.length) {
    const c = wallColliders2D[colliderGridCount++];
    const x0 = Math.floor(c.minX / COLLIDER_CELL), x1 = Math.floor(c.maxX / COLLIDER_CELL);
    const z0 = Math.floor(c.minZ / COLLIDER_CELL), z1 = Math.floor(c.maxZ / COLLIDER_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = gridKey(ix, iz);
        let arr = colliderGrid.get(k);
        if (!arr) { arr = []; colliderGrid.set(k, arr); }
        arr.push(c);
      }
    }
  }
}

function isPointBlocked2D(x, z, radius = 0.5) {
  if (colliderGridCount !== wallColliders2D.length) syncColliderGrid();
  const x0 = Math.floor((x - radius) / COLLIDER_CELL), x1 = Math.floor((x + radius) / COLLIDER_CELL);
  const z0 = Math.floor((z - radius) / COLLIDER_CELL), z1 = Math.floor((z + radius) / COLLIDER_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const arr = colliderGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (x + radius > c.minX && x - radius < c.maxX &&
            z + radius > c.minZ && z - radius < c.maxZ) {
          return true;
        }
      }
    }
  }
  return false;
}

function moveWithWallCollisions(posVec, dx, dz, radius = 0.48) {
  let nextX = posVec.x + dx;
  if (!isPointBlocked2D(nextX, posVec.z, radius)) posVec.x = nextX;

  let nextZ = posVec.z + dz;
  if (!isPointBlocked2D(posVec.x, nextZ, radius)) posVec.z = nextZ;

  const limit = MAP_SIZE / 2 - 5;
  posVec.x = Math.max(-limit, Math.min(limit, posVec.x));
  posVec.z = Math.max(-limit, Math.min(limit, posVec.z));
}

// 检查一个坐标位于哪栋建筑内部（用于房门导航进出屋）
function getBuildingContainingPoint(x, z, margin = 0.2) {
  for (let i = 0; i < buildingFootprints.length; i++) {
    const b = buildingFootprints[i];
    if (Math.abs(x - b.cx) < b.w / 2 + margin && Math.abs(z - b.cz) < b.d / 2 + margin) {
      return b;
    }
  }
  return null;
}

function addWallBox(cx, cy, cz, sx, sy, sz, mat, registerCollider = true) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat);
  m.position.set(cx, cy, cz);
  // 渲染走合批，m 本身保留为射线检测代理（矩阵已在合批时计算）
  addToStaticBatch(m, mat.userData.batchKey || "plaster", mat.color.getHex());
  shootableEnvironment.push(m);
  wallMeshesForLOS.push(m);
  if (registerCollider) {
    wallColliders2D.push({
      minX: cx - sx / 2, maxX: cx + sx / 2,
      minZ: cz - sz / 2, maxZ: cz + sz / 2
    });
  }
}

function buildDetailedHouse(cx, cz, w, d, h, wallColor) {
  const wallMat = new THREE.MeshLambertMaterial({ color: wallColor });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x352f2b });
  const trimMat = new THREE.MeshLambertMaterial({ color: 0x4d453f });
  const crateMat = new THREE.MeshLambertMaterial({ color: 0x7a5835 });
  crateMat.userData.batchKey = "wood";
  const t = 0.45;
  const doorW = 3.1; // 加宽门框方便AI与玩家丝滑进出

  const floor = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, d), roofMat);
  floor.position.set(cx, 0.08, cz);
  addToStaticBatch(floor, "wood", 0x6a5442, { ao: false });
  shootableEnvironment.push(floor);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.35, d + 0.8), roofMat);
  roof.position.set(cx, h, cz);
  addToStaticBatch(roof, "plaster", 0x4a413b);
  shootableEnvironment.push(roof);

  const parapetN = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.55, 0.35), trimMat);
  parapetN.position.set(cx, h + 0.4, cz - d / 2);
  const parapetS = new THREE.Mesh(new THREE.BoxGeometry(w + 1.0, 0.55, 0.35), trimMat);
  parapetS.position.set(cx, h + 0.4, cz + d / 2);
  addToStaticBatch(parapetN, "plaster", 0x5a514a, { ao: false });
  addToStaticBatch(parapetS, "plaster", 0x5a514a, { ao: false });

  // 左右两侧窗户墙
  [cx - w / 2, cx + w / 2].forEach(wx => {
    addWallBox(wx, 0.55, cz, t, 1.1, d, wallMat, true);
    addWallBox(wx, h - (h - 2.4) / 2, cz, t, h - 2.4, d, wallMat, false);
    const pillarD = (d - 3.2) / 2;
    addWallBox(wx, 1.75, cz - d / 2 + pillarD / 2, t, 1.3, pillarD, wallMat, false);
    addWallBox(wx, 1.75, cz + d / 2 - pillarD / 2, t, 1.3, pillarD, wallMat, false);
  });

  // 前后门墙：留出正门与后门
  const sideW = (w - doorW) / 2;
  [cz - d / 2, cz + d / 2].forEach(wz => {
    addWallBox(cx - w / 2 + sideW / 2, h / 2, wz, sideW, h, t, wallMat, true);
    addWallBox(cx + w / 2 - sideW / 2, h / 2, wz, sideW, h, t, wallMat, true);
    addWallBox(cx, h - 0.55, wz, doorW, 1.1, t, trimMat, false);
  });

  // 室内木箱放在角落，不挡中间过道
  addWallBox(cx - w / 2 + 1.4, 0.6, cz - d / 2 + 1.4, 1.2, 1.2, 1.2, crateMat, true);

  // 记录南北两个门外的导航锚点，供 AI 自动进出房门
  buildingFootprints.push({
    cx, cz, w, d,
    northDoor: { x: cx, z: cz - d / 2 - 2.0 },
    southDoor: { x: cx, z: cz + d / 2 + 2.0 }
  });

  const lootCount = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < lootCount; i++) {
    const lx = cx + (Math.random() - 0.5) * (w - 4.2);
    const lz = cz + (Math.random() - 0.5) * (d - 4.2);
    spawnRandomGroundLoot(lx, lz);
  }
}

// 物资模型：零件合并成一个带顶点色的网格，同类物资共享几何体与材质
// （原版每个物资新建 3~5 个网格+材质且拾取后从不释放，会持续占用显存）
const lootMergedMat = new THREE.MeshLambertMaterial({ vertexColors: true });
const lootGeoCache = new Map();

function mergeColoredParts(group) {
  group.updateMatrixWorld(true);
  const pos = [], nor = [], col = [];
  const c = new THREE.Color(), p = new THREE.Vector3(), n = new THREE.Vector3(), nm = new THREE.Matrix3();
  group.traverse(o => {
    if (!o.isMesh) return;
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry;
    nm.getNormalMatrix(o.matrixWorld);
    c.copy(o.material.color);
    for (let i = 0; i < g.attributes.position.count; i++) {
      p.fromBufferAttribute(g.attributes.position, i).applyMatrix4(o.matrixWorld);
      n.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); col.push(c.r, c.g, c.b);
    }
    if (g !== o.geometry) g.dispose();
    o.geometry.dispose();
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  merged.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  merged.computeBoundingSphere();
  return merged;
}

function createDetailedLootMesh(item) {
  const group = new THREE.Group();
  const cacheKey = `${item.kind}:${item.id || ""}:${item.sub || ""}:${item.lv || ""}`;
  let geo = lootGeoCache.get(cacheKey);
  if (!geo) {
    geo = mergeColoredParts(buildLootPartsGroup(item));
    lootGeoCache.set(cacheKey, geo);
  }
  group.add(new THREE.Mesh(geo, lootMergedMat));
  if (item.kind === "weapon") group.rotation.y = Math.random() * Math.PI * 2;
  return group;
}

function buildLootPartsGroup(item) {
  const group = new THREE.Group();

  if (item.kind === "weapon") {
    const wData = WEAPONS_DATA[item.id] || {};
    const gunMat = new THREE.MeshLambertMaterial({ color: wData.color || 0x2c2f33 });
    const darkMat = new THREE.MeshLambertMaterial({ color: 0x141618 });
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.14, 0.68), gunMat);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 8), darkMat);
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.03, -0.45);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.22, 0.10), darkMat);
    mag.position.set(0, -0.14, -0.05); mag.rotation.x = 0.25;
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.28), gunMat);
    stock.position.set(0, -0.02, 0.42);
    const body = new THREE.Group();
    body.add(receiver, barrel, mag, stock);
    body.rotation.z = Math.PI / 2;
    // 地面橙色光圈（原版光圈被枪身旋转带成了竖直的，这里修正为平铺在地面，并与枪身合并为一次绘制）
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.38, 0.46, 20), new THREE.MeshLambertMaterial({ color: 0xffa500 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.12;
    group.add(body, ring);
  } else if (item.kind === "ammo") {
    const boxCols = { "5.56mm": 0x3b7a38, "7.62mm": 0x8f5629, "9mm": 0xb8860b, ".45ACP": 0x465b6e, "12Gauge": 0xa82820, ".50BMG": 0x8b0000 };
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.20, 0.24), new THREE.MeshLambertMaterial({ color: boxCols[item.id] || 0xcca300 }));
    const brass = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.05, 0.25), new THREE.MeshLambertMaterial({ color: 0xffcc33 }));
    brass.position.y = 0.08;
    group.add(box, brass);
  } else if (item.kind === "med") {
    if (item.id === "drink" || item.id === "painkiller") {
      const can = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.30, 10), new THREE.MeshLambertMaterial({ color: item.id === "drink" ? 0x1e66d0 : 0xe67e22 }));
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.10, 0.04, 10), new THREE.MeshLambertMaterial({ color: 0xdddddd }));
      top.position.y = 0.16;
      group.add(can, top);
    } else {
      const bag = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.30), new THREE.MeshLambertMaterial({ color: item.id === "medkit" ? 0x26734d : 0xeeeeee }));
      const cross1 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.05), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      const cross2 = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, 0.18), new THREE.MeshBasicMaterial({ color: 0xff2222 }));
      cross1.position.y = 0.095; cross2.position.y = 0.095;
      group.add(bag, cross1, cross2);
    }
  } else if (item.kind === "attachment") {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.10, 0.30), new THREE.MeshLambertMaterial({ color: 0x22262b }));
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.32, 10), new THREE.MeshLambertMaterial({ color: 0x00b8e6 }));
    tube.rotation.x = Math.PI / 2; tube.position.y = 0.09;
    group.add(base, tube);
  } else if (item.kind === "gear") {
    const lvColors = { 1: 0x7d8778, 2: 0x4b5746, 3: 0x26282a };
    const col = lvColors[item.lv] || 0x666666;
    if (item.sub === "helm") {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.65), new THREE.MeshLambertMaterial({ color: col }));
      if (item.lv === 3) {
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.14, 0.12), new THREE.MeshLambertMaterial({ color: 0x111111 }));
        visor.position.set(0, 0.06, 0.18);
        group.add(visor);
      }
      group.add(dome);
    } else if (item.sub === "vest") {
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.22), new THREE.MeshLambertMaterial({ color: col }));
      group.add(torso);
    } else {
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.26), new THREE.MeshLambertMaterial({ color: col }));
      const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.10), new THREE.MeshLambertMaterial({ color: 0x3b352c }));
      pouch.position.set(0, -0.05, 0.16);
      group.add(pack, pouch);
    }
  }

  return group;
}

function spawnRandomGroundLoot(x, z, forcedItem = null) {
  let item = forcedItem;
  if (!item) {
    const r = Math.random();
    if (r < 0.36) {
      const wKeys = Object.keys(WEAPONS_DATA).filter(k => !WEAPONS_DATA[k].airdropOnly);
      const wKey = wKeys[Math.floor(Math.random() * wKeys.length)];
      const wep = WEAPONS_DATA[wKey];
      item = { kind: "weapon", id: wKey, name: wep.name, ammoInMag: wep.mag, attachments: {} };
      spawnRandomGroundLoot(x + 0.65, z + 0.45, {
        kind: "ammo", id: wep.ammoType, name: `${wep.ammoType} 子弹`, count: wep.type === "SG" ? 15 : 40
      });
    } else if (r < 0.66) {
      const aKeys = Object.keys(ATTACHMENTS_DATA);
      const aKey = aKeys[Math.floor(Math.random() * aKeys.length)];
      const att = ATTACHMENTS_DATA[aKey];
      item = { kind: "attachment", id: aKey, name: att.name, slot: att.slot };
    } else if (r < 0.86) {
      const mKeys = Object.keys(MEDS_DATA);
      const mKey = mKeys[Math.floor(Math.random() * mKeys.length)];
      item = { kind: "med", id: mKey, name: MEDS_DATA[mKey].name, count: 1 };
    } else {
      const lv = Math.random() < 0.18 ? 3 : (Math.random() < 0.55 ? 2 : 1);
      const gearTypes = [
        { sub: "helm", name: `${lv}级头盔`, lv, maxDur: lv * 80 },
        { sub: "vest", name: `${lv}级防弹衣`, lv, maxDur: lv * 100 },
        { sub: "bag",  name: `${lv}级背包`, lv, capBonus: lv * 70 }
      ];
      const g = gearTypes[Math.floor(Math.random() * gearTypes.length)];
      item = { kind: "gear", sub: g.sub, name: g.name, lv: g.lv, dur: g.maxDur, maxDur: g.maxDur, capBonus: g.capBonus };
    }
  }

  const mesh = createDetailedLootMesh(item);
  mesh.position.set(x, 0.16, z);
  scene.add(mesh);
  freezeObject(mesh);
  worldLootItems.push({ x, z, mesh, item });
}

const houseColors = [0xc2b29b, 0x9b7653, 0x7a8b99, 0xb86b52, 0x8c857b];
function generateTownCluster(centerX, centerZ, gridRadius, spacing) {
  for (let gx = -gridRadius; gx <= gridRadius; gx++) {
    for (let gz = -gridRadius; gz <= gridRadius; gz++) {
      if (gx === 0 && gz === 0) continue;
      if (Math.random() < 0.78) {
        const hx = centerX + gx * spacing + (Math.random() - 0.5) * 8;
        const hz = centerZ + gz * spacing + (Math.random() - 0.5) * 8;
        if (Math.abs(hx) < 16 || Math.abs(hz) < 16 || Math.abs(hz - 165) < 28) continue;
        const hw = 11 + Math.random() * 5;
        const hd = 11 + Math.random() * 5;
        const hh = 4.4 + (Math.random() < 0.35 ? 2.4 : 0);
        const col = houseColors[Math.floor(Math.random() * houseColors.length)];
        buildDetailedHouse(hx, hz, hw, hd, hh, col);
      }
    }
  }
}

generateTownCluster(0, 0, 4, 42);
generateTownCluster(-380, -360, 2, 46);
generateTownCluster(380, -340, 2, 48);
generateTownCluster(-360, 360, 2, 46);
generateTownCluster(360, 380, 2, 46);

const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3525 });
const leafMat = new THREE.MeshLambertMaterial({ color: 0x2d4c2b });
const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b6e70 });
const hayMat = new THREE.MeshLambertMaterial({ color: 0xc29b38 });

// 树冠：低多边形硬边造型（松树叠层锥 / 阔叶树团簇），每棵树色调与大小随机，纯视觉不影响碰撞
const FOLIAGE_COLORS = [0x2d4c2b, 0x355a2c, 0x2b5034, 0x41602e, 0x3a5526];
const foliageConeGeo = (() => { const g = new THREE.ConeGeometry(1, 1, 7).toNonIndexed(); g.computeVertexNormals(); return g; })();
const foliageBlobGeo = new THREE.IcosahedronGeometry(1, 0);
const _foliageTmp = new THREE.Mesh(foliageConeGeo, leafMat);
function addTreeFoliageToBatch(tx, tz) {
  const col = FOLIAGE_COLORS[Math.floor(Math.random() * FOLIAGE_COLORS.length)];
  const s = 0.85 + Math.random() * 0.4;
  const shadeFn = p => 0.68 + 0.32 * smoothstep(2.6, 8.5, p.y);
  const put = (geo, x, y, z, sx, sy, sz, rotY) => {
    _foliageTmp.geometry = geo;
    _foliageTmp.position.set(x, y, z);
    _foliageTmp.scale.set(sx, sy, sz);
    _foliageTmp.rotation.set(0, rotY, 0);
    addToStaticBatch(_foliageTmp, "leaf", col, { ao: false, shadeFn });
  };
  if (Math.random() < 0.55) {
    put(foliageConeGeo, tx, 3.9 * s, tz, 2.7 * s, 3.3 * s, 2.7 * s, Math.random() * 6);
    put(foliageConeGeo, tx, 5.3 * s, tz, 2.1 * s, 2.9 * s, 2.1 * s, Math.random() * 6);
    put(foliageConeGeo, tx, 6.7 * s, tz, 1.4 * s, 2.5 * s, 1.4 * s, Math.random() * 6);
  } else {
    put(foliageBlobGeo, tx, 4.6 * s, tz, 2.1 * s, 1.8 * s, 2.1 * s, Math.random() * 6);
    for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2;
      put(foliageBlobGeo, tx + Math.cos(a) * 1.2 * s, (4.2 + Math.random() * 1.4) * s, tz + Math.sin(a) * 1.2 * s,
        1.5 * s, 1.3 * s, 1.5 * s, Math.random() * 6);
    }
  }
}

for (let i = 0; i < 240; i++) {
  const tx = (Math.random() - 0.5) * (MAP_SIZE - 120);
  const tz = (Math.random() - 0.5) * (MAP_SIZE - 120);
  if (Math.abs(tx) < 16 || Math.abs(tz) < 16 || Math.abs(tz - 165) < 24) continue;
  if (buildingFootprints.some(b => Math.abs(tx - b.cx) < b.w + 3 && Math.abs(tz - b.cz) < b.d + 3)) continue;

  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3.6, 7), trunkMat);
  trunk.position.y = 1.8;
  tree.add(trunk);
  tree.position.set(tx, 0, tz);
  tree.updateMatrixWorld(true);
  addToStaticBatch(trunk, "bark", 0x5c4331, { ao: false, shadeFn: p => 0.75 + 0.25 * Math.min(1, p.y / 3) });
  addTreeFoliageToBatch(tx, tz);
  shootableEnvironment.push(trunk);
  wallMeshesForLOS.push(trunk);
  wallColliders2D.push({ minX: tx - 0.45, maxX: tx + 0.45, minZ: tz - 0.45, maxZ: tz + 0.45 });
}

for (let i = 0; i < 85; i++) {
  const rx = (Math.random() - 0.5) * (MAP_SIZE - 160);
  const rz = (Math.random() - 0.5) * (MAP_SIZE - 160);
  if (Math.abs(rx) < 16 || Math.abs(rz) < 16 || Math.abs(rz - 165) < 24) continue;
  if (buildingFootprints.some(b => Math.abs(rx - b.cx) < b.w + 3 && Math.abs(rz - b.cz) < b.d + 3)) continue;

  if (Math.random() < 0.65) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1.6, 0), rockMat);
    rock.position.set(rx, 0.9, rz);
    rock.scale.set(1.2, 0.85, 1.1);
    addToStaticBatch(rock, "rock", Math.random() < 0.5 ? 0x7a7d7f : 0x6b6e70, { ao: false, shadeFn: p => 0.7 + 0.3 * Math.min(1, p.y / 1.4) });
    shootableEnvironment.push(rock);
    wallMeshesForLOS.push(rock);
    wallColliders2D.push({ minX: rx - 1.4, maxX: rx + 1.4, minZ: rz - 1.3, maxZ: rz + 1.3 });
  } else {
    const hay = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1.5, 10), hayMat);
    hay.rotation.z = Math.PI / 2;
    hay.position.set(rx, 0.75, rz);
    addToStaticBatch(hay, "bark", 0xd4ae4a, { ao: false, shadeFn: p => 0.72 + 0.28 * Math.min(1, p.y / 1.5) });
    shootableEnvironment.push(hay);
    wallMeshesForLOS.push(hay);
    wallColliders2D.push({ minX: rx - 1.1, maxX: rx + 1.1, minZ: rz - 1.1, maxZ: rz + 1.1 });
  }
}

// 装饰灌木（纯视觉，可穿行，和端游草丛一样不挡子弹）
for (let i = 0; i < 320; i++) {
  const bx = (Math.random() - 0.5) * (MAP_SIZE - 80);
  const bz = (Math.random() - 0.5) * (MAP_SIZE - 80);
  if (Math.abs(bx) < 12 || Math.abs(bz) < 12 || Math.abs(bz - 165) < 22) continue;
  if (buildingFootprints.some(b => Math.abs(bx - b.cx) < b.w / 2 + 2 && Math.abs(bz - b.cz) < b.d / 2 + 2)) continue;
  const col = FOLIAGE_COLORS[Math.floor(Math.random() * FOLIAGE_COLORS.length)];
  const s = 0.6 + Math.random() * 0.7;
  for (let k = 0; k < 2; k++) {
    _foliageTmp.geometry = foliageBlobGeo;
    _foliageTmp.position.set(bx + (k - 0.5) * 0.7 * s, 0.35 * s, bz + (Math.random() - 0.5) * 0.6 * s);
    _foliageTmp.scale.set(0.9 * s, 0.65 * s, 0.9 * s);
    _foliageTmp.rotation.set(0, Math.random() * 6, 0);
    addToStaticBatch(_foliageTmp, "leaf", col, { ao: false, shadeFn: p => 0.6 + 0.4 * Math.min(1, p.y / (0.9 * s)) });
  }
}

// 全部静态物体生成完毕 → 一次性合批上传 GPU
flushStaticBatches();

// 开局跳伞运输机
const planeGroup = new THREE.Group();
{
  // 运输机外观：圆形机身 + 机头机尾 + 四发螺旋桨引擎 + 尾翼（合并成单个网格，1 次绘制）
  const parts = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x59625c });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2c312e });
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x48504b });
  const addPart = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; parts.add(m);
  };
  addPart(new THREE.CylinderGeometry(2.4, 2.4, 22, 16), bodyMat, 0, 0, 0, Math.PI / 2);
  addPart(new THREE.CylinderGeometry(0.9, 2.4, 4.5, 16), bodyMat, 0, -0.2, 13.2, Math.PI / 2);
  addPart(new THREE.CylinderGeometry(2.4, 0.7, 7, 16), bodyMat, 0, 0.7, -14.5, Math.PI / 2);
  addPart(new THREE.BoxGeometry(2.4, 0.7, 1.2), darkMat, 0, 1.25, 13.6);
  addPart(new THREE.BoxGeometry(34, 0.5, 4.5), wingMat, 0, 1.2, 1.5);
  [-11, -6, 6, 11].forEach(ex => {
    addPart(new THREE.CylinderGeometry(0.75, 0.6, 3.4, 10), darkMat, ex, 0.6, 3.6, Math.PI / 2);
    addPart(new THREE.BoxGeometry(3.2, 0.12, 0.25), darkMat, ex, 0.6, 5.35);
  });
  addPart(new THREE.BoxGeometry(0.45, 5.2, 3.6), wingMat, 0, 3.6, -16.2);
  addPart(new THREE.BoxGeometry(11, 0.35, 2.6), wingMat, 0, 1.6, -16.6);
  const planeMesh = new THREE.Mesh(mergeColoredParts(parts), lootMergedMat);
  planeGroup.add(planeMesh);
}
planeGroup.position.set(-580, 195, -550);
planeGroup.lookAt(580, 195, 550);
scene.add(planeGroup);

// ============================================================================
// 4. 空投补给系统
// ============================================================================
const airdrops = [];
let nextAirdropTime = 50;

function spawnAirdropEvent() {
  const dropX = zoneState.cx + (Math.random() - 0.5) * zoneState.targetR * 1.1;
  const dropZ = zoneState.cz + (Math.random() - 0.5) * zoneState.targetR * 1.1;

  const crateGroup = new THREE.Group();
  const redBox = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 1.4), new THREE.MeshLambertMaterial({ color: 0xb81d13 }));
  redBox.position.y = 0.55;
  const blueTarp = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.35, 1.46), new THREE.MeshLambertMaterial({ color: 0x1a4b8c }));
  blueTarp.position.y = 0.95;

  const chute = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.5),
    new THREE.MeshLambertMaterial({ color: 0xffffff, map: chuteTex, side: THREE.DoubleSide })
  );
  chute.position.y = 5.5;
  crateGroup.add(redBox, blueTarp, chute);
  crateGroup.traverse(o => { if (o.isMesh) o.castShadow = true; });
  crateGroup.position.set(dropX, 165, dropZ);
  scene.add(crateGroup);

  // 红色信号烟：柔边粒子精灵（比实心小球真实得多，且始终面向镜头）
  const smokeParticles = [];
  for (let i = 0; i < 12; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({
      map: softDotTex, color: 0xff3a22, transparent: true, opacity: 0, depthWrite: false
    }));
    sp.scale.setScalar(1.8 + Math.random() * 1.4);
    sp.position.set(dropX, 1.2 + i * 0.9, dropZ);
    scene.add(sp);
    smokeParticles.push(sp);
  }

  airdrops.push({
    x: dropX, z: dropZ,
    crateGroup, chute, smokeParticles,
    landed: false,
    smokeEndTime: 0
  });

  showToast("✈️ 空投补给箱已投放在安全区附近，注意抬头查看红色浓烟！");
}

function populateAirdropLoot(ax, az) {
  const airdropWeps = ["awm", "amr", "aug", "mk14", "m249"];
  const wKey = airdropWeps[Math.floor(Math.random() * airdropWeps.length)];
  const wep = WEAPONS_DATA[wKey];

  spawnRandomGroundLoot(ax + 0.9, az, {
    kind: "weapon", id: wKey, name: `🔥${wep.name}`, ammoInMag: wep.mag, attachments: {}
  });
  spawnRandomGroundLoot(ax + 1.3, az + 0.5, {
    kind: "ammo", id: wep.ammoType, name: `${wep.ammoType} 子弹`, count: wep.ammoType === ".50BMG" ? 20 : 60
  });
  spawnRandomGroundLoot(ax - 0.9, az + 0.4, {
    kind: "gear", sub: "helm", name: "🔥3级头盔", lv: 3, dur: 240, maxDur: 240
  });
  spawnRandomGroundLoot(ax - 0.9, az - 0.4, {
    kind: "gear", sub: "vest", name: "🔥3级防弹衣", lv: 3, dur: 300, maxDur: 300
  });
  spawnRandomGroundLoot(ax, az + 1.0, {
    kind: "attachment", id: "8x", name: ATTACHMENTS_DATA["8x"].name, slot: "scope"
  });
  spawnRandomGroundLoot(ax, az - 1.0, {
    kind: "med", id: "adrenaline", name: MEDS_DATA["adrenaline"].name, count: 1
  });
}

const fpGunGroup = new THREE.Group();
camera.add(fpGunGroup);
let muzzleFlashMesh;

const WOOD_GUNS = ["akm", "kar98k", "s1897", "s686", "sks", "dragunov", "dp28", "mini14"];
const _limbUp = new THREE.Vector3(0, 0, 1);

function rebuildFPGunModel() {
  // 清理旧枪模并释放显存（原版切枪会不断泄漏几何体与材质）
  while (fpGunGroup.children.length > 0) {
    const old = fpGunGroup.children[0];
    fpGunGroup.remove(old);
    old.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }
  const activeWep = player.weapons[player.activeSlot];
  if (!activeWep || player.phase !== "ground") return;

  const wData = WEAPONS_DATA[activeWep.id];
  const type = wData.type;
  const isWood = WOOD_GUNS.includes(wData.id);
  const matMain = new THREE.MeshPhongMaterial({ color: wData.color || 0x2c2f33, specular: isWood ? 0x1c1a18 : 0x4a4f55, shininess: isWood ? 14 : 46 });
  const matDark = new THREE.MeshPhongMaterial({ color: 0x17191b, specular: 0x5a5f66, shininess: 60 });
  const matGlove = new THREE.MeshLambertMaterial({ color: 0x1f211e });
  const matSleeve = new THREE.MeshLambertMaterial({ color: 0x4b5338 });

  const add = (geo, mat, x, y, z, rx = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.rotation.x = rx;
    fpGunGroup.add(m);
    return m;
  };
  const addLimb = (from, to, thick, mat) => {
    const dir = to.clone().sub(from);
    const m = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, dir.length()), mat);
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(_limbUp, dir.normalize());
    fpGunGroup.add(m);
    return m;
  };

  const longGun = type === "SR" || type === "DMR";
  const barrelLen = longGun ? 0.6 : (type === "SMG" ? 0.3 : (type === "SG" ? 0.5 : 0.46));
  const barrelZ = -0.19 - barrelLen / 2;
  const muzzleZ = barrelZ - barrelLen / 2;

  // 机匣 + 上导轨
  add(new THREE.BoxGeometry(0.074, 0.105, 0.42), matMain, 0, 0, -0.02);
  add(new THREE.BoxGeometry(0.05, 0.022, 0.34), matDark, 0, 0.062, -0.04);
  // 护木 / 泵动握把 / 长木托
  if (type === "SG") {
    add(new THREE.BoxGeometry(0.06, 0.06, 0.18), matMain, 0, -0.03, -0.36);
  } else if (type === "SR") {
    add(new THREE.BoxGeometry(0.068, 0.07, 0.42), matMain, 0, -0.012, -0.38);
  } else {
    add(new THREE.BoxGeometry(0.066, 0.078, 0.24), isWood ? matMain : matDark, 0, 0.004, -0.33);
  }
  // 枪管（S686 双管）
  if (wData.id === "s686") {
    add(new THREE.CylinderGeometry(0.017, 0.017, barrelLen, 10), matDark, -0.018, 0.022, barrelZ, Math.PI / 2);
    add(new THREE.CylinderGeometry(0.017, 0.017, barrelLen, 10), matDark, 0.018, 0.022, barrelZ, Math.PI / 2);
  } else {
    add(new THREE.CylinderGeometry(0.014, 0.017, barrelLen, 10), matDark, 0, 0.022, barrelZ, Math.PI / 2);
  }
  // 准星 / 照门
  add(new THREE.BoxGeometry(0.01, 0.04, 0.01), matDark, 0, 0.06, muzzleZ + 0.05);
  add(new THREE.BoxGeometry(0.034, 0.024, 0.02), matDark, 0, 0.083, 0.1);
  // 弹匣
  const hasExt = activeWep.attachments.mag === "ext_mag";
  if (wData.id === "dp28") {
    add(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 18), matDark, 0, 0.1, -0.06);
  } else if (type === "LMG") {
    add(new THREE.BoxGeometry(0.1, 0.11, 0.12), matDark, 0.03, -0.1, -0.08);
  } else if (type === "AR" || type === "SMG" || type === "DMR" || (type === "SR" && wData.id !== "kar98k")) {
    const magH = (type === "SR" ? 0.08 : 0.16) * (hasExt ? 1.35 : 1);
    add(new THREE.BoxGeometry(0.048, magH, 0.085), matDark, 0, -0.05 - magH / 2, -0.11, wData.ironType === "ak" ? 0.28 : 0.14);
  }
  // 握把与枪托
  if (isWood && (type === "SR" || type === "SG" || type === "DMR")) {
    add(new THREE.BoxGeometry(0.058, 0.11, 0.34), matMain, 0, -0.05, 0.32, -0.1);
  } else {
    add(new THREE.BoxGeometry(0.042, 0.11, 0.055), matDark, 0, -0.1, 0.1, -0.35);
    add(new THREE.BoxGeometry(0.055, 0.09, 0.22), isWood ? matMain : matDark, 0, -0.03, 0.3);
  }

  if (activeWep.attachments.muzzle || activeWep.attachments.sg_muzzle) {
    const mz = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.12, 10), matDark);
    mz.rotation.x = Math.PI / 2; mz.position.set(0, 0.022, muzzleZ - 0.05);
    fpGunGroup.add(mz);
  }
  if (activeWep.attachments.grip) {
    const gr = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.11, 0.04), matDark);
    gr.position.set(0, -0.09, -0.3);
    fpGunGroup.add(gr);
  }
  if (activeWep.attachments.scope) {
    const big = ["3x", "4x", "6x", "8x"].includes(activeWep.attachments.scope);
    add(new THREE.CylinderGeometry(big ? 0.03 : 0.024, big ? 0.03 : 0.024, big ? 0.22 : 0.12, 14), matDark, 0, 0.105, -0.03, Math.PI / 2);
    add(new THREE.BoxGeometry(0.03, 0.03, 0.05), matDark, 0, 0.08, -0.03);
    add(new THREE.CircleGeometry(big ? 0.022 : 0.017, 14),
      new THREE.MeshBasicMaterial({ color: 0x1d3446 }), 0, 0.105, -0.03 + (big ? 0.111 : 0.061));
  }

  // 双手持枪（手套 + 袖子），让第一人称更有端游质感
  const rHand = new THREE.Vector3(0.012, -0.12, 0.12);
  const lHand = new THREE.Vector3(-0.012, -0.06, type === "SG" ? -0.36 : -0.32);
  addLimb(rHand, new THREE.Vector3(0.06, -0.2, 0.26), 0.07, matGlove);
  addLimb(new THREE.Vector3(0.06, -0.2, 0.26), new THREE.Vector3(0.2, -0.38, 0.62), 0.095, matSleeve);
  addLimb(lHand, new THREE.Vector3(-0.07, -0.14, -0.22), 0.068, matGlove);
  addLimb(new THREE.Vector3(-0.07, -0.14, -0.22), new THREE.Vector3(-0.3, -0.36, 0.08), 0.092, matSleeve);

  // 枪口火焰：加法混合的星芒精灵
  const flashMat = new THREE.SpriteMaterial({ map: flashTex, color: 0xffc070, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  muzzleFlashMesh = new THREE.Sprite(flashMat);
  muzzleFlashMesh.scale.setScalar(0.3);
  muzzleFlashMesh.position.set(0, 0.022, muzzleZ - (activeWep.attachments.muzzle ? 0.16 : 0.08));
  fpGunGroup.add(muzzleFlashMesh);

  // 第一人称模型只在第二遍（图层1）渲染，并且先清深度 → 贴墙也不会穿模
  fpGunGroup.traverse(o => { o.layers.set(1); });
  fpGunGroup.position.set(0.24, -0.22, -0.48);
}

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
  boltLockedUntil: 0,
  casting: null
};

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
  return Math.round(w);
}

let yaw = -Math.PI * 0.25;
let pitch = -0.25;
let minimapZoomOut = false;

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
  vest: new THREE.MeshLambertMaterial({ color: 0x4b5638 }),
  helmet: new THREE.MeshLambertMaterial({ color: 0x55603f }),
  visor: new THREE.MeshLambertMaterial({ color: 0x111316 }),
  pack: new THREE.MeshLambertMaterial({ color: 0x5b4d37 }),
  chute: new THREE.MeshLambertMaterial({ color: 0xffffff, map: chuteTex, side: THREE.DoubleSide })
};

function createAIBot(id) {
  const group = new THREE.Group();
  const shirtColor = new THREE.Color().setHSL(Math.random(), 0.45, 0.35);
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

  // 装备外观（纯视觉）：防弹衣（捡到枪后出现）、头盔、护目镜、背包
  const vestMesh = new THREE.Mesh(BOT_GEO.vest, BOT_MAT.vest);
  vestMesh.position.y = 1.24 - 0.72;
  vestMesh.visible = false;
  const visor = new THREE.Mesh(BOT_GEO.visor, BOT_MAT.visor);
  visor.position.set(0, 1.93 - 0.72, 0.205);
  const pack = new THREE.Mesh(BOT_GEO.pack, BOT_MAT.pack);
  pack.position.set(0, 1.2 - 0.72, -0.33);
  upper.add(body, head, armLPivot, armRPivot, botGunMesh, vestMesh, visor, pack);
  const detailMeshes = [bootL, bootR, visor, pack];
  if (Math.random() < 0.55) {
    const helmet = new THREE.Mesh(BOT_GEO.helmet, BOT_MAT.helmet);
    helmet.position.y = 2.0 - 0.72;
    helmet.scale.set(1.2, 1.1, 1.2);
    upper.add(helmet);
    detailMeshes.push(helmet);
  }

  // 专属空降降落伞模型（跳伞开伞阶段显示）
  const chuteMesh = new THREE.Mesh(BOT_GEO.chute, BOT_MAT.chute);
  chuteMesh.position.y = 3.2;
  chuteMesh.visible = false;

  group.add(legLPivot, legRPivot, upper, chuteMesh);
  group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  chuteMesh.castShadow = false;
  group.visible = false;
  scene.add(group);

  // 为每个 AI 分配一个心仪的房区降落点
  const randomHouse = buildingFootprints[Math.floor(Math.random() * buildingFootprints.length)];
  const landTarget = randomHouse
    ? new THREE.Vector3(randomHouse.southDoor.x + (Math.random() - 0.5) * 8, 0, randomHouse.southDoor.z + (Math.random() - 0.5) * 6)
    : new THREE.Vector3((Math.random() - 0.5) * 450, 0, (Math.random() - 0.5) * 450);

  const bot = {
    id,
    name: (AI_NAMES[id % AI_NAMES.length] || "Survivor") + "_" + (10 + id),
    group, legL, legR, body, head, botGunMesh, chuteMesh,
    legLPivot, legRPivot, upper, armLPivot, armRPivot, vestMesh, detailMeshes, detailShown: true,
    phase: "plane", // plane -> sky -> chute -> ground
    hp: 100,
    armorReduction: 0.10,
    dropTime: 1.2 + (id / 49) * 21.0 + Math.random() * 1.2,
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

for (let i = 0; i < 49; i++) createAIBot(i);

// 计算 AI 的下一个导航子目标（自动进出房门、自动找桥过河）
function computeAINavSubTarget(botPos, finalGoal) {
  // 1. 跨河检测：如果 AI 与目标点分布在河流 (z=165) 两侧，先导航到最近的跨河大桥
  if ((botPos.z < 142 && finalGoal.z > 188) || (botPos.z > 188 && finalGoal.z < 142)) {
    let bestBx = BRIDGE_XS[0];
    let minD = 99999;
    BRIDGE_XS.forEach(bx => {
      const d = Math.abs(botPos.x - bx);
      if (d < minD) { minD = d; bestBx = bx; }
    });
    if (Math.abs(botPos.x - bestBx) > 8) {
      return new THREE.Vector3(bestBx, 0, botPos.z < 165 ? 138 : 192);
    }
    return new THREE.Vector3(bestBx, 0, botPos.z < 165 ? 195 : 135);
  }

  const botHouse = getBuildingContainingPoint(botPos.x, botPos.z, -0.3);
  const goalHouse = getBuildingContainingPoint(finalGoal.x, finalGoal.z, 0.3);

  // 2. 如果 AI 在某栋房子内部，而目标点在房子外面 -> 先走向最近的房门出去！
  if (botHouse && botHouse !== goalHouse) {
    const dNorth = Math.hypot(botPos.x - botHouse.northDoor.x, botPos.z - botHouse.northDoor.z);
    const dSouth = Math.hypot(botPos.x - botHouse.southDoor.x, botPos.z - botHouse.southDoor.z);
    const exitDoor = dNorth < dSouth ? botHouse.northDoor : botHouse.southDoor;
    return new THREE.Vector3(exitDoor.x, 0, exitDoor.z);
  }

  // 3. 如果目标物资在某栋房子内部，而 AI 在房子外面 -> 先导航到该房子的正门/后门外，再进屋！
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
    // 检测前方 0.9m 和 1.7m 两个采样点是否畅通
    const clearNear = !isPointBlocked2D(pos.x + vx * 0.9, pos.z + vz * 0.9, 0.44);
    const clearFar  = !isPointBlocked2D(pos.x + vx * 1.7, pos.z + vz * 1.7, 0.44);
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
  moveWithWallCollisions(pos, stepX, stepZ, 0.44);

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

  const targetLean = 0.03 + speedN * 0.17 * (1 - aim * 0.6);
  bot.upper.rotation.x += (targetLean - bot.upper.rotation.x) * k;
  bot.upper.rotation.y = swing * 0.07 * speedN * (1 - aim);
  bot.upper.position.y = 0.72 + Math.abs(Math.cos(bot.walkCycle)) * 0.045 * speedN + Math.sin(now * 0.002 + bot.wanderPhase) * 0.006;

  const armSwing = swing * 0.55 * speedN * (1 - aim);
  bot.armLPivot.rotation.x = (-0.1 - armSwing) * (1 - aim) + (-1.38) * aim;
  bot.armRPivot.rotation.x = (-0.1 + armSwing) * (1 - aim) + (-1.22) * aim;
  bot.armLPivot.rotation.y = 0.62 * aim;
  bot.armRPivot.rotation.y = -0.22 * aim;
  bot.armLPivot.rotation.z = -0.06 * (1 - aim);
  bot.armRPivot.rotation.z = 0.06 * (1 - aim);

  bot.botGunMesh.position.set(0.16 - 0.04 * aim, 0.42 + 0.3 * aim, 0.3 + 0.14 * aim);
  bot.botGunMesh.rotation.x = 0.55 * (1 - aim);
  bot.vestMesh.visible = bot.armorReduction >= 0.25;

  const showDetail = distToPlayer < quality.detailDist;
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

// 视线检测空间网格：只对视线线段穿过的格子里的墙体做射线检测
// （检测结果与对全部墙体检测完全一致，但每次只需测试几十个而非两千多个网格）
const LOS_CELL = 8;
const losGrid = new Map();
let losGridCount = 0;
let losStamp = 0;
const losCandidates = [];
const _losBox = new THREE.Box3();

function syncLOSGrid() {
  while (losGridCount < wallMeshesForLOS.length) {
    const m = wallMeshesForLOS[losGridCount++];
    _losBox.setFromObject(m);
    const x0 = Math.floor((_losBox.min.x - 0.05) / LOS_CELL), x1 = Math.floor((_losBox.max.x + 0.05) / LOS_CELL);
    const z0 = Math.floor((_losBox.min.z - 0.05) / LOS_CELL), z1 = Math.floor((_losBox.max.z + 0.05) / LOS_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = gridKey(ix, iz);
        let arr = losGrid.get(k);
        if (!arr) { arr = []; losGrid.set(k, arr); }
        arr.push(m);
      }
    }
  }
}

function addLOSCell(ix, iz) {
  const arr = losGrid.get(gridKey(ix, iz));
  if (!arr) return;
  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    if (m.__losStamp !== losStamp) { m.__losStamp = losStamp; losCandidates.push(m); }
  }
}

// 2D 网格步进（DDA）收集线段经过的所有格子
function gatherLOSCandidates(x0, z0, x1, z1) {
  losStamp++;
  losCandidates.length = 0;
  let cx = Math.floor(x0 / LOS_CELL), cz = Math.floor(z0 / LOS_CELL);
  const dx = x1 - x0, dz = z1 - z0;
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(LOS_CELL / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(LOS_CELL / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * LOS_CELL - x0 : x0 - cx * LOS_CELL) / Math.abs(dx) : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * LOS_CELL - z0 : z0 - cz * LOS_CELL) / Math.abs(dz) : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    addLOSCell(cx, cz);
    if (tMaxX < tMaxZ) {
      if (tMaxX > 1) break;
      tMaxX += tDeltaX; cx += stepX;
    } else {
      if (tMaxZ > 1) break;
      tMaxZ += tDeltaZ; cz += stepZ;
    }
  }
}

const losRaycaster = new THREE.Raycaster();
function hasLineOfSight(posA, posB) {
  if (losGridCount !== wallMeshesForLOS.length) syncLOSGrid();
  const origin = new THREE.Vector3(posA.x, 1.5, posA.z);
  const target = new THREE.Vector3(posB.x, 1.5, posB.z);
  const dir = target.clone().sub(origin);
  const dist = dir.length();
  dir.normalize();
  gatherLOSCandidates(origin.x, origin.z, target.x, target.z);
  losRaycaster.set(origin, dir);
  losRaycaster.far = dist;
  const hits = losRaycaster.intersectObjects(losCandidates, false);
  return hits.length === 0;
}

const ZONE_STAGES = [
  { waitSec: 75, shrinkSec: 60, targetR: 460, dps: 1.0 },
  { waitSec: 55, shrinkSec: 50, targetR: 260, dps: 1.8 },
  { waitSec: 45, shrinkSec: 45, targetR: 135, dps: 3.0 },
  { waitSec: 35, shrinkSec: 40, targetR: 65,  dps: 5.0 },
  { waitSec: 30, shrinkSec: 35, targetR: 22,  dps: 8.0 }
];

const zoneState = {
  cx: (Math.random() - 0.5) * 240,
  cz: (Math.random() - 0.5) * 240,
  curR: 780,
  startR: 780,
  targetR: ZONE_STAGES[0].targetR,
  stageIdx: 0,
  mode: "waiting",
  timerSec: ZONE_STAGES[0].waitSec,
  dps: ZONE_STAGES[0].dps
};
blueZoneMesh.scale.set(zoneState.curR, 1, zoneState.curR);
blueZoneMesh.position.set(zoneState.cx, 90, zoneState.cz);

function formatMMSS(sec) {
  const s = Math.max(0, Math.ceil(sec));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m < 10 ? "0" + m : m}:${rem < 10 ? "0" + rem : rem}`;
}

const actionBtn = document.getElementById("action-center-btn");
function jumpFromPlane() {
  if (player.phase === "plane") {
    player.phase = "sky";
    playerRig.position.copy(planeGroup.position).add(new THREE.Vector3(0, -3, 0));
    actionBtn.innerText = "🪂 立即开伞 (F)";
    sfx.playBoltAction();
  } else if (player.phase === "sky") {
    player.phase = "chute";
    actionBtn.style.display = "none";
    sfx.playBoltAction();
  }
}
actionBtn.addEventListener("touchstart", e => { e.preventDefault(); jumpFromPlane(); }, { passive: false });
actionBtn.addEventListener("click", jumpFromPlane);

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

  const allTargets = [...aiHitboxes, ...shootableEnvironment];
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
    const hits = raycaster.intersectObjects(allTargets, false);

    if (hits.length > 0) {
      const hit = hits[0];
      if (hit.object.userData && hit.object.userData.isAI) {
        const bot = hit.object.userData.bot;
        if (bot.alive) {
          anyHit = true;
          const isHead = hit.object.userData.isHead;
          if (isHead) anyHeadshot = true;
          const rawDmg = base.type === "SG" ? base.dmgPerPellet : base.dmg;
          const finalDmg = Math.round(rawDmg * (isHead ? 2.35 : 1.0) * (1 - bot.armorReduction));
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

// ============================================================================
// 7. 淘汰播报与死亡盒掉落
// ============================================================================
const deathCrateGeo = new THREE.BoxGeometry(0.95, 0.45, 0.65);
const deathCrateMat = new THREE.MeshLambertMaterial({ color: 0xa8743f, map: woodTex });

function killAIBot(bot, killerName, weaponName, isHeadshot, byPlayer = false) {
  if (!bot.alive) return;
  bot.alive = false;
  bot.group.visible = false;

  const crate = new THREE.Mesh(deathCrateGeo, deathCrateMat);
  crate.position.set(bot.group.position.x, 0.23, bot.group.position.z);
  crate.castShadow = true;
  scene.add(crate);
  freezeObject(crate);

  const bx = bot.group.position.x, bz = bot.group.position.z;
  if (bot.weaponKey) {
    spawnRandomGroundLoot(bx + 0.35, bz, {
      kind: "weapon", id: bot.weaponKey, name: WEAPONS_DATA[bot.weaponKey].name,
      ammoInMag: WEAPONS_DATA[bot.weaponKey].mag, attachments: {}
    });
  }
  spawnRandomGroundLoot(bx - 0.35, bz + 0.25);

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

function damagePlayer(dmg, attackerName, wepName) {
  if (player.phase === "dead") return;
  let actual = dmg;
  if (attackerName !== "电网蓝圈 (Blue Zone)" && player.vest && player.vest.dur > 0) {
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
    if (oldWep) {
      spawnRandomGroundLoot(
        playerRig.position.x + (Math.random() - 0.5) * 1.2,
        playerRig.position.z + (Math.random() - 0.5) * 1.2,
        { kind: "weapon", id: oldWep.id, name: oldWep.name, ammoInMag: oldWep.ammoInMag, attachments: oldWep.attachments }
      );
    }
    player.weapons[targetSlot] = {
      id: it.id,
      name: it.name.replace("🔥", ""),
      ammoInMag: it.ammoInMag,
      fireMode: WEAPONS_DATA[it.id].modes[0],
      attachments: it.attachments || {}
    };
    player.activeSlot = targetSlot;
    rebuildFPGunModel();
    if (player.isADS) updateScopeState();
  } else if (it.kind === "ammo") {
    const unitW = AMMO_WEIGHT[it.id] || 0.5;
    const availSpace = player.maxCap - curWeight;
    const maxCanTake = Math.floor(availSpace / unitW);
    if (maxCanTake <= 0) {
      showToast("⚠️ 背包容量已满！请先打开背包丢弃多余物品");
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

  scene.remove(lootEntry.mesh);
  worldLootItems.splice(idx, 1);
  sfx.playBoltAction();
  updateAllHUD();
  if (document.getElementById("backpack-modal").style.display === "flex") renderBackpackModal();
}

window.dropAttachmentFromBag = function(attIndex) {
  const att = player.attBag[attIndex];
  if (!att) return;
  player.attBag.splice(attIndex, 1);
  spawnRandomGroundLoot(
    playerRig.position.x + (Math.random() - 0.5) * 1.4,
    playerRig.position.z + (Math.random() - 0.5) * 1.4,
    { kind: "attachment", id: att.id, name: att.name, slot: att.slot }
  );
  sfx.playBoltAction();
  updateAllHUD();
  renderBackpackModal();
};

window.dropMedFromBag = function(medId) {
  if ((player.medBag[medId] || 0) <= 0) return;
  player.medBag[medId]--;
  spawnRandomGroundLoot(
    playerRig.position.x + (Math.random() - 0.5) * 1.4,
    playerRig.position.z + (Math.random() - 0.5) * 1.4,
    { kind: "med", id: medId, name: MEDS_DATA[medId].name, count: 1 }
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
    { kind: "ammo", id: ammoKey, name: `${ammoKey} 子弹`, count: amount }
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
  return worldLootItems.filter(e => Math.hypot(e.x - px, e.z - pz) < 3.8);
}

// ============================================================================
// 9. 端游倍镜与专属机瞄 SVG 渲染器
// ============================================================================
function buildScopeOrIronSightSVG(wep, scopeId) {
  const wData = WEAPONS_DATA[wep.id];
  const ironType = wData.ironType || "ar_ring";

  const railBase = `
    <path d="M335,450 L355,345 L445,345 L465,450 Z" fill="#1b1e23" stroke="#0e1012" stroke-width="2"/>
    <rect x="364" y="352" width="72" height="8" rx="2" fill="#2c3138"/>
    <rect x="362" y="368" width="76" height="8" rx="2" fill="#2c3138"/>
    <rect x="360" y="384" width="80" height="8" rx="2" fill="#2c3138"/>
    <rect x="358" y="400" width="84" height="8" rx="2" fill="#2c3138"/>
    <text x="400" y="340" fill="rgba(220,230,240,0.45)" font-size="8" text-anchor="middle">Zeroing Distance 100m</text>
  `;

  if (scopeId === "iron") {
    if (ironType === "ak") {
      return `
        ${railBase}
        <path d="M295,355 L350,245 L388,245 L388,262 L412,262 L412,245 L450,245 L505,355 Z" fill="#181a1d" stroke="#090a0c" stroke-width="2"/>
        <path d="M372,245 C365,205 375,188 382,188 L386,245 Z" fill="#141619"/>
        <path d="M428,245 C435,205 425,188 418,188 L414,245 Z" fill="#141619"/>
        <rect x="397" y="225" width="6" height="36" fill="#0d0e10"/>
        <circle cx="400" cy="225" r="2.2" fill="#ff3b20"/>
      `;
    } else if (ironType === "scar") {
      return `
        <path d="M330,450 L350,340 L450,340 L470,450 Z" fill="#7c6b4f" stroke="#3a3122" stroke-width="2"/>
        <circle cx="400" cy="225" r="54" fill="none" stroke="#232528" stroke-width="12"/>
        <path d="M362,275 L370,192 L378,192 L374,275 Z" fill="#1e2022"/>
        <path d="M438,275 L430,192 L422,192 L426,275 Z" fill="#1e2022"/>
        <rect x="397.5" y="225" width="5" height="52" fill="#151618"/>
        <circle cx="400" cy="225" r="2.2" fill="#00ff66"/>
      `;
    } else if (ironType === "sr") {
      return `
        <path d="M350,450 L372,300 L428,300 L450,450 Z" fill="#3a2718" stroke="#1a110a" stroke-width="2"/>
        <path d="M365,305 L392,240 L408,240 L435,305 Z" fill="#1a1c1e"/>
        <circle cx="400" cy="225" r="28" fill="none" stroke="#181a1c" stroke-width="5"/>
        <polygon points="397,255 400,224 403,255" fill="#111"/>
        <circle cx="400" cy="225" r="1.8" fill="#ff3311"/>
      `;
    } else if (ironType === "smg") {
      return `
        ${railBase}
        <circle cx="400" cy="225" r="44" fill="none" stroke="#1c1f24" stroke-width="11"/>
        <path d="M376,264 L382,205 L388,205 L384,264 Z" fill="#16181c"/>
        <path d="M424,264 L418,205 L412,205 L416,264 Z" fill="#16181c"/>
        <rect x="397.5" y="225" width="5" height="42" fill="#121417"/>
        <circle cx="400" cy="225" r="2.2" fill="#00ff66"/>
      `;
    } else if (ironType === "sg_bead") {
      return `
        <path d="M355,450 L382,232 L418,232 L445,450 Z" fill="#24272b" stroke="#111" stroke-width="2"/>
        <rect x="394" y="232" width="12" height="218" fill="#16181a"/>
        <circle cx="400" cy="225" r="3.5" fill="#ffcc33" stroke="#000" stroke-width="1"/>
      `;
    } else {
      return `
        ${railBase}
        <circle cx="400" cy="225" r="64" fill="none" stroke="#1d2025" stroke-width="13"/>
        <path d="M362,284 L373,192 L381,192 L375,284 Z" fill="#171a1e"/>
        <path d="M438,284 L427,192 L419,192 L425,284 Z" fill="#171a1e"/>
        <rect x="397" y="225" width="6" height="60" fill="#121417"/>
        <circle cx="400" cy="225" r="2.2" fill="#00ff66"/>
      `;
    }
  }

  if (scopeId === "reddot") {
    return `
      ${railBase}
      <rect x="342" y="268" width="116" height="82" rx="8" fill="#1c2026" stroke="#0d0f12" stroke-width="2.5"/>
      <rect x="352" y="276" width="96" height="32" rx="4" fill="#252a32"/>
      <path d="M350,272 C332,162 468,162 450,272 Z" fill="rgba(160,210,230,0.05)" stroke="#181b20" stroke-width="11" stroke-linejoin="round"/>
      <circle cx="400" cy="225" r="3.2" fill="#ff1e1e" filter="drop-shadow(0 0 5px #ff0000)"/>
    `;
  }

  if (scopeId === "holo") {
    return `
      ${railBase}
      <path d="M312,355 L322,128 Q325,110 345,110 L455,110 Q475,110 478,128 L488,355 Z" fill="#15181c" stroke="#090b0d" stroke-width="3"/>
      <rect x="345" y="138" width="110" height="106" rx="12" fill="rgba(10,15,20,0.12)" stroke="#272c33" stroke-width="5"/>
      <circle cx="400" cy="285" r="14" fill="#20242a" stroke="#0d0f12" stroke-width="2"/>
      <text x="400" y="289" fill="#7c8591" font-size="10" font-weight="bold" text-anchor="middle">NV</text>
      <rect x="352" y="298" width="28" height="16" rx="2" fill="#1d2127" stroke="#0e1013" stroke-width="1.5"/>
      <rect x="420" y="298" width="28" height="16" rx="2" fill="#1d2127" stroke="#0e1013" stroke-width="1.5"/>
      <text x="400" y="312" fill="#68707a" font-size="9" font-weight="bold" text-anchor="middle">- OFF -</text>
      <circle cx="364" cy="332" r="10" fill="#101215" stroke="#2c313a" stroke-width="1.5"/>
      <circle cx="436" cy="332" r="10" fill="#101215" stroke="#2c313a" stroke-width="1.5"/>
      <circle cx="400" cy="225" r="16" fill="none" stroke="#ff261b" stroke-width="1.6" stroke-dasharray="7 2.5"/>
      <circle cx="400" cy="225" r="2.0" fill="#ff261b"/>
    `;
  }

  if (scopeId === "2x") {
    return `
      ${railBase}
      <circle cx="478" cy="118" r="38" fill="#1a1d22" stroke="#0b0d0f" stroke-width="3"/>
      <rect x="485" y="185" width="46" height="68" rx="6" fill="#181b20" stroke="#0b0d0f" stroke-width="2.5"/>
      <rect x="365" y="88" width="70" height="32" rx="4" fill="#1a1d22" stroke="#0b0d0f" stroke-width="2"/>
      <circle cx="400" cy="225" r="108" fill="rgba(180,220,200,0.04)" stroke="#16191e" stroke-width="34"/>
      <circle cx="400" cy="225" r="92" fill="none" stroke="#2b3038" stroke-width="3"/>
      <circle cx="400" cy="225" r="11" fill="none" stroke="#33ff55" stroke-width="1.8"/>
      <circle cx="400" cy="225" r="2.0" fill="#33ff55"/>
      <line x1="400" y1="238" x2="400" y2="295" stroke="#111" stroke-width="1.8"/>
    `;
  }

  if (scopeId === "3x" || scopeId === "4x") {
    return `
      ${railBase}
      <rect x="348" y="42" width="104" height="38" rx="4" fill="#111317" stroke="#000" stroke-width="2"/>
      <text x="400" y="65" fill="#99a3ad" font-size="8" letter-spacing="4" text-anchor="middle">NW  N  NE  E</text>
      <circle cx="295" cy="135" r="32" fill="#121418"/>
      <circle cx="505" cy="135" r="32" fill="#121418"/>
      <rect x="515" y="185" width="42" height="82" rx="6" fill="#121418"/>
      <circle cx="288" cy="295" r="34" fill="#121418"/>
      <circle cx="512" cy="295" r="34" fill="#121418"/>
      <path d="M376,315 L382,252 L388,252 L385,315 Z" fill="rgba(18,20,24,0.68)"/>
      <path d="M424,315 L418,252 L412,252 L415,315 Z" fill="rgba(18,20,24,0.68)"/>
      <rect x="397" y="258" width="6" height="58" fill="rgba(18,20,24,0.68)"/>
      <circle cx="400" cy="225" r="136" fill="rgba(150,195,210,0.05)" stroke="#111317" stroke-width="58"/>
      <line x1="295" y1="225" x2="382" y2="225" stroke="#111" stroke-width="1.5"/>
      <line x1="418" y1="225" x2="505" y2="225" stroke="#111" stroke-width="1.5"/>
      <line x1="400" y1="238" x2="400" y2="325" stroke="#111" stroke-width="1.6"/>
      <line x1="393" y1="248" x2="407" y2="248" stroke="#111" stroke-width="1.5"/>
      <line x1="395" y1="262" x2="405" y2="262" stroke="#111" stroke-width="1.5"/>
      <line x1="396" y1="276" x2="404" y2="276" stroke="#111" stroke-width="1.5"/>
      <path d="M393,230 L400,222 L407,230" fill="none" stroke="#ff2211" stroke-width="2.5"/>
      <circle cx="400" cy="225" r="2.2" fill="#ff2211"/>
    `;
  }

  return `
    <path d="M372,395 L380,315 L387,315 L384,395 Z" fill="rgba(12,14,18,0.88)"/>
    <path d="M428,395 L420,315 L413,315 L416,395 Z" fill="rgba(12,14,18,0.88)"/>
    <path d="M368,395 L432,395 L440,450 L360,450 Z" fill="#0d0f12"/>
    <circle cx="400" cy="225" r="215" fill="none" stroke="#0d0f13" stroke-width="95"/>
    <circle cx="400" cy="225" r="172" fill="none" stroke="#1a1e24" stroke-width="6"/>
    <line x1="230" y1="225" x2="570" y2="225" stroke="#111" stroke-width="1.3"/>
    <line x1="400" y1="150" x2="400" y2="380" stroke="#111" stroke-width="1.3"/>
    <line x1="394" y1="245" x2="406" y2="245" stroke="#111" stroke-width="1.3"/>
    <line x1="395" y1="265" x2="405" y2="265" stroke="#111" stroke-width="1.3"/>
    <line x1="393" y1="285" x2="407" y2="285" stroke="#111" stroke-width="1.3"/>
    <line x1="396" y1="305" x2="404" y2="305" stroke="#111" stroke-width="1.3"/>
    <circle cx="400" cy="225" r="2.2" fill="#ff1a1a"/>
  `;
}

function updateScopeState() {
  const curWep = player.weapons[player.activeSlot];
  if (!curWep || !player.isADS || player.phase !== "ground") {
    document.getElementById("hip-crosshair").style.display = "block";
    document.getElementById("ads-scope").style.display = "none";
    fpGunGroup.visible = true;
    camera.fov = 75;
    camera.updateProjectionMatrix();
    updateAllHUD();
    return;
  }

  document.getElementById("hip-crosshair").style.display = "none";
  document.getElementById("sg-circle").style.display = "none";
  document.getElementById("ads-scope").style.display = "flex";
  fpGunGroup.visible = false;

  const scopeId = curWep.attachments.scope || "iron";
  const svg = document.getElementById("scope-svg");

  if (scopeId === "iron") {
    camera.fov = 65;
  } else {
    const att = ATTACHMENTS_DATA[scopeId];
    camera.fov = att ? att.fov : 55;
  }
  svg.innerHTML = buildScopeOrIronSightSVG(curWep, scopeId);
  camera.updateProjectionMatrix();
}

// ============================================================================
// 10. HUD 与小地图
// ============================================================================
function cycleWeaponFireMode(slotIdx) {
  const wep = player.weapons[slotIdx];
  if (!wep) return;
  const modes = WEAPONS_DATA[wep.id].modes;
  if (modes.length <= 1) {
    showToast(`${wep.name} 仅支持单种射击模式`);
    return;
  }
  wep.fireMode = modes[(modes.indexOf(wep.fireMode) + 1) % modes.length];
  const modeNames = { auto: "全自动", burst: "连发", single: "单发", bolt: "拉栓" };
  sfx.playBoltAction();
  showToast(`🔫 ${wep.name} 切换为: ${modeNames[wep.fireMode]}`);
  updateAllHUD();
}

function updateAllHUD() {
  document.getElementById("hp-bar-fill").style.width = `${player.hp}%`;
  document.getElementById("hp-text").innerText = `HP ${Math.round(player.hp)} / 100`;
  document.getElementById("boost-bar-fill").style.width = `${player.boost}%`;

  const usedW = getUsedBagWeight();
  document.getElementById("hud-helm").innerText = player.helm ? `🪖Lv${player.helm.lv}(${Math.round(player.helm.dur)})` : "🪖无";
  document.getElementById("hud-vest").innerText = player.vest ? `🦺Lv${player.vest.lv}(${Math.round(player.vest.dur)})` : "🦺无";
  document.getElementById("hud-bag").innerText = `🎒Lv${player.bagLv}(${usedW}/${player.maxCap})`;

  const modeNames = { auto: "全自动", burst: "连发", single: "单发", bolt: "拉栓" };
  [0, 1].forEach(idx => {
    const w = player.weapons[idx];
    const slotEl = document.getElementById("slot-wep-" + idx);
    slotEl.classList.toggle("active", player.activeSlot === idx);
    if (!w) {
      document.getElementById("wep-name-" + idx).innerText = `${idx + 1}: 空置`;
      document.getElementById("wep-mode-" + idx).innerText = "--";
      document.getElementById("wep-ammo-" + idx).innerText = "--";
    } else {
      const b = WEAPONS_DATA[w.id];
      const st = getActiveWeaponEffectiveStats(w);
      const reserve = player.ammoBag[b.ammoType] || 0;
      document.getElementById("wep-name-" + idx).innerText = `${idx + 1}:${w.name}`;
      document.getElementById("wep-mode-" + idx).innerText = st.hasBumpStock ? "撞火" : (modeNames[w.fireMode] || "单发");
      document.getElementById("wep-ammo-" + idx).innerText = `${w.ammoInMag}/${reserve}`;
    }
  });

  const curWep = player.weapons[player.activeSlot];
  const sgCircle = document.getElementById("sg-circle");
  if (curWep) {
    const b = WEAPONS_DATA[curWep.id];
    const st = getActiveWeaponEffectiveStats(curWep);
    document.getElementById("slot-firemode").innerText = st.hasBumpStock ? "撞火" : (modeNames[curWep.fireMode] || "单发");
    if (b.type === "SG" && !player.isADS) {
      sgCircle.style.display = "block";
      const isDuck = curWep.attachments.sg_muzzle === "duckbill";
      sgCircle.style.width = isDuck ? "68px" : "46px";
      sgCircle.style.height = isDuck ? "22px" : "46px";
    } else {
      sgCircle.style.display = "none";
    }
  } else {
    document.getElementById("slot-firemode").innerText = "拳头";
    sgCircle.style.display = "none";
  }

  const healOrder = ["firstaid", "medkit", "bandage", "painkiller", "drink", "adrenaline"];
  const availMed = healOrder.find(k => (player.medBag[k] || 0) > 0);
  document.getElementById("quick-heal-name").innerText = availMed
    ? `${MEDS_DATA[availMed].name}(${player.medBag[availMed]})`
    : "无药";
}

const mmCanvas = document.getElementById("minimap-canvas");
const mmCtx = mmCanvas.getContext("2d");
document.getElementById("minimap-box").addEventListener("click", () => {
  minimapZoomOut = !minimapZoomOut;
});

function drawMinimap() {
  const W = 96, H = 96;
  mmCtx.fillStyle = "#2b3727";
  mmCtx.fillRect(0, 0, W, H);

  const viewSpan = minimapZoomOut ? MAP_SIZE : 320;
  const scale = W / viewSpan;
  const centerX = minimapZoomOut ? 0 : playerRig.position.x;
  const centerZ = minimapZoomOut ? 0 : playerRig.position.z;

  const toX = wx => W / 2 + (wx - centerX) * scale;
  const toZ = wz => H / 2 + (wz - centerZ) * scale;

  mmCtx.fillStyle = "#26597a";
  mmCtx.fillRect(0, toZ(165 - 19), W, 38 * scale);

  mmCtx.fillStyle = "#484a4c";
  mmCtx.fillRect(0, toZ(-8), W, 16 * scale);
  mmCtx.fillRect(toX(-8), 0, 16 * scale, H);

  mmCtx.fillStyle = "#b08d6a";
  buildingFootprints.forEach(b => {
    mmCtx.fillRect(toX(b.cx - b.w / 2), toZ(b.cz - b.d / 2), b.w * scale, b.d * scale);
  });

  airdrops.forEach(ad => {
    const ax = toX(ad.x), az = toZ(ad.z);
    mmCtx.fillStyle = "#ff2211";
    mmCtx.fillRect(ax - 3, az - 3, 6, 6);
    mmCtx.strokeStyle = "#ffffff";
    mmCtx.lineWidth = 1;
    mmCtx.strokeRect(ax - 3, az - 3, 6, 6);
  });

  mmCtx.strokeStyle = "#ffffff";
  mmCtx.lineWidth = 1.1;
  mmCtx.beginPath();
  mmCtx.arc(toX(zoneState.cx), toZ(zoneState.cz), zoneState.targetR * scale, 0, Math.PI * 2);
  mmCtx.stroke();

  mmCtx.strokeStyle = "#00aaff";
  mmCtx.lineWidth = 1.5;
  mmCtx.beginPath();
  mmCtx.arc(toX(zoneState.cx), toZ(zoneState.cz), zoneState.curR * scale, 0, Math.PI * 2);
  mmCtx.stroke();

  const now = performance.now();
  for (let i = radarSoundMarkers.length - 1; i >= 0; i--) {
    const m = radarSoundMarkers[i];
    const age = now - m.born;
    if (age > m.maxAge) {
      radarSoundMarkers.splice(i, 1);
      continue;
    }
    const alpha = Math.max(0, 1 - age / m.maxAge);
    const sx = Math.max(6, Math.min(W - 6, toX(m.x)));
    const sz = Math.max(6, Math.min(H - 6, toZ(m.z)));
    const angleFromPlayer = Math.atan2(m.z - playerRig.position.z, m.x - playerRig.position.x);

    if (m.type === "shot") {
      mmCtx.strokeStyle = `rgba(255, 45, 25, ${alpha})`;
      mmCtx.lineWidth = 2.6;
      mmCtx.beginPath();
      mmCtx.arc(W / 2, H / 2, 40, angleFromPlayer - 0.28, angleFromPlayer + 0.28);
      mmCtx.stroke();

      mmCtx.fillStyle = `rgba(255, 60, 30, ${alpha})`;
      mmCtx.beginPath();
      mmCtx.arc(sx, sz, 3.2, 0, Math.PI * 2);
      mmCtx.fill();
    } else {
      const rWave = 2.5 + (age / m.maxAge) * 6.5;
      mmCtx.strokeStyle = `rgba(255, 195, 40, ${alpha})`;
      mmCtx.lineWidth = 1.4;
      mmCtx.beginPath();
      mmCtx.arc(sx, sz, rWave, 0, Math.PI * 2);
      mmCtx.stroke();

      mmCtx.fillStyle = `rgba(255, 180, 0, ${alpha})`;
      mmCtx.beginPath();
      mmCtx.arc(sx, sz, 2.0, 0, Math.PI * 2);
      mmCtx.fill();
    }
  }

  const px = toX(playerRig.position.x);
  const pz = toZ(playerRig.position.z);
  mmCtx.fillStyle = "#00ff66";
  mmCtx.beginPath();
  mmCtx.arc(px, pz, 2.8, 0, Math.PI * 2);
  mmCtx.fill();
  mmCtx.strokeStyle = "#00ff66";
  mmCtx.lineWidth = 1.3;
  mmCtx.beginPath();
  mmCtx.moveTo(px, pz);
  mmCtx.lineTo(px - Math.sin(yaw) * 7.5, pz - Math.cos(yaw) * 7.5);
  mmCtx.stroke();
}

// ============================================================================
// 11. 触控与键鼠绑定
// ============================================================================
function startTrigger() {
  if (player.phase !== "ground") return;
  const wep = player.weapons[player.activeSlot];
  if (!wep) { fireCurrentWeapon(); return; }

  const st = getActiveWeaponEffectiveStats(wep);
  const mode = st.hasBumpStock ? "auto" : wep.fireMode;

  player.isFiring = true;
  if (mode === "single" || mode === "bolt") {
    fireCurrentWeapon();
    player.isFiring = false;
  } else if (mode === "burst") {
    player.burstRemaining = wep.id === "mk47" ? 2 : 3;
  }
}

function stopTrigger() {
  player.isFiring = false;
  player.consecutiveShots = 0;
}

// ---------------------------------------------------------------------------
// 视角灵敏度：
//  · 触屏基础灵敏度约为原版的 58%（原版 0.0045 弧度/像素，轻轻一划就转 90°）
//  · 垂直方向不再额外放大 1.25 倍（原版上下特别飘）
//  · 开镜灵敏度按倍镜视野自动缩放：8 倍镜不再一碰就甩飞
//  · 轻微触屏加速曲线：慢拖精细微调，快速甩动依然跟手
//  · 设置面板可再调整 0.3x ~ 2.0x
// ---------------------------------------------------------------------------
const TOUCH_LOOK_BASE = 0.0026;
const MOUSE_LOOK_BASE = 0.0028;

function applyLookDelta(dx, dy, baseSens, accel = 1) {
  let sens = baseSens * gameSettings.lookSens * accel;
  if (player.isADS) sens *= (camera.fov / 75) * gameSettings.adsSens * 1.1;
  yaw -= dx * sens;
  pitch -= dy * sens;
  pitch = Math.max(-Math.PI / 2.05, Math.min(Math.PI / 2.05, pitch));
}

function touchLookAccel(dx, dy, dtMs) {
  const speed = Math.hypot(dx, dy) / Math.max(dtMs, 8); // 像素/毫秒
  return 0.72 + 0.48 * smoothstep(0.1, 1.4, speed);
}

function bindFireDragButton(btnId) {
  const btn = document.getElementById(btnId);
  let touchId = null, lastX = 0, lastY = 0, lastT = 0;

  btn.addEventListener("touchstart", e => {
    e.preventDefault(); e.stopPropagation();
    const t = e.changedTouches[0];
    touchId = t.identifier; lastX = t.clientX; lastY = t.clientY; lastT = e.timeStamp;
    btn.classList.add("pressing");
    startTrigger();
  }, { passive: false });

  btn.addEventListener("touchmove", e => {
    e.preventDefault(); e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === touchId) {
        const dx = t.clientX - lastX, dy = t.clientY - lastY;
        lastX = t.clientX; lastY = t.clientY;
        applyLookDelta(dx, dy, TOUCH_LOOK_BASE, touchLookAccel(dx, dy, e.timeStamp - lastT));
        lastT = e.timeStamp;
      }
    }
  }, { passive: false });

  const endFn = e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === touchId) {
        touchId = null; btn.classList.remove("pressing"); stopTrigger();
      }
    }
  };
  btn.addEventListener("touchend", endFn);
  btn.addEventListener("touchcancel", endFn);
}
bindFireDragButton("btn-fire-left");
bindFireDragButton("btn-fire-right");

let lookTouchId = null, lookLastX = 0, lookLastY = 0, lookLastT = 0;
renderer.domElement.addEventListener("touchstart", e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (lookTouchId === null && t.clientX > window.innerWidth * 0.22) {
      lookTouchId = t.identifier; lookLastX = t.clientX; lookLastY = t.clientY; lookLastT = e.timeStamp;
    }
  }
}, { passive: false });

renderer.domElement.addEventListener("touchmove", e => {
  e.preventDefault();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === lookTouchId) {
      const dx = t.clientX - lookLastX, dy = t.clientY - lookLastY;
      lookLastX = t.clientX; lookLastY = t.clientY;
      applyLookDelta(dx, dy, TOUCH_LOOK_BASE, touchLookAccel(dx, dy, e.timeStamp - lookLastT));
      lookLastT = e.timeStamp;
    }
  }
}, { passive: false });

const endLookTouch = e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
  }
};
renderer.domElement.addEventListener("touchend", endLookTouch);
renderer.domElement.addEventListener("touchcancel", endLookTouch);

const joyZone = document.getElementById("joystick-zone");
const joyKnob = document.getElementById("joystick-knob");
let joyTouchId = null, moveVec = { x: 0, z: 0 };

// 摇杆：行程随按钮缩放自适应、12% 中心死区、外圈 85% 以上直接满速（原版 28px 行程，手指轻微抖动就满速乱跑）
const JOY_DEADZONE = 0.12;
function updateJoystickFromTouch(t) {
  const rect = joyZone.getBoundingClientRect();
  const scale = rect.width / (joyZone.offsetWidth || rect.width) || 1;
  const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
  const maxR = joyZone.offsetWidth * 0.36;
  let dx = (t.clientX - cx) / scale, dy = (t.clientY - cy) / scale;
  const dist = Math.hypot(dx, dy);
  if (dist > maxR) { dx = (dx / dist) * maxR; dy = (dy / dist) * maxR; }
  joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  const mag = Math.min(1, dist / maxR);
  if (mag < JOY_DEADZONE) { moveVec.x = 0; moveVec.z = 0; return; }
  let m = (mag - JOY_DEADZONE) / (1 - JOY_DEADZONE);
  if (m > 0.85) m = 1;
  moveVec.x = (dx / Math.max(dist, 0.001)) * m;
  moveVec.z = (dy / Math.max(dist, 0.001)) * m;
}

joyZone.addEventListener("touchstart", e => {
  e.preventDefault(); e.stopPropagation();
  joyTouchId = e.changedTouches[0].identifier;
  updateJoystickFromTouch(e.changedTouches[0]);
}, { passive: false });

joyZone.addEventListener("touchmove", e => {
  e.preventDefault(); e.stopPropagation();
  for (let i = 0; i < e.changedTouches.length; i++) {
    const t = e.changedTouches[i];
    if (t.identifier === joyTouchId) updateJoystickFromTouch(t);
  }
}, { passive: false });

const endJoy = e => {
  for (let i = 0; i < e.changedTouches.length; i++) {
    if (e.changedTouches[i].identifier === joyTouchId) {
      joyTouchId = null;
      joyKnob.style.transform = "translate(0px, 0px)";
      moveVec.x = 0; moveVec.z = 0;
    }
  }
};
joyZone.addEventListener("touchend", endJoy);
joyZone.addEventListener("touchcancel", endJoy);

function bindInstantTouchButton(btnId, actionFn) {
  const el = document.getElementById(btnId);
  let lastTrigger = 0;
  const trigger = e => {
    e.preventDefault();
    e.stopPropagation();
    const now = performance.now();
    if (now - lastTrigger < 120) return;
    lastTrigger = now;
    actionFn();
  };
  el.addEventListener("touchstart", trigger, { passive: false });
  el.addEventListener("click", trigger);
}

bindInstantTouchButton("btn-jump", () => {
  if (player.phase === "ground" && player.velY === 0) {
    player.stance = "stand";
    player.velY = 6.8;
  }
});
bindInstantTouchButton("btn-ads", () => {
  player.reopenADSAfterBolt = false;
  player.isADS = !player.isADS;
  updateScopeState();
});
bindInstantTouchButton("btn-reload", reloadActiveWeapon);
bindInstantTouchButton("btn-crouch", () => {
  player.stance = player.stance === "crouch" ? "stand" : "crouch";
});
bindInstantTouchButton("btn-prone", () => {
  player.stance = player.stance === "prone" ? "stand" : "prone";
});
bindInstantTouchButton("btn-bag", () => {
  renderBackpackModal();
  document.getElementById("backpack-modal").style.display = "flex";
});
bindInstantTouchButton("btn-heal-quick", () => {
  const healOrder = ["firstaid", "medkit", "bandage", "painkiller", "drink", "adrenaline"];
  const avail = healOrder.find(k => (player.medBag[k] || 0) > 0);
  if (avail) window.useMedItem(avail);
});

bindInstantTouchButton("slot-wep-0", () => {
  if (player.activeSlot === 0) {
    cycleWeaponFireMode(0);
  } else {
    player.activeSlot = 0; player.isADS = false; player.reopenADSAfterBolt = false;
    rebuildFPGunModel(); updateScopeState(); updateAllHUD();
  }
});
bindInstantTouchButton("slot-wep-1", () => {
  if (player.activeSlot === 1) {
    cycleWeaponFireMode(1);
  } else {
    player.activeSlot = 1; player.isADS = false; player.reopenADSAfterBolt = false;
    rebuildFPGunModel(); updateScopeState(); updateAllHUD();
  }
});
bindInstantTouchButton("slot-firemode", () => {
  cycleWeaponFireMode(player.activeSlot);
});

document.getElementById("btn-close-bag").addEventListener("click", () => {
  document.getElementById("backpack-modal").style.display = "none";
});

const keysPressed = {};
window.addEventListener("keydown", e => {
  keysPressed[e.code] = true;
  if (e.code === "KeyF") jumpFromPlane();
  if (e.code === "KeyR") reloadActiveWeapon();
  if (e.code === "Space" && player.phase === "ground" && player.velY === 0) {
    player.stance = "stand"; player.velY = 6.8;
  }
  if (e.code === "Digit1") {
    if (player.activeSlot === 0) cycleWeaponFireMode(0);
    else { player.activeSlot = 0; player.isADS = false; rebuildFPGunModel(); updateScopeState(); updateAllHUD(); }
  }
  if (e.code === "Digit2") {
    if (player.activeSlot === 1) cycleWeaponFireMode(1);
    else { player.activeSlot = 1; player.isADS = false; rebuildFPGunModel(); updateScopeState(); updateAllHUD(); }
  }
  if (e.code === "KeyB") cycleWeaponFireMode(player.activeSlot);
  if (e.code === "KeyM") minimapZoomOut = !minimapZoomOut;
  if (e.code === "Tab") {
    e.preventDefault();
    const modal = document.getElementById("backpack-modal");
    if (modal.style.display === "flex") modal.style.display = "none";
    else { renderBackpackModal(); modal.style.display = "flex"; document.exitPointerLock?.(); }
  }
});
window.addEventListener("keyup", e => { keysPressed[e.code] = false; });

renderer.domElement.addEventListener("mousedown", e => {
  if (document.getElementById("backpack-modal").style.display === "flex") return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
    return;
  }
  if (e.button === 0) startTrigger();
  else if (e.button === 2) { player.reopenADSAfterBolt = false; player.isADS = !player.isADS; updateScopeState(); }
});
window.addEventListener("mouseup", e => { if (e.button === 0) stopTrigger(); });
window.addEventListener("contextmenu", e => e.preventDefault());
window.addEventListener("mousemove", e => {
  if (document.pointerLockElement === renderer.domElement) {
    applyLookDelta(e.movementX, e.movementY, MOUSE_LOOK_BASE);
  }
});

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

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);
  const now = performance.now();
  const elapsed = clock.getElapsedTime();
  updateAutoQuality(Math.min((now - lastFrameStamp) / 1000, 0.5));
  lastFrameStamp = now;
  quality.frameCounter++;

  // 空投刷新与降落
  if (elapsed >= nextAirdropTime) {
    nextAirdropTime = elapsed + 75;
    spawnAirdropEvent();
  }
  airdrops.forEach(ad => {
    if (!ad.landed) {
      ad.crateGroup.position.y -= 14 * dt;
      if (ad.crateGroup.position.y <= 0) {
        ad.crateGroup.position.y = 0;
        ad.landed = true;
        ad.chute.visible = false;
        ad.smokeEndTime = elapsed + 110;
        populateAirdropLoot(ad.x, ad.z);
        wallColliders2D.push({ minX: ad.x - 0.75, maxX: ad.x + 0.75, minZ: ad.z - 0.75, maxZ: ad.z + 0.75 });
      }
    } else if (elapsed < ad.smokeEndTime) {
      ad.smokeParticles.forEach((sp, idx) => {
        sp.material.opacity = 0.52;
        sp.position.y += 2.2 * dt;
        sp.position.x = ad.x + Math.sin(elapsed * 2 + idx) * 0.45;
        if (sp.position.y > 13) sp.position.y = 1.2;
      });
    } else {
      ad.smokeParticles.forEach(sp => { sp.material.opacity = 0; });
    }
  });

  if (planeGroup.visible) {
    planeGroup.position.x += 45 * dt;
    planeGroup.position.z += 42 * dt;
    if (player.phase === "plane") {
      playerRig.position.set(planeGroup.position.x - 14, planeGroup.position.y + 8, planeGroup.position.z - 14);
      if (planeGroup.position.x > 580) jumpFromPlane();
    }
    if (planeGroup.position.x > 750) planeGroup.visible = false;
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
    moveWithWallCollisions(playerRig.position, step.x, step.z, 0.5);

    if (player.phase === "sky" && playerRig.position.y <= 55) {
      player.phase = "chute";
      actionBtn.style.display = "none";
    }
    if (playerRig.position.y <= 1.7) {
      player.phase = "ground";
      playerRig.position.y = 1.7;
      actionBtn.style.display = "none";
      rebuildFPGunModel();
    }
  }

  if (player.phase === "ground") {
    let mx = moveVec.x, mz = moveVec.z;
    if (keysPressed["KeyW"]) mz = -1;
    if (keysPressed["KeyS"]) mz = 1;
    if (keysPressed["KeyA"]) mx = -1;
    if (keysPressed["KeyD"]) mx = 1;

    if (mx !== 0 || mz !== 0) {
      if (player.casting && player.casting.title.includes("💊")) cancelCastProgress();
      const boostSpeed = player.boost > 60 ? 1.12 : 1.0;
      const stanceSpeed = player.stance === "stand" ? 6.8 : (player.stance === "crouch" ? 4.4 : 2.3);
      const speed = stanceSpeed * boostSpeed * dt;
      const forward = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const moveDelta = new THREE.Vector3()
        .addScaledVector(forward, mz * speed)
        .addScaledVector(right, mx * speed);

      moveWithWallCollisions(playerRig.position, moveDelta.x, moveDelta.z, 0.48);
    }

    const baseHeight = player.stance === "stand" ? 1.7 : (player.stance === "crouch" ? 1.15 : 0.45);
    if (player.velY !== 0 || playerRig.position.y > baseHeight + 0.05) {
      playerRig.position.y += player.velY * dt;
      player.velY -= 18 * dt;
      if (playerRig.position.y <= baseHeight) {
        playerRig.position.y = baseHeight;
        player.velY = 0;
      }
    } else {
      playerRig.position.y += (baseHeight - playerRig.position.y) * 10 * dt;
    }

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
    fpGunGroup.position.z += (-0.48 - fpGunGroup.position.z) * 14 * dt;

    // 走路晃枪 + 转视角时枪身惯性滞后（只影响枪模显示，不影响准星与弹道）
    const movingNow = mx !== 0 || mz !== 0;
    gunBobPhase += dt * (movingNow ? (player.stance === "stand" ? 9.5 : 6.5) : 1.6);
    const bobAmp = movingNow ? 0.011 : 0.0025;
    const dYaw = angleDiff(yaw, lastSwayYaw), dPitch = pitch - lastSwayPitch;
    lastSwayYaw = yaw; lastSwayPitch = pitch;
    const swayK = Math.min(1, dt * 10);
    gunSwayX += (Math.max(-0.035, Math.min(0.035, dYaw * 0.5)) - gunSwayX) * swayK;
    gunSwayY += (Math.max(-0.03, Math.min(0.03, dPitch * 0.4)) - gunSwayY) * swayK;
    fpGunGroup.position.x = 0.24 + Math.sin(gunBobPhase) * bobAmp + gunSwayX;
    fpGunGroup.position.y = -0.22 + Math.abs(Math.cos(gunBobPhase)) * bobAmp * 0.8 - gunSwayY;
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

  // ============================================================================
  // AI 完整生命周期：飞机跳出 -> 高空俯冲 -> 开降落伞滑翔 -> 落地触须避障寻路 & 交火走位
  // ============================================================================
  aiPlayers.forEach(bot => {
    if (!bot.alive) return;

    // 阶段 A：到达跳伞时间，从运输机舱门跳出进入高空俯冲 (sky)
    if (bot.phase === "plane" && elapsed >= bot.dropTime) {
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
      const fallSpd = bot.phase === "sky" ? 38 : 13.5;
      const glideSpd = bot.phase === "sky" ? 26 : 18;
      bot.group.position.y -= fallSpd * dt;

      const toLandX = bot.landTarget.x - bot.group.position.x;
      const toLandZ = bot.landTarget.z - bot.group.position.z;
      const dist2D = Math.hypot(toLandX, toLandZ);
      if (dist2D > 1) {
        bot.group.position.x += (toLandX / dist2D) * glideSpd * dt;
        bot.group.position.z += (toLandZ / dist2D) * glideSpd * dt;
        bot.group.lookAt(bot.landTarget.x, bot.group.position.y, bot.landTarget.z);
      }

      // 高度降至 58m 自动打开降落伞
      if (bot.phase === "sky" && bot.group.position.y <= 58) {
        bot.phase = "chute";
        bot.chuteMesh.visible = true;
      }
      poseBotInAir(bot, bot.phase === "chute");
      // 伞衣随风轻微摆动
      if (bot.phase === "chute") bot.chuteMesh.rotation.z = Math.sin(now * 0.0016 + bot.wanderPhase) * 0.08;

      // 触地收伞，如果落在房顶则自动顺移到屋檐门外地面
      if (bot.group.position.y <= 0) {
        bot.group.position.y = 0;
        bot.phase = "ground";
        bot.chuteMesh.visible = false;
        const landedOnHouse = getBuildingContainingPoint(bot.group.position.x, bot.group.position.z, 0.8);
        if (landedOnHouse) {
          bot.group.position.set(landedOnHouse.southDoor.x, 0, landedOnHouse.southDoor.z);
        }
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
      const distToSafeCenter = Math.hypot(bot.group.position.x - zoneState.cx, bot.group.position.z - zoneState.cz);
      const isOutsideSafe = distToSafeCenter > zoneState.targetR * 0.90;
      const isInBlueZone = distToSafeCenter > zoneState.curR;
      const isAlerted = now < bot.alertUntil;
      const distToPlayer = bot.group.position.distanceTo(playerRig.position);
      const canSeePlayer = player.phase === "ground" && distToPlayer < 135 && hasLineOfSight(bot.group.position, playerRig.position);

      let moveGoal = bot.targetPos;
      let moveSpd = isInBlueZone ? 6.3 : 5.0;
      let moveMode = "patrol";

      // 1. 跑毒最高优先级
      if (isInBlueZone || (isOutsideSafe && !isAlerted)) {
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
        if (now > bot.nextStrafeFlip) {
          // 不规则节奏：多数时候反向横移，偶尔急停定点射击，偶尔继续同向长距离拉扯；近距离时左右晃得更快
          const r = Math.random();
          if (r < 0.2) bot.strafePauseUntil = now + 200 + Math.random() * 350;
          else if (r < 0.85) bot.strafeDir = -bot.strafeDir;
          bot.nextStrafeFlip = now + (distToPlayer < 20 ? 320 + Math.random() * 520 : 600 + Math.random() * 1400);
        }
        // 按手中武器保持交战距离：喷子/冲锋枪贴脸压近，狙击/连狙拉开距离，步枪中距离
        const wType = WEAPONS_DATA[bot.weaponKey].type;
        const prefRange = (wType === "SG" ? 10 : wType === "SMG" ? 18 : (wType === "SR" || wType === "DMR") ? 48 : 32) + bot.rangeBias;
        let strafeOffset = distToPlayer > 22 ? 1.15 : 1.55;
        if (distToPlayer > prefRange + 12) strafeOffset = 0.8;
        else if (distToPlayer < prefRange - 8) strafeOffset = 2.05;
        const angleToPlayer = Math.atan2(playerRig.position.x - bot.group.position.x, playerRig.position.z - bot.group.position.z);
        const strafeAngle = angleToPlayer + bot.strafeDir * strafeOffset;
        moveGoal = new THREE.Vector3(
          bot.group.position.x + Math.sin(strafeAngle) * 12,
          0,
          bot.group.position.z + Math.cos(strafeAngle) * 12
        );
        moveSpd = now < bot.strafePauseUntil ? 0 : 5.4;
      } else if (!bot.weaponKey) {
        moveMode = "loot";
        // 3. 没枪时寻找最近地面枪械（配合房门导航进屋拾取）
        let nearestWepLoot = null;
        let minDist = 9999;
        for (let i = 0; i < worldLootItems.length; i++) {
          const entry = worldLootItems[i];
          if (entry.item.kind === "weapon") {
            const d = Math.hypot(entry.x - bot.group.position.x, entry.z - bot.group.position.z);
            if (d < minDist) { minDist = d; nearestWepLoot = entry; }
          }
        }
        if (nearestWepLoot) {
          moveGoal = new THREE.Vector3(nearestWepLoot.x, 0, nearestWepLoot.z);
          if (minDist < 3.2) {
            bot.weaponKey = nearestWepLoot.item.id;
            bot.botGunMesh.visible = true;
            bot.armorReduction = 0.25;
            scene.remove(nearestWepLoot.mesh);
            const idx = worldLootItems.indexOf(nearestWepLoot);
            if (idx !== -1) worldLootItems.splice(idx, 1);
            bot.pauseUntil = now + 350 + Math.random() * 650; // 捡枪后短暂停顿（像真人在装备）
          }
        } else if (elapsed > bot.dropTime + 22) {
          bot.weaponKey = "ump45";
          bot.botGunMesh.visible = true;
        }
      } else if (bot.group.position.distanceTo(bot.targetPos) < 4.5) {
        // 4. 巡逻漫游：优先挑选安全区内的其它房区门口巡逻
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
      bot.wanderAmp = moveMode === "patrol" ? 0.26 : (moveMode === "zone" ? 0.14 : (moveMode === "loot" ? 0.08 : 0));

      // 执行 7向触须避障 + 房门导航移动（带转向/加减速惯性与个体速度差异）
      const movedDist = steerAndMoveAI(bot, moveGoal, moveSpd * bot.speedMul, dt);

      if (movedDist > 0.01 && now - bot.lastStepTime > 420) {
        bot.lastStepTime = now;
        if (distToPlayer < 38) {
          sfx.playFootstep(distToPlayer);
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
      animateBotBody(bot, dt, !!bot.weaponKey && isAlerted, distToPlayer, now);

      // AI 射击与反击逻辑
      const fireCooldown = isAlerted ? (650 + Math.random() * 550) : (1350 + Math.random() * 950);
      if (bot.weaponKey && now - bot.lastFireTime > fireCooldown) {
        const engageRange = isAlerted ? 135 : 78;
        const engageChance = isAlerted ? 0.88 : 0.42;

        if (player.phase === "ground" && distToPlayer < engageRange && Math.random() < engageChance && canSeePlayer) {
          bot.lastFireTime = now;
          bot.alertUntil = Math.max(bot.alertUntil, now + 6000);
          setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 700);
          sfx.playShot(false, 1.0, distToPlayer);
          registerRadarSound("shot", bot.group.position.x, bot.group.position.z, false);
          if (Math.random() < (isAlerted ? 0.34 : 0.25)) {
            damagePlayer(9 + Math.floor(Math.random() * 10), bot.name, WEAPONS_DATA[bot.weaponKey].name);
          }
        } else {
          const otherBot = aiPlayers.find(o =>
            o !== bot && o.alive && o.phase === "ground" &&
            o.group.position.distanceTo(bot.group.position) < 68 &&
            hasLineOfSight(bot.group.position, o.group.position)
          );
          if (otherBot && Math.random() < 0.32) {
            bot.lastFireTime = now;
            setBotFaceHint(bot, otherBot.group.position.x, otherBot.group.position.z, 900);
            sfx.playShot(false, 1.0, distToPlayer);
            registerRadarSound("shot", bot.group.position.x, bot.group.position.z, false);
            otherBot.hp -= 36;
            if (otherBot.hp <= 0) {
              killAIBot(otherBot, bot.name, WEAPONS_DATA[bot.weaponKey].name, Math.random() < 0.25, false);
            }
          }
        }
      }
    }
  });

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
    document.getElementById("compass-bar").innerText = `${dirStr} ${deg}° | 艾伦格·P城战区`;

    const near = getNearbyLoot();
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

  camera.rotation.order = "YXZ";
  camera.rotation.y = yaw;
  camera.rotation.x = pitch;
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
  if (fpGunGroup.visible && fpGunGroup.children.length > 0 && player.phase === "ground") {
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

updateAllHUD();
animate();
