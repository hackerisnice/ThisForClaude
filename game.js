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

const gameSettings = { quality: "auto", lookSens: 1.0, adsSens: 1.0, btnScale: 1.0, btnOpacity: 0.74, autoPickup: true };
try {
  const saved = JSON.parse(localStorage.getItem("pubg_lite_settings") || "{}");
  if (["auto", "low", "mid", "high"].includes(saved.quality)) gameSettings.quality = saved.quality;
  if (typeof saved.autoPickup === "boolean") gameSettings.autoPickup = saved.autoPickup;
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
  document.getElementById("chk-auto-pickup").checked = gameSettings.autoPickup;
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
document.getElementById("chk-auto-pickup").addEventListener("change", e => {
  gameSettings.autoPickup = e.target.checked;
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

// 投掷物：破片手榴弹 / 烟雾弹 / 震爆弹 / 燃烧瓶（重量与端游一致）
const THROWABLES_DATA = {
  frag:    { id: "frag",    name: "破片手榴弹", short: "手雷", icon: "💣", weight: 18, fuse: 3.4, speed: 18, color: 0x3d4a2b },
  smoke:   { id: "smoke",   name: "烟雾弹",     short: "烟雾", icon: "💨", weight: 14, fuse: 1.8, speed: 17, color: 0x9aa0a6 },
  stun:    { id: "stun",    name: "震爆弹",     short: "震爆", icon: "⚡", weight: 12, fuse: 2.0, speed: 18, color: 0x2a2c30 },
  molotov: { id: "molotov", name: "燃烧瓶",     short: "燃烧", icon: "🔥", weight: 18, fuse: 0,   speed: 16, color: 0x5a7a34 }
};
const THROW_ORDER = ["frag", "smoke", "stun", "molotov"];

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
  constructor() { this.ctx = null; this.noise = null; this.master = null; this.muffle = null; }
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      // 总线：所有音效 → 闷音滤波（震爆弹耳鸣时压低）→ 总音量 → 扬声器
      this.muffle = this.ctx.createBiquadFilter();
      this.muffle.type = "lowpass";
      this.muffle.frequency.value = 20000;
      this.master = this.ctx.createGain();
      this.master.gain.value = 1;
      this.muffle.connect(this.master);
      this.master.connect(this.ctx.destination);
      // 共享白噪声缓冲（脚步、爆炸、烟雾都从这里取片段，不必每次重新生成）
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  // 输出端：带左右声道定位（pan: -1 左 ~ 1 右）
  out(pan) {
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      p.connect(this.muffle);
      return p;
    }
    return this.muffle;
  }
  noiseBurst(dur, filterType, freq, q, vol, pan, decay, freqEnd) {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, now);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, now + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), now + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, now + (decay || dur));
    src.connect(f); f.connect(g); g.connect(this.out(pan));
    src.start(now, Math.random() * 1.5, dur + 0.05);
  }
  playShot(isSuppressed, weight = 1.0, dist = 0, pan = 0) {
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
    src.connect(filter); filter.connect(gain); gain.connect(this.out(pan));
    src.start(now);
  }
  // 脚步声：按地面材质（草地/柏油/土路/木地板/石头水泥）合成，带方位
  playFootstep(surface = "grass", vol = 0.15, pan = 0, crawl = false) {
    this.init();
    if (vol <= 0.004) return;
    if (crawl) { this.noiseBurst(0.22, "bandpass", 900, 0.6, vol * 0.8, pan, 0.22); return; }
    if (surface === "grass") {
      this.noiseBurst(0.11, "lowpass", 1400, 0.7, vol * 0.9, pan, 0.1);
      this.noiseBurst(0.05, "highpass", 3500, 0.5, vol * 0.25, pan, 0.05);
    } else if (surface === "gravel") {
      this.noiseBurst(0.09, "bandpass", 2400, 0.9, vol, pan, 0.09);
      this.noiseBurst(0.06, "highpass", 4200, 0.6, vol * 0.35, pan, 0.06);
    } else if (surface === "wood") {
      this.noiseBurst(0.07, "bandpass", 520, 2.2, vol * 1.3, pan, 0.07);
      this.thump(105, 0.06, vol * 0.9, pan);
    } else {
      // 柏油 / 水泥 / 石头：清脆的鞋底敲击
      this.noiseBurst(0.05, "bandpass", 1900, 1.4, vol * 1.1, pan, 0.05);
      this.thump(85, 0.05, vol * 0.6, pan);
    }
  }
  thump(freq, dur, vol, pan) {
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.5, now + dur);
    g.gain.setValueAtTime(vol, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + dur);
    osc.connect(g); g.connect(this.out(pan));
    osc.start(now); osc.stop(now + dur + 0.02);
  }
  playLanding(strength) {
    this.init();
    this.thump(70, 0.16, 0.35 * strength + 0.1, 0);
    this.noiseBurst(0.12, "lowpass", 900, 0.7, 0.18 * strength + 0.05, 0, 0.12);
  }
  playExplosion(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 420);
    if (v <= 0.01) return;
    this.noiseBurst(1.6, "lowpass", 1600, 0.8, 0.9 * v, pan, 1.6, 120);
    this.thump(55, 0.7, 0.9 * v, pan);
  }
  playThrow() { this.init(); this.noiseBurst(0.18, "bandpass", 1300, 0.8, 0.12, 0, 0.18, 500); }
  playPinPull() {
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(2600, now);
    g.gain.setValueAtTime(0.06, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(g); g.connect(this.out(0));
    osc.start(now); osc.stop(now + 0.05);
  }
  playBounce(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 45) * 0.16;
    if (v > 0.005) this.noiseBurst(0.04, "bandpass", 3200, 3, v, pan, 0.04);
  }
  playSmokeHiss(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 70) * 0.2;
    if (v > 0.005) this.noiseBurst(3.2, "highpass", 2600, 0.6, v, pan, 3.2);
  }
  playIgnite(dist, pan) {
    this.init();
    const v = Math.max(0, 1 - dist / 90) * 0.55;
    if (v > 0.005) this.noiseBurst(0.9, "lowpass", 700, 0.9, v, pan, 0.9, 2400);
  }
  // 震爆弹：耳鸣 + 整体声音发闷，持续若干秒后恢复
  stunEars(intensity, seconds) {
    this.init();
    const now = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(now);
    this.muffle.frequency.setValueAtTime(Math.max(250, 2200 * (1 - intensity)), now);
    this.muffle.frequency.exponentialRampToValueAtTime(20000, now + seconds);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 3400;
    g.gain.setValueAtTime(0.12 * intensity, now);
    g.gain.exponentialRampToValueAtTime(0.0005, now + seconds);
    osc.connect(g); g.connect(this.master);
    osc.start(now); osc.stop(now + seconds + 0.05);
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
      osc.connect(gain); gain.connect(this.muffle);
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
    osc.connect(gain); gain.connect(this.muffle);
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
      osc.connect(gain); gain.connect(this.muffle);
      osc.start(now + idx * 0.06); osc.stop(now + idx * 0.06 + 0.14);
    });
  }
}
const sfx = new SoundEngine();

// 声源相对镜头的左右方位（-1 左 ~ 1 右），用于脚步/枪声/爆炸定位
function stereoPanFor(x, z) {
  const dx = x - playerRig.position.x, dz = z - playerRig.position.z;
  const len = Math.hypot(dx, dz);
  if (len < 0.5) return 0;
  return Math.max(-1, Math.min(1, (dx * Math.cos(yaw) - dz * Math.sin(yaw)) / len)) * 0.85;
}

// 脚下材质：楼内木地板、屋顶/桥面/遗迹石头、柏油路、土路、草地
function surfaceTypeAt(x, z, feetY) {
  if (feetY > 0.1) {
    const b = getBuildingContainingPoint(x, z, 0);
    if (b && b.kind !== "ruin" && (b.roofY === null || feetY < b.roofY - 0.3)) return "wood";
    return "stone";
  }
  const ruins = POI_BY_KEY.ruins;
  if (Math.hypot(x - ruins.x, z - ruins.z) < 32) return "stone";
  if (roadEdgeDistance(x, z, 8) < 0) return roadQueryKind === "dirt" ? "gravel" : "asphalt";
  return "grass";
}

// AI 听到玩家脚步：附近（站立跑动 20 米、蹲走 8 米、趴下听不到）且看不见玩家的 AI 会转头望向声音方向
function notifyBotsOfPlayerStep() {
  const r = player.stance === "stand" ? 20 : (player.stance === "crouch" ? 8 : 0);
  if (r <= 0) return;
  for (let i = 0; i < aiPlayers.length; i++) {
    const bot = aiPlayers[i];
    if (!bot.alive || bot.phase !== "ground") continue;
    const d = Math.hypot(bot.group.position.x - playerRig.position.x, bot.group.position.z - playerRig.position.z);
    if (d < r && performance.now() > bot.faceHintUntil) setBotFaceHint(bot, playerRig.position.x, playerRig.position.z, 1200);
  }
}

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
const BATCH_CELL = 250;
const BATCH_MAX_VERTS = 65000;     // 每个批次不超过 16 位索引上限，所有手机 GPU 都支持
const BATCH_VIEW_DIST = 950;       // 超出该距离的批次整体不绘制（远处已被雾气完全吞没）
const staticBatchMaterials = {
  plaster: new THREE.MeshLambertMaterial({ vertexColors: true, map: plasterTex }),
  wood:    new THREE.MeshLambertMaterial({ vertexColors: true, map: woodTex }),
  rock:    new THREE.MeshLambertMaterial({ vertexColors: true, map: rockTex }),
  bark:    new THREE.MeshLambertMaterial({ vertexColors: true, map: barkTex }),
  leaf:    new THREE.MeshLambertMaterial({ vertexColors: true, map: leafTex })
};
const STATIC_BATCH_UV_SCALE = { plaster: 0.36, wood: 0.5, rock: 0.45, bark: 0.6, leaf: 0.35 };
const staticBatchBuckets = new Map();
const sealedBatchBuckets = [];
const staticBatchMeshes = [];
const _bp = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _bn = new THREE.Vector3(), _bFace = new THREE.Vector3(), _bE1 = new THREE.Vector3(), _bE2 = new THREE.Vector3();
const _bNormalMat = new THREE.Matrix3();
const _bColor = new THREE.Color();
const _bRemap = new Int32Array(256);
const nonIndexedCache = new WeakMap();

// 共享的单位立方体：所有墙体/楼板代理网格都用它 + 缩放，不再每块墙 new 一个几何体（大地图省下大量内存）
const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
UNIT_BOX.userData.flatIndexed = true;

function newBatchBucket(matKey) {
  return {
    matKey, n: 0, ni: 0,
    pos: new Float32Array(4096 * 3), nor: new Float32Array(4096 * 3),
    uv: new Float32Array(4096 * 2), col: new Float32Array(4096 * 3), idx: new Uint16Array(8192)
  };
}
function growTyped(arr, need) {
  if (need <= arr.length) return arr;
  let cap = arr.length;
  while (cap < need) cap *= 2;
  const out = new arr.constructor(cap);
  out.set(arr);
  return out;
}
function reserveBatch(b, verts, idx) {
  b.pos = growTyped(b.pos, (b.n + verts) * 3);
  b.nor = growTyped(b.nor, (b.n + verts) * 3);
  b.col = growTyped(b.col, (b.n + verts) * 3);
  b.uv = growTyped(b.uv, (b.n + verts) * 2);
  b.idx = growTyped(b.idx, b.ni + idx);
}
function getBatchBucket(key, matKey, addVerts) {
  let b = staticBatchBuckets.get(key);
  if (b && b.n + addVerts > BATCH_MAX_VERTS) {
    sealedBatchBuckets.push(b);
    b = null;
  }
  if (!b) { b = newBatchBucket(matKey); staticBatchBuckets.set(key, b); }
  return b;
}

// 写入一个顶点：世界坐标投影 UV（贴图密度与物体大小无关）+ 墙根/天花板压暗（零成本环境光遮蔽）
function emitBatchVertex(b, p, n, axisX, axisY, axisZ, uvs, useAO, opts) {
  const i = b.n++;
  b.pos[i * 3] = p.x; b.pos[i * 3 + 1] = p.y; b.pos[i * 3 + 2] = p.z;
  b.nor[i * 3] = n.x; b.nor[i * 3 + 1] = n.y; b.nor[i * 3 + 2] = n.z;
  if (axisY >= axisX && axisY >= axisZ) { b.uv[i * 2] = p.x * uvs; b.uv[i * 2 + 1] = p.z * uvs; }
  else if (axisX >= axisZ) { b.uv[i * 2] = p.z * uvs; b.uv[i * 2 + 1] = p.y * uvs; }
  else { b.uv[i * 2] = p.x * uvs; b.uv[i * 2 + 1] = p.y * uvs; }
  let shade = 1;
  if (useAO) {
    if (n.y < -0.5) shade = 0.62;
    else if (Math.abs(n.y) < 0.5) shade = 0.7 + 0.3 * Math.min(1, Math.max(0, (p.y - (opts.aoBase || 0)) / 2.6));
  }
  if (opts.shadeFn) shade *= opts.shadeFn(p, n);
  b.col[i * 3] = _bColor.r * shade; b.col[i * 3 + 1] = _bColor.g * shade; b.col[i * 3 + 2] = _bColor.b * shade;
  return i;
}

function addToStaticBatch(mesh, matKey, colorHex, opts = {}) {
  mesh.updateMatrixWorld(true);
  const geo = mesh.geometry;
  const mw = mesh.matrixWorld;
  _bNormalMat.getNormalMatrix(mw);
  const cx = Math.floor(mw.elements[12] / BATCH_CELL), cz = Math.floor(mw.elements[14] / BATCH_CELL);
  const key = matKey + "|" + cx + "|" + cz;
  _bColor.setHex(colorHex);
  const uvs = STATIC_BATCH_UV_SCALE[matKey] || 0.4;
  const useAO = opts.ao !== false;

  if (geo.userData.flatIndexed) {
    // 立方体：保留索引（每面 4 个顶点而不是 6 个），可选跳过贴地的底面
    const pos = geo.attributes.position, nor = geo.attributes.normal, index = geo.index;
    const b = getBatchBucket(key, matKey, pos.count);
    reserveBatch(b, pos.count, index.count);
    _bRemap.fill(-1, 0, pos.count);
    for (let t = 0; t < index.count; t += 3) {
      const a0 = index.getX(t);
      _bn.fromBufferAttribute(nor, a0).applyMatrix3(_bNormalMat).normalize();
      if (opts.skipBottom && _bn.y < -0.9) continue;
      for (let k = 0; k < 3; k++) {
        const v = index.getX(t + k);
        if (_bRemap[v] < 0) {
          _bp[0].fromBufferAttribute(pos, v).applyMatrix4(mw);
          _bn.fromBufferAttribute(nor, v).applyMatrix3(_bNormalMat).normalize();
          _bRemap[v] = emitBatchVertex(b, _bp[0], _bn, Math.abs(_bn.x), Math.abs(_bn.y), Math.abs(_bn.z), uvs, useAO, opts);
        }
        b.idx[b.ni++] = _bRemap[v];
      }
    }
    return;
  }

  // 其它几何体：按三角面朝向选择投影轴
  let srcGeo = geo;
  if (geo.index) {
    srcGeo = nonIndexedCache.get(geo);
    if (!srcGeo) { srcGeo = geo.toNonIndexed(); if (geo.userData.shared) nonIndexedCache.set(geo, srcGeo); }
  }
  const pos = srcGeo.attributes.position, nor = srcGeo.attributes.normal;
  const b = getBatchBucket(key, matKey, pos.count);
  reserveBatch(b, pos.count, pos.count);
  for (let i = 0; i + 2 < pos.count; i += 3) {
    for (let k = 0; k < 3; k++) _bp[k].fromBufferAttribute(pos, i + k).applyMatrix4(mw);
    _bE1.subVectors(_bp[1], _bp[0]); _bE2.subVectors(_bp[2], _bp[0]);
    _bFace.crossVectors(_bE1, _bE2);
    const ax = Math.abs(_bFace.x), ay = Math.abs(_bFace.y), az = Math.abs(_bFace.z);
    for (let k = 0; k < 3; k++) {
      _bn.fromBufferAttribute(nor, i + k).applyMatrix3(_bNormalMat).normalize();
      b.idx[b.ni++] = emitBatchVertex(b, _bp[k], _bn, ax, ay, az, uvs, useAO, opts);
    }
  }
  if (srcGeo !== geo && !geo.userData.shared) srcGeo.dispose();
}

// 上传 GPU 后释放 CPU 端的顶点数组（大地图的合批数据只需要在显存里保留一份）
function freeUploadedArray() { this.array = null; }

function flushStaticBatches() {
  const all = sealedBatchBuckets.concat(Array.from(staticBatchBuckets.values()));
  all.forEach(b => {
    if (b.ni === 0) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(b.pos.subarray(0, b.n * 3), 3));
    g.setAttribute("normal", new THREE.BufferAttribute(b.nor.subarray(0, b.n * 3), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(b.uv.subarray(0, b.n * 2), 2));
    g.setAttribute("color", new THREE.BufferAttribute(b.col.subarray(0, b.n * 3), 3));
    g.setIndex(new THREE.BufferAttribute(b.idx.subarray(0, b.ni), 1));
    g.computeBoundingSphere();
    Object.values(g.attributes).forEach(a => a.onUpload(freeUploadedArray));
    g.index.onUpload(freeUploadedArray);
    const m = new THREE.Mesh(g, staticBatchMaterials[b.matKey]);
    m.castShadow = true;
    m.receiveShadow = true;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    scene.add(m);
    m.updateMatrixWorld(true);
    staticBatchMeshes.push(m);
  });
  staticBatchBuckets.clear();
  sealedBatchBuckets.length = 0;
}

// 远处批次整体隐藏（玩家每移动 25 米重新判断一次，开销可忽略）
let lastBatchCullX = Infinity, lastBatchCullZ = Infinity;
function cullStaticBatches() {
  const px = playerRig.position.x, pz = playerRig.position.z;
  if (Math.abs(px - lastBatchCullX) + Math.abs(pz - lastBatchCullZ) < 25) return;
  lastBatchCullX = px; lastBatchCullZ = pz;
  for (let i = 0; i < staticBatchMeshes.length; i++) {
    const m = staticBatchMeshes[i];
    const s = m.geometry.boundingSphere;
    m.visible = Math.hypot(s.center.x - px, s.center.z - pz) - s.radius < BATCH_VIEW_DIST;
  }
}

// 冻结静态物体矩阵（物资、弹孔、盒子等放下后不再移动）
function freezeObject(obj) {
  obj.traverse(o => { o.updateMatrix(); o.matrixAutoUpdate = false; });
  obj.updateMatrixWorld(true);
}

// ---------------------------------------------------------------------------
// 3.6 世界尺寸：地图面积扩大为原来的 4 倍（1600m → 3200m 见方）
// ---------------------------------------------------------------------------
const MAP_SIZE = 3200;
const MAP_LIMIT = MAP_SIZE / 2 - 5;
const FLOOR_H = 3.2;          // 楼层层高
const STEP_UP = 0.6;          // 能直接迈上去的高度（楼梯、门槛、台阶）
const RIVER_Z = 330, RIVER_HALF = 23;
const BRIDGE_XS = [-720, 0, 720];

// 原始地面平面保留为子弹射线检测代理（不参与渲染），渲染使用下方带起伏远山的高细节地形
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
  new THREE.MeshLambertMaterial({ color: 0x4d5b41 })
);
ground.rotation.x = -Math.PI / 2;
ground.updateMatrixWorld(true);

const shootableEnvironment = [ground];
const wallMeshesForLOS = [];
const wallColliders2D = [];
const buildingFootprints = [];
const worldLootItems = [];

function floorY(f) { return f === 0 ? 0.16 : f * FLOOR_H + 0.1; }

// ---------------------------------------------------------------------------
// 3.7 碰撞：带高度区间的碰撞盒 + 空间网格（多层楼的二楼墙不会挡住一楼的人）
// ---------------------------------------------------------------------------
const COLLIDER_CELL = 6;
const colliderGrid = new Map();
let colliderGridCount = 0;
function gridKey(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }

function addCollider(minX, maxX, minZ, maxZ, minY = 0, maxY = 60) {
  wallColliders2D.push({ minX, maxX, minZ, maxZ, minY, maxY });
}

function syncColliderGrid() {
  while (colliderGridCount < wallColliders2D.length) {
    const c = wallColliders2D[colliderGridCount++];
    if (c.minY === undefined) c.minY = 0;
    if (c.maxY === undefined) c.maxY = 60;
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

// 人物身体占据的高度区间：脚下 0.45m 以内的矮台阶可以直接迈过，头顶 1.6m 以上的结构不挡路
function isPointBlocked2D(x, z, radius = 0.5, feetY = 0) {
  if (colliderGridCount !== wallColliders2D.length) syncColliderGrid();
  const lo = feetY + 0.45, hi = feetY + 1.6;
  const x0 = Math.floor((x - radius) / COLLIDER_CELL), x1 = Math.floor((x + radius) / COLLIDER_CELL);
  const z0 = Math.floor((z - radius) / COLLIDER_CELL), z1 = Math.floor((z + radius) / COLLIDER_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const arr = colliderGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (c.minY < hi && c.maxY > lo &&
            x + radius > c.minX && x - radius < c.maxX &&
            z + radius > c.minZ && z - radius < c.maxZ) {
          return true;
        }
      }
    }
  }
  return false;
}

// 某个三维点是否在实体内部（投掷物碰撞用）
function isSolidAt(x, y, z, radius) {
  if (colliderGridCount !== wallColliders2D.length) syncColliderGrid();
  const x0 = Math.floor((x - radius) / COLLIDER_CELL), x1 = Math.floor((x + radius) / COLLIDER_CELL);
  const z0 = Math.floor((z - radius) / COLLIDER_CELL), z1 = Math.floor((z + radius) / COLLIDER_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const arr = colliderGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const c = arr[i];
        if (y >= c.minY && y <= c.maxY &&
            x + radius > c.minX && x - radius < c.maxX &&
            z + radius > c.minZ && z - radius < c.maxZ) {
          return true;
        }
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 3.8 可站立表面：各层楼板、平屋顶、楼梯坡道、遗迹平台、桥面（没有表面的地方高度为 0）
// ---------------------------------------------------------------------------
const WALK_CELL = 8;
const walkGrid = new Map();

function registerWalkSurface(s) {
  const x0 = Math.floor(s.x0 / WALK_CELL), x1 = Math.floor(s.x1 / WALK_CELL);
  const z0 = Math.floor(s.z0 / WALK_CELL), z1 = Math.floor(s.z1 / WALK_CELL);
  for (let ix = x0; ix <= x1; ix++) {
    for (let iz = z0; iz <= z1; iz++) {
      const k = gridKey(ix, iz);
      let arr = walkGrid.get(k);
      if (!arr) { arr = []; walkGrid.set(k, arr); }
      arr.push(s);
    }
  }
}
function addWalkRect(x0, z0, x1, z1, y, ceilY = null) {
  registerWalkSurface({ x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), ya: y, yb: y, axis: 0, ceil: ceilY });
}
// 坡道：沿 z 方向，z0 处高度 ya，z1 处高度 yb
function addWalkRampZ(x0, x1, z0, z1, ya, yb) {
  registerWalkSurface({ x0, x1, z0, z1, ya, yb, axis: 1, ceil: null });
}
function surfaceHeight(s, x, z) {
  if (s.axis === 0) return s.ya;
  const t = (z - s.z0) / (s.z1 - s.z0);
  return s.ya + (s.yb - s.ya) * Math.max(0, Math.min(1, t));
}
// 脚下不高于 maxY 的最高可站立表面
function getGroundHeight(x, z, maxY) {
  let best = 0;
  const arr = walkGrid.get(gridKey(Math.floor(x / WALK_CELL), Math.floor(z / WALK_CELL)));
  if (!arr) return best;
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    const h = surfaceHeight(s, x, z);
    if (h <= maxY + 1e-3 && h > best) best = h;
  }
  return best;
}
// 头顶最近的楼板底面（手雷撞天花板反弹用）
function getCeilingAbove(x, z, y) {
  let best = Infinity;
  const arr = walkGrid.get(gridKey(Math.floor(x / WALK_CELL), Math.floor(z / WALK_CELL)));
  if (!arr) return null;
  for (let i = 0; i < arr.length; i++) {
    const s = arr[i];
    if (s.ceil === null || x < s.x0 || x > s.x1 || z < s.z0 || z > s.z1) continue;
    if (s.ceil > y && s.ceil < best) best = s.ceil;
  }
  return best === Infinity ? null : best;
}

// 平面移动 + 碰撞：按“走到新位置后的脚底高度”判断（这样才能走上楼梯、跨过门槛）
function moveWithWallCollisions(posVec, dx, dz, radius = 0.48, feetY = 0) {
  const nextX = posVec.x + dx;
  if (!isPointBlocked2D(nextX, posVec.z, radius, Math.max(feetY, getGroundHeight(nextX, posVec.z, feetY + STEP_UP)))) posVec.x = nextX;
  const nextZ = posVec.z + dz;
  if (!isPointBlocked2D(posVec.x, nextZ, radius, Math.max(feetY, getGroundHeight(posVec.x, nextZ, feetY + STEP_UP)))) posVec.z = nextZ;
  posVec.x = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, posVec.x));
  posVec.z = Math.max(-MAP_LIMIT, Math.min(MAP_LIMIT, posVec.z));
}

// 防卡墙：如果某个位置已经处在碰撞体内部（跳伞落进墙/树/石头、空投箱砸在身上），
// 由内向外螺旋搜索最近的空地并移过去。正常情况下只做一次碰撞查询，几乎零开销
function pushOutOfColliders(posVec, radius, feetY = 0) {
  if (!isPointBlocked2D(posVec.x, posVec.z, radius, feetY)) return false;
  for (let r = 0.3; r <= 14; r += 0.3) {
    const steps = Math.max(8, Math.ceil(r * 6));
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const x = posVec.x + Math.cos(a) * r, z = posVec.z + Math.sin(a) * r;
      if (Math.abs(x) > MAP_LIMIT || Math.abs(z) > MAP_LIMIT) continue;
      if (!isPointBlocked2D(x, z, radius, feetY)) {
        posVec.x = x; posVec.z = z;
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// 3.9 道路网：曲线公路 + 乡间土路（原版是两条贯穿全图、16 米宽的笔直大道）
// ---------------------------------------------------------------------------
const ROAD_DEFS = [
  // 南北主干道（经中桥过河）
  { w: 9, kind: "asphalt", pts: [[60, -1760], [10, -1250], [-60, -820], [-20, -420], [0, -80], [36, 190], [0, 286], [0, 374], [-30, 500], [50, 880], [10, 1300], [-30, 1760]] },
  // 东西主干道（穿过 P 城）
  { w: 9, kind: "asphalt", pts: [[-1760, -120], [-1150, -40], [-560, -170], [-220, -70], [0, -80], [300, 10], [760, -50], [1200, 50], [1760, -20]] },
  // P 城 → R 城 → 西北
  { w: 7, kind: "asphalt", pts: [[-220, -70], [-260, -260], [-420, -470], [-620, -640], [-760, -720], [-900, -1000], [-1100, -1400], [-1250, -1760]] },
  // P 城 → Y 城 → 东北
  { w: 7, kind: "asphalt", pts: [[300, 10], [470, -280], [620, -520], [760, -680], [980, -1080], [1280, -1460], [1500, -1760]] },
  // 西桥 → L 城
  { w: 7, kind: "asphalt", pts: [[-1150, -40], [-860, 80], [-730, 200], [-720, 286], [-720, 374], [-720, 720], [-820, 1100], [-640, 1760]] },
  // 东桥 → M 城
  { w: 7, kind: "asphalt", pts: [[760, -50], [740, 120], [720, 286], [720, 374], [720, 760], [1080, 1010], [1760, 1160]] },
  // 南部乡间土路
  { w: 5, kind: "dirt", pts: [[-720, 720], [-420, 880], [-30, 860], [50, 880], [380, 990], [720, 760]] },
  // 学校支路
  { w: 5, kind: "dirt", pts: [[-560, -170], [-562, -240], [-560, -310]] },
  // 遗迹支路
  { w: 5, kind: "dirt", pts: [[-40, -960], [120, -1050], [250, -1088], [318, -1100]] }
];
const roadPolylines = [];
const ROAD_CELL = 40;
const roadGrid = new Map();
let roadQueryKind = null;

function catmull(a, b, c, d, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
}
function sampleRoad(P) {
  const out = [];
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
    const n = Math.max(2, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 6));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push([catmull(p0[0], p1[0], p2[0], p3[0], t), catmull(p0[1], p1[1], p2[1], p3[1], t)]);
    }
  }
  out.push(P[P.length - 1].slice());
  return out;
}

ROAD_DEFS.forEach(def => {
  const pts = sampleRoad(def.pts);
  roadPolylines.push({ pts, w: def.w, kind: def.kind });
  for (let i = 0; i < pts.length - 1; i++) {
    const s = { ax: pts[i][0], az: pts[i][1], bx: pts[i + 1][0], bz: pts[i + 1][1], hw: def.w / 2, kind: def.kind };
    const x0 = Math.floor((Math.min(s.ax, s.bx) - s.hw) / ROAD_CELL), x1 = Math.floor((Math.max(s.ax, s.bx) + s.hw) / ROAD_CELL);
    const z0 = Math.floor((Math.min(s.az, s.bz) - s.hw) / ROAD_CELL), z1 = Math.floor((Math.max(s.az, s.bz) + s.hw) / ROAD_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = gridKey(ix, iz);
        let arr = roadGrid.get(k);
        if (!arr) { arr = []; roadGrid.set(k, arr); }
        arr.push(s);
      }
    }
  }
});

function distToSeg(px, pz, s) {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const L2 = dx * dx + dz * dz;
  let t = L2 > 0 ? ((px - s.ax) * dx + (pz - s.az) * dz) / L2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t));
}
// 到最近路面边缘的距离（负数 = 站在路面上）；同时记录该路面类型到 roadQueryKind
function roadEdgeDistance(x, z, searchR = 40) {
  let best = Infinity;
  roadQueryKind = null;
  const r = Math.ceil(searchR / ROAD_CELL);
  const cx = Math.floor(x / ROAD_CELL), cz = Math.floor(z / ROAD_CELL);
  for (let ix = cx - r; ix <= cx + r; ix++) {
    for (let iz = cz - r; iz <= cz + r; iz++) {
      const arr = roadGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const d = distToSeg(x, z, arr[i]) - arr[i].hw;
        if (d < best) { best = d; roadQueryKind = arr[i].kind; }
      }
    }
  }
  return best;
}

const dirtRoadTex = makeCanvasTexture(128, (ctx, s) => {
  paintPixels(ctx, s, (x, y, o) => {
    const u = x / s, v = y / s;
    const n = fbm(u * 6, v * 6, 91, 4, 6);
    // 两道车辙
    const rut = Math.min(Math.abs(v - 0.3), Math.abs(v - 0.7)) < 0.06 ? 0.86 : 1;
    const k = (0.62 + n * 0.32 + (hash2(x, y, 17) - 0.5) * 0.16) * rut;
    o[0] = 150 * k; o[1] = 124 * k; o[2] = 92 * k;
  });
});
const asphaltRoadTex = makeAsphaltTexture(false);
const roadMaterials = {
  asphalt: new THREE.MeshLambertMaterial({ map: asphaltRoadTex, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
  dirt: new THREE.MeshLambertMaterial({ map: dirtRoadTex, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })
};

// 沿曲线生成路面条带（UV 沿道路方向展开，标线跟着弯道走）
function buildRoadRibbon(poly, yLift) {
  const pts = poly.pts, hw = poly.w / 2;
  const pos = [], uv = [], nor = [], idx = [];
  let dist = 0;
  for (let i = 0; i < pts.length; i++) {
    const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
    let tx = next[0] - prev[0], tz = next[1] - prev[1];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    if (i > 0) dist += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const px = -tz, pz = tx;
    pos.push(pts[i][0] + px * hw, yLift, pts[i][1] + pz * hw, pts[i][0] - px * hw, yLift, pts[i][1] - pz * hw);
    nor.push(0, 1, 0, 0, 1, 0);
    const u = dist / poly.w;
    uv.push(u, 0, u, 1);
    if (i > 0) {
      const a = (i - 1) * 2, b = i * 2;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const m = new THREE.Mesh(g, roadMaterials[poly.kind]);
  m.receiveShadow = true;
  scene.add(m);
  freezeObject(m);
}
roadPolylines.forEach((poly, i) => buildRoadRibbon(poly, 0.03 + i * 0.004));

// ---------------------------------------------------------------------------
// 3.10 地点（POI）：P 城 + 四座村镇 + 学校 + 遗迹（农场在生成时追加）
// ---------------------------------------------------------------------------
const POIS = [
  { key: "pcity",  name: "P城",  x: 0,    z: -80,   r: 210, weight: 6 },
  { key: "rcity",  name: "R城",  x: -760, z: -720,  r: 120, weight: 3 },
  { key: "ycity",  name: "Y城",  x: 760,  z: -680,  r: 120, weight: 3 },
  { key: "lcity",  name: "L城",  x: -720, z: 720,   r: 120, weight: 3 },
  { key: "mcity",  name: "M城",  x: 720,  z: 760,   r: 120, weight: 3 },
  { key: "school", name: "学校", x: -560, z: -360,  r: 80,  weight: 3,   special: "🏫" },
  { key: "ruins",  name: "遗迹", x: 320,  z: -1160, r: 75,  weight: 2.5, special: "🏛️" }
];
const POI_BY_KEY = {};
POIS.forEach(p => { POI_BY_KEY[p.key] = p; p.buildings = []; });

// ---------------------------------------------------------------------------
// 3.11 地形（含地图外远山）、河流、桥梁
// ---------------------------------------------------------------------------
const TERRAIN_EXT = 900;
const TERRAIN_SIZE = MAP_SIZE + TERRAIN_EXT * 2;
const TERRAIN_SEG = 125;
const terrainGeo = new THREE.PlaneGeometry(TERRAIN_SIZE, TERRAIN_SIZE, TERRAIN_SEG, TERRAIN_SEG);
terrainGeo.rotateX(-Math.PI / 2);
{
  const tPos = terrainGeo.attributes.position;
  const tCol = new Float32Array(tPos.count * 3);
  const edgeStart = MAP_SIZE / 2 + 30;
  for (let i = 0; i < tPos.count; i++) {
    const x = tPos.getX(i), z = tPos.getZ(i);
    const edge = Math.max(Math.abs(x), Math.abs(z));
    let h = 0;
    if (edge > edgeStart) {
      // 地图边界外隆起远山；沿河流与公路留出山谷，让河与路一直延伸到地平线
      const valley = Math.min(smoothstep(30, 110, Math.abs(z - RIVER_Z) - RIVER_HALF), smoothstep(8, 80, roadEdgeDistance(x, z, 120)));
      h = smoothstep(edgeStart, edgeStart + 380, edge) * (35 + fbm(x / 260, z / 260, 7, 4) * 170) * valley;
    }
    tPos.setY(i, h);
    const n = fbm(x / 170, z / 170, 3, 4);
    const n2 = valueNoise(x / 42, z / 42, 9);
    const dry = smoothstep(0.58, 0.74, n);
    const bank = 1 - smoothstep(RIVER_HALF - 4, RIVER_HALF + 6, Math.abs(z - RIVER_Z));
    const rocky = smoothstep(45, 120, h);
    let r = 0.96 + (n - 0.5) * 0.3 + (n2 - 0.5) * 0.12 + dry * 0.22;
    let g = 0.98 + (n - 0.5) * 0.26 + (n2 - 0.5) * 0.1 + dry * 0.05;
    let bl = 0.95 + (n - 0.5) * 0.2 - dry * 0.08;
    r += bank * 0.35; g += bank * 0.12; bl += bank * 0.05;
    // 村镇地面偏土色、遗迹周边偏灰白碎石色
    POIS.forEach(p => {
      const k = 1 - smoothstep(p.r * 0.55, p.r * 1.05, Math.hypot(x - p.x, z - p.z));
      if (k <= 0) return;
      if (p.key === "ruins") { r += k * 0.32; g += k * 0.2; bl += k * 0.28; }
      else { r += k * 0.16; g += k * 0.04; bl -= k * 0.02; }
    });
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

waterNormalTex.repeat.set(TERRAIN_SIZE / 24, (RIVER_HALF * 2) / 24);
const riverMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(TERRAIN_SIZE, RIVER_HALF * 2),
  new THREE.MeshPhongMaterial({
    color: 0x24607f, specular: 0x9fc4d8, shininess: 70,
    normalMap: waterNormalTex, normalScale: new THREE.Vector2(0.55, 0.55),
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
  })
);
riverMesh.rotation.x = -Math.PI / 2;
riverMesh.position.set(0, 0.02, RIVER_Z);
riverMesh.receiveShadow = true;
scene.add(riverMesh);
freezeObject(riverMesh);

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

// ---------------------------------------------------------------------------
// 3.12 建筑积木：代理网格（子弹/视线检测）+ 合批渲染 + 碰撞盒，一次调用全部登记
// ---------------------------------------------------------------------------
const PROXY_MAT = new THREE.MeshBasicMaterial();
function addSolidBox(cx, cy, cz, sx, sy, sz, color, o = {}) {
  const m = new THREE.Mesh(UNIT_BOX, PROXY_MAT);
  m.position.set(cx, cy, cz);
  m.scale.set(sx, sy, sz);
  if (o.rotX) m.rotation.x = o.rotX;
  if (o.rotZ) m.rotation.z = o.rotZ;
  if (o.visual !== false) {
    addToStaticBatch(m, o.key || "plaster", color, { ao: o.ao, skipBottom: o.skipBottom, aoBase: o.aoBase === undefined ? 0 : o.aoBase });
  } else {
    m.updateMatrixWorld(true);
  }
  if (o.shoot !== false) shootableEnvironment.push(m);
  if (o.los !== false) wallMeshesForLOS.push(m);
  if (o.collider !== false && !o.rotX && !o.rotZ) addCollider(cx - sx / 2, cx + sx / 2, cz - sz / 2, cz + sz / 2, cy - sy / 2, cy + sy / 2);
  return m;
}
function addVisualBox(cx, cy, cz, sx, sy, sz, color, key = "plaster", o = {}) {
  return addSolidBox(cx, cy, cz, sx, sy, sz, color, Object.assign({ key, shoot: false, los: false, collider: false }, o));
}
// 任意形状的静态网格（坐标已是世界坐标），例如山墙三角
function addSolidGeometry(geo, color, key, o = {}) {
  const m = new THREE.Mesh(geo, PROXY_MAT);
  m.updateMatrixWorld(true);
  addToStaticBatch(m, key, color, { ao: false });
  if (o.shoot !== false) shootableEnvironment.push(m);
  if (o.los !== false) wallMeshesForLOS.push(m);
  return m;
}

// 已占用区域（建筑 / 学校 / 遗迹），用于摆放时避免重叠
const reservedRects = [];
const RES_CELL = 64;
const reservedGrid = new Map();
function reserveRect(x0, z0, x1, z1) {
  const r = { x0, z0, x1, z1 };
  reservedRects.push(r);
  for (let ix = Math.floor(x0 / RES_CELL); ix <= Math.floor(x1 / RES_CELL); ix++) {
    for (let iz = Math.floor(z0 / RES_CELL); iz <= Math.floor(z1 / RES_CELL); iz++) {
      const k = gridKey(ix, iz);
      let arr = reservedGrid.get(k);
      if (!arr) { arr = []; reservedGrid.set(k, arr); }
      arr.push(r);
    }
  }
}
function isRectReserved(x0, z0, x1, z1, margin) {
  for (let ix = Math.floor((x0 - margin) / RES_CELL); ix <= Math.floor((x1 + margin) / RES_CELL); ix++) {
    for (let iz = Math.floor((z0 - margin) / RES_CELL); iz <= Math.floor((z1 + margin) / RES_CELL); iz++) {
      const arr = reservedGrid.get(gridKey(ix, iz));
      if (!arr) continue;
      for (let i = 0; i < arr.length; i++) {
        const r = arr[i];
        if (x1 + margin > r.x0 && x0 - margin < r.x1 && z1 + margin > r.z0 && z0 - margin < r.z1) return true;
      }
    }
  }
  return false;
}
// 一块矩形区域能否用来盖房子/放东西：不出界、不压河、不压路、不和已有建筑重叠
function isRectBuildable(x0, z0, x1, z1, margin) {
  if (x0 < -MAP_LIMIT + 25 || x1 > MAP_LIMIT - 25 || z0 < -MAP_LIMIT + 25 || z1 > MAP_LIMIT - 25) return false;
  if (z1 > RIVER_Z - RIVER_HALF - margin - 6 && z0 < RIVER_Z + RIVER_HALF + margin + 6) return false;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, hd = Math.hypot(x1 - x0, z1 - z0) / 2;
  if (roadEdgeDistance(cx, cz, hd + margin + 10) < hd + margin) return false;
  return !isRectReserved(x0, z0, x1, z1, margin);
}

// 沿 x 方向（位于 z = fixed）或 z 方向（位于 x = fixed）的一段墙，按门窗开口切成若干实心块
function buildWall(axis, fixed, from, to, yBase, height, thick, color, openings, o = {}) {
  const ops = (openings || []).filter(op => op.b > from + 0.05 && op.a < to - 0.05).sort((p, q) => p.a - q.a);
  const key = o.key || "plaster";
  let cur = from;
  const piece = (a, b, y0, y1) => {
    if (b - a < 0.05 || y1 - y0 < 0.05) return;
    const len = b - a, mid = (a + b) / 2, cy = yBase + (y0 + y1) / 2, h = y1 - y0;
    const opts = { key, aoBase: yBase, skipBottom: y0 <= 0.001 };
    if (axis === "x") addSolidBox(mid, cy, fixed, len, h, thick, color, opts);
    else addSolidBox(fixed, cy, mid, thick, h, len, color, opts);
  };
  for (const op of ops) {
    const a = Math.max(from, op.a), b = Math.min(to, op.b);
    piece(cur, a, 0, height);
    piece(a, b, 0, op.bottom);
    piece(a, b, op.top, height);
    // 窗台（纯视觉，凸出墙面一点，让立面更有层次）
    if (op.bottom > 0.3 && o.sills !== false) {
      const sy = yBase + op.bottom - 0.04;
      if (axis === "x") addVisualBox((a + b) / 2, sy, fixed, b - a + 0.24, 0.08, thick + 0.18, 0x5f5850, "plaster", { ao: false });
      else addVisualBox(fixed, sy, (a + b) / 2, thick + 0.18, 0.08, b - a + 0.24, 0x5f5850, "plaster", { ao: false });
    }
    cur = b;
  }
  piece(cur, to, 0, height);
}

// 山墙双坡屋顶（纯外观 + 子弹/视线代理；不可站立，跳伞落上去会落进顶层室内）
function buildGableRoof(cx, cz, w, d, H, roofColor, wallColor) {
  const alongX = w >= d;
  const span = alongX ? d : w, length = alongX ? w : d;
  const run = span / 2 + 0.5, rh = Math.min(3.2, span * 0.32);
  const L = Math.hypot(run, rh), ang = Math.atan2(rh, run);
  for (const side of [-1, 1]) {
    if (alongX) addSolidBox(cx, H + rh / 2 + 0.05, cz + side * run / 2, length + 1.0, 0.18, L, roofColor, { rotX: side * ang, ao: false });
    else addSolidBox(cx + side * run / 2, H + rh / 2 + 0.05, cz, L, 0.18, length + 1.0, roofColor, { rotZ: -side * ang, ao: false });
  }
  // 两端山墙三角
  const tri = [];
  const apex = H + rh * (1 - 0.12);
  for (const end of [-1, 1]) {
    if (alongX) {
      const x = cx + end * (w / 2 + 0.2);
      tri.push(x, H, cz - d / 2, x, H, cz + d / 2, x, apex, cz);
      tri.push(x, H, cz + d / 2, x, H, cz - d / 2, x, apex, cz);
    } else {
      const z = cz + end * (d / 2 + 0.2);
      tri.push(cx - w / 2, H, z, cx + w / 2, H, z, cx, apex, z);
      tri.push(cx + w / 2, H, z, cx - w / 2, H, z, cx, apex, z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(tri, 3));
  g.computeVertexNormals();
  addSolidGeometry(g, wallColor, "plaster");
}

// 楼梯井：贴着西墙的双跑楼梯（两条并排的坡道交替上下），四周有隔墙，楼梯口有护栏
const STAIR_LANE_W = 1.25, STAIR_DIV = 0.15, STAIR_RUN = 5.2;
function buildStairCore(ix0, zA, zB, floors, color) {
  const lanes = [[ix0, ix0 + STAIR_LANE_W], [ix0 + STAIR_LANE_W + STAIR_DIV, ix0 + 2 * STAIR_LANE_W + STAIR_DIV]];
  const coreX1 = lanes[1][1];
  const run = zB - zA;
  const H = floors * FLOOR_H;
  addSolidBox(ix0 + STAIR_LANE_W + STAIR_DIV / 2, H / 2, (zA + zB) / 2, STAIR_DIV, H, run, color, { skipBottom: true });
  addSolidBox(coreX1 + 0.08, H / 2, (zA + zB) / 2, 0.16, H, run, color, { skipBottom: true });
  for (let f = 0; f < floors - 1; f++) {
    const L = f % 2;
    const [x0, x1] = lanes[L];
    const yb = floorY(f), yt = floorY(f + 1);
    if (L === 0) addWalkRampZ(x0, x1, zA, zB, yb, yt);
    else addWalkRampZ(x0, x1, zA, zB, yt, yb);
    // 台阶（纯视觉）
    const N = 9;
    for (let k = 0; k < N; k++) {
      const top = yb + (yt - yb) * (k + 1) / N;
      const zc = zA + run * (k + 0.5) / N;
      addVisualBox((x0 + x1) / 2, (yb + top) / 2, L === 0 ? zc : zA + zB - zc, x1 - x0, top - yb, run / N, 0x7a6a58, "wood", { skipBottom: true, ao: false });
    }
    // 子弹代理：楼梯斜面
    const slope = Math.atan2(yt - yb, run);
    addSolidBox((x0 + x1) / 2, (yb + yt) / 2 - 0.1, (zA + zB) / 2, x1 - x0, 0.2, Math.hypot(run, yt - yb), 0, { visual: false, los: false, rotX: L === 0 ? -slope : slope });
    // 楼梯下方实心区（防止从楼梯底下钻进去）
    const blockH = 1.3, frac = blockH / (yt - yb);
    if (L === 0) addCollider(x0, x1, zA + run * frac, zB, yb, yb + blockH);
    else addCollider(x0, x1, zA, zB - run * frac, yb, yb + blockH);
    // 上一层楼梯井口护栏（在本段楼梯低端那一头，防止从井口掉下去）
    const railZ = L === 0 ? zA : zB;
    addSolidBox((x0 + x1) / 2, yt + 0.5, railZ, x1 - x0, 1.0, 0.1, 0x3a3532, { los: false, aoBase: yt, ao: false });
  }
  return { lanes, zA, zB, coreX1 };
}

const FACADE_COLORS = [0xc2b29b, 0x9b7653, 0x7a8b99, 0xb86b52, 0x8c857b, 0xd1c7b0, 0xa39a86, 0x8f9a8a, 0xb5a48a, 0xc9b38f];
const ROOF_COLORS = [0x4a413b, 0x6b3a2e, 0x3f4448, 0x6a4b3a, 0x52575b];
const pickColor = arr => arr[Math.floor(Math.random() * arr.length)];

// 通用建筑生成器：多层（每层有窗、底层南北开门）、楼梯井、平顶/双坡顶、室内家具与物资
function buildBuilding(o) {
  const { cx, cz, w, d } = o;
  const floors = o.floors || 1;
  const wallH = o.wallH || FLOOR_H;
  const H = floors === 1 ? wallH : floors * FLOOR_H;
  const t = 0.4;
  const color = o.color || pickColor(FACADE_COLORS);
  const key = o.key || "plaster";
  const ix0 = cx - w / 2 + t / 2, ix1 = cx + w / 2 - t / 2;
  const iz0 = cz - d / 2 + t / 2, iz1 = cz + d / 2 - t / 2;
  const doorW = o.doorW || 2.6, doorH = o.doorH || 2.6;

  // 底层地板
  addSolidBox(cx, 0.08, cz, w, 0.16, d, o.floorColor || 0x6a5442, { key: "wood", collider: false, los: false, ao: false, skipBottom: true });
  addWalkRect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 0.16);

  // 楼梯井（两层及以上）
  let stairs = null;
  if (floors >= 2) {
    const zA = cz - STAIR_RUN / 2, zB = cz + STAIR_RUN / 2;
    stairs = buildStairCore(ix0, zA, zB, floors, color);
  }

  // 楼板（挖掉楼梯井）
  for (let f = 1; f < floors; f++) {
    const y = f * FLOOR_H;
    const rects = [];
    if (stairs) {
      const [hx0, hx1] = stairs.lanes[(f - 1) % 2];
      rects.push([ix0, iz0, ix1, stairs.zA], [ix0, stairs.zB, ix1, iz1]);
      if (hx0 - ix0 > 0.05) rects.push([ix0, stairs.zA, hx0, stairs.zB]);
      rects.push([hx1, stairs.zA, ix1, stairs.zB]);
    } else {
      rects.push([ix0, iz0, ix1, iz1]);
    }
    rects.forEach(([x0, z0, x1, z1]) => {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
      addSolidBox((x0 + x1) / 2, y, (z0 + z1) / 2, x1 - x0, 0.2, z1 - z0, o.floorColor || 0x6a5442, { key: "wood", collider: false, ao: false });
      addWalkRect(x0, z0, x1, z1, y + 0.1, y - 0.1);
    });
  }

  // 外墙：底层南北开门，各层开窗；西墙避开楼梯井不开窗（防止从楼梯上翻出窗外）
  const winOps = (centers, width, bottom, top) => centers.map(c => ({ a: c - width / 2, b: c + width / 2, bottom, top }));
  for (let f = 0; f < floors; f++) {
    const yBase = f * FLOOR_H;
    const h = floors === 1 ? wallH : FLOOR_H;
    const tall = h > 4;
    const wb = tall ? h - 2.0 : 1.0, wt = tall ? h - 0.8 : 2.3;
    const nsCenters = w >= 12 ? [cx - w * 0.3, cx + w * 0.3] : (w >= 9 ? [cx - w * 0.28, cx + w * 0.28] : []);
    for (const side of [-1, 1]) {
      const ops = [];
      if (f === 0 && o.doors !== false) ops.push({ a: cx - doorW / 2, b: cx + doorW / 2, bottom: 0, top: doorH });
      else if (w >= 13 && o.windows !== false) ops.push(...winOps([cx], 1.6, wb, wt));
      if (o.windows !== false) ops.push(...winOps(nsCenters, 1.5, wb, wt));
      buildWall("x", cz + side * d / 2, cx - w / 2 - t / 2, cx + w / 2 + t / 2, yBase, h, t, color, ops, { key });
    }
    const nWin = Math.max(1, Math.floor((d - 2) / 4.2));
    const ewCenters = [];
    for (let k = 0; k < nWin; k++) ewCenters.push(cz - d / 2 + d * (k + 0.5) / nWin);
    for (const side of [-1, 1]) {
      let centers = o.windows === false ? [] : ewCenters;
      if (side === -1 && stairs) centers = centers.filter(c => c < stairs.zA - 1.2 || c > stairs.zB + 1.2);
      const ops = winOps(centers, 1.5, wb, wt);
      (o.sideOpenings || []).forEach(so => {
        if (so.side === (side < 0 ? "west" : "east") && so.floors.includes(f)) {
          ops.push({ a: so.z - so.width / 2, b: so.z + so.width / 2, bottom: 0, top: 2.5 });
        }
      });
      buildWall("z", cx + side * w / 2, cz - d / 2 + t / 2, cz + d / 2 - t / 2, yBase, h, t, color, ops, { key });
    }
    // 楼层之间的腰线（纯视觉）
    if (f > 0 && o.trim !== false) {
      addVisualBox(cx, yBase, cz - d / 2 - 0.25, w + 0.9, 0.22, 0.12, 0x5f5850, "plaster", { ao: false });
      addVisualBox(cx, yBase, cz + d / 2 + 0.25, w + 0.9, 0.22, 0.12, 0x5f5850, "plaster", { ao: false });
    }
  }

  // 屋顶
  let roofY = null;
  if (o.roof === "gable") {
    addSolidBox(cx, H, cz, w, 0.2, d, o.floorColor || 0x6a5442, { key: "wood", collider: false, ao: false });
    buildGableRoof(cx, cz, w, d, H + 0.1, o.roofColor || pickColor(ROOF_COLORS), color);
  } else if (o.roof !== "none") {
    // 平屋顶 + 女儿墙（可站立；跳伞可以落在楼顶）
    const rc = o.roofColor || 0x4a413b;
    addSolidBox(cx, H + 0.05, cz, w + 0.6, 0.3, d + 0.6, rc, { collider: false, ao: false });
    roofY = H + 0.2;
    addWalkRect(cx - w / 2 - 0.3, cz - d / 2 - 0.3, cx + w / 2 + 0.3, cz + d / 2 + 0.3, roofY, H - 0.1);
    const pc = 0x5a514a;
    addSolidBox(cx, roofY + 0.3, cz - d / 2 - 0.18, w + 0.6, 0.6, 0.25, pc, { ao: false, skipBottom: true });
    addSolidBox(cx, roofY + 0.3, cz + d / 2 + 0.18, w + 0.6, 0.6, 0.25, pc, { ao: false, skipBottom: true });
    addSolidBox(cx - w / 2 - 0.18, roofY + 0.3, cz, 0.25, 0.6, d + 0.1, pc, { ao: false, skipBottom: true });
    addSolidBox(cx + w / 2 + 0.18, roofY + 0.3, cz, 0.25, 0.6, d + 0.1, pc, { ao: false, skipBottom: true });
    // 屋顶空调外机/水箱（掩体）
    if (o.roofProps !== false && w > 11 && Math.random() < 0.7) {
      addSolidBox(cx + w * 0.2, roofY + 0.5, cz + d * 0.15, 1.6, 1.0, 1.0, 0x8a8f94, { aoBase: roofY });
    }
  }

  // 室内家具（掩体）与物资，每层分别摆放
  const coreX1 = stairs ? stairs.coreX1 : ix0;
  for (let f = 0; f < floors; f++) {
    const fy = floorY(f);
    if (o.furniture !== false) placeFurniture(o, ix0, ix1, iz0, iz1, coreX1, stairs, fy, cx);
    if (o.loot !== false) placeFloorLoot(o, ix0, ix1, iz0, iz1, coreX1, stairs, fy, w * d);
  }

  const rec = {
    cx, cz, w, d, floors, kind: o.kind || "house", poi: o.poi || null, roofY, stairs,
    northDoor: { x: cx, z: cz - d / 2 - 2.0 },
    southDoor: { x: cx, z: cz + d / 2 + 2.0 }
  };
  buildingFootprints.push(rec);
  indexBuilding(rec);
  reserveRect(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2);
  if (o.poi && POI_BY_KEY[o.poi]) POI_BY_KEY[o.poi].buildings.push(rec);
  return rec;
}

const FURNITURE_TYPES = [
  { w: 1.2, d: 1.2, h: 1.2, color: 0x7a5835, key: "wood" },   // 木箱
  { w: 1.2, d: 1.2, h: 2.4, color: 0x6e4f30, key: "wood" },   // 叠起来的木箱
  { w: 1.8, d: 0.9, h: 0.85, color: 0x5c4532, key: "wood" },  // 桌子
  { w: 2.0, d: 0.5, h: 1.9, color: 0x4f3d2c, key: "wood" },   // 书架
  { w: 2.0, d: 1.0, h: 0.6, color: 0x7d6a5a, key: "plaster" } // 床 / 沙发
];
function placeFurniture(o, ix0, ix1, iz0, iz1, coreX1, stairs, fy, cx) {
  const n = 1 + Math.floor(Math.random() * 2) + (ix1 - ix0 > 14 ? 1 : 0);
  for (let k = 0; k < n; k++) {
    const ft = FURNITURE_TYPES[Math.floor(Math.random() * FURNITURE_TYPES.length)];
    // 只靠东墙或南北墙角摆放，不挡门口中轴线与楼梯口
    const spot = Math.floor(Math.random() * 3);
    let x, z, fw = ft.w, fd = ft.d;
    if (spot === 0) { fw = ft.d; fd = ft.w; x = ix1 - fw / 2 - 0.05; z = iz0 + 1.2 + Math.random() * Math.max(0.1, iz1 - iz0 - 2.4); }
    else { x = cx + 2.0 + fw / 2 + Math.random() * Math.max(0.1, ix1 - cx - 3.0 - fw); z = spot === 1 ? iz0 + fd / 2 + 0.05 : iz1 - fd / 2 - 0.05; }
    if (x - fw / 2 < coreX1 + 0.6 || x + fw / 2 > ix1 + 0.01) continue;
    if (isPointBlocked2D(x, z, Math.max(fw, fd) / 2 + 0.3, fy)) continue;
    addSolidBox(x, fy + ft.h / 2, z, fw, ft.h, fd, ft.color, { key: ft.key, aoBase: fy, skipBottom: true });
  }
}
function placeFloorLoot(o, ix0, ix1, iz0, iz1, coreX1, stairs, fy, area) {
  const count = Math.round((1.6 + area / 70) * (o.lootMul || 1) * (0.8 + Math.random() * 0.4));
  let placed = 0;
  for (let tries = 0; tries < count * 8 && placed < count; tries++) {
    const x = ix0 + 0.9 + Math.random() * (ix1 - ix0 - 1.8);
    const z = iz0 + 0.9 + Math.random() * (iz1 - iz0 - 1.8);
    if (stairs && x < coreX1 + 0.5 && z > stairs.zA - 0.3 && z < stairs.zB + 0.3) continue;
    if (Math.abs(getGroundHeight(x, z, fy + 0.05) - fy) > 0.05) continue;
    if (isPointBlocked2D(x, z, 0.35, fy)) continue;
    spawnRandomGroundLoot(x, z, null, fy);
    placed++;
  }
}

// 建筑空间索引（AI 每帧都要查“自己在哪栋楼里”）
const BLD_CELL = 32;
const buildingGrid = new Map();
function indexBuilding(b) {
  for (let ix = Math.floor((b.cx - b.w / 2 - 1.2) / BLD_CELL); ix <= Math.floor((b.cx + b.w / 2 + 1.2) / BLD_CELL); ix++) {
    for (let iz = Math.floor((b.cz - b.d / 2 - 1.2) / BLD_CELL); iz <= Math.floor((b.cz + b.d / 2 + 1.2) / BLD_CELL); iz++) {
      const k = gridKey(ix, iz);
      let arr = buildingGrid.get(k);
      if (!arr) { arr = []; buildingGrid.set(k, arr); }
      arr.push(b);
    }
  }
}
// 检查一个坐标位于哪栋建筑内部（用于房门导航进出屋）
function getBuildingContainingPoint(x, z, margin = 0.2) {
  const arr = buildingGrid.get(gridKey(Math.floor(x / BLD_CELL), Math.floor(z / BLD_CELL)));
  if (!arr) return null;
  for (let i = 0; i < arr.length; i++) {
    const b = arr[i];
    if (Math.abs(x - b.cx) < b.w / 2 + margin && Math.abs(z - b.cz) < b.d / 2 + margin) return b;
  }
  return null;
}

// ---------------------------------------------------------------------------
// 3.13 物资模型与刷新
// ---------------------------------------------------------------------------
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

// 投掷物外观（地面物资、手里、飞行中共用）
function buildThrowablePartsGroup(id) {
  const group = new THREE.Group();
  const td = THROWABLES_DATA[id];
  const body = new THREE.MeshLambertMaterial({ color: td.color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1b1d1f });
  if (id === "frag") {
    group.add(new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), body));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 0.05, 8), dark);
    top.position.y = 0.08;
    const lever = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.1, 0.03), dark);
    lever.position.set(0.04, 0.04, 0);
    group.add(top, lever);
  } else if (id === "molotov") {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.16, 10), body));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.04, 0.08, 8), body);
    neck.position.y = 0.11;
    const rag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.05), new THREE.MeshLambertMaterial({ color: 0xd9c9a3 }));
    rag.position.y = 0.17;
    group.add(neck, rag);
  } else {
    group.add(new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.15, 10), body));
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 10), new THREE.MeshLambertMaterial({ color: id === "smoke" ? 0xe8e8e8 : 0xd8c040 }));
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.04, 8), dark);
    top.position.y = 0.095;
    group.add(band, top);
  }
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
    ring.position.y = -0.1;
    group.add(body, ring);
  } else if (item.kind === "throwable") {
    const g = buildThrowablePartsGroup(item.id);
    g.scale.setScalar(1.6);
    g.position.y = -0.02;
    group.add(g);
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

// y = 物资所在表面的高度（地面 0、楼层地板、屋顶等）
function spawnRandomGroundLoot(x, z, forcedItem = null, y = 0) {
  let item = forcedItem;
  if (!item) {
    const r = Math.random();
    if (r < 0.34) {
      const wKeys = Object.keys(WEAPONS_DATA).filter(k => !WEAPONS_DATA[k].airdropOnly);
      const wKey = wKeys[Math.floor(Math.random() * wKeys.length)];
      const wep = WEAPONS_DATA[wKey];
      item = { kind: "weapon", id: wKey, name: wep.name, ammoInMag: wep.mag, attachments: {} };
      spawnRandomGroundLoot(x + 0.65, z + 0.45, {
        kind: "ammo", id: wep.ammoType, name: `${wep.ammoType} 子弹`, count: wep.type === "SG" ? 15 : 40
      }, y);
    } else if (r < 0.60) {
      const aKeys = Object.keys(ATTACHMENTS_DATA);
      const aKey = aKeys[Math.floor(Math.random() * aKeys.length)];
      const att = ATTACHMENTS_DATA[aKey];
      item = { kind: "attachment", id: aKey, name: att.name, slot: att.slot };
    } else if (r < 0.78) {
      const mKeys = Object.keys(MEDS_DATA);
      const mKey = mKeys[Math.floor(Math.random() * mKeys.length)];
      item = { kind: "med", id: mKey, name: MEDS_DATA[mKey].name, count: 1 };
    } else if (r < 0.88) {
      const tr = Math.random();
      const tKey = tr < 0.4 ? "frag" : (tr < 0.65 ? "smoke" : (tr < 0.85 ? "stun" : "molotov"));
      item = { kind: "throwable", id: tKey, name: THROWABLES_DATA[tKey].name, count: 1 };
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
  mesh.position.set(x, y + 0.12, z);
  scene.add(mesh);
  freezeObject(mesh);
  worldLootItems.push({ x, y, z, mesh, item });
}

// ---------------------------------------------------------------------------
// 3.14 地图内容：桥梁、各城镇（多样楼型）、学校、遗迹、农场、路边民房
// ---------------------------------------------------------------------------
BRIDGE_XS.forEach(bx => {
  const z0 = RIVER_Z - 30, z1 = RIVER_Z + 30;
  addSolidBox(bx, 0.2, RIVER_Z, 20, 0.4, 60, 0x7c8084, { collider: false, los: false, ao: false });
  addWalkRect(bx - 10, z0, bx + 10, z1, 0.4);
  addSolidBox(bx - 9.7, 1.0, RIVER_Z, 0.5, 1.2, 60, 0x6e7276, { aoBase: 0.4 });
  addSolidBox(bx + 9.7, 1.0, RIVER_Z, 0.5, 1.2, 60, 0x6e7276, { aoBase: 0.4 });
  [-14, 0, 14].forEach(dz => addVisualBox(bx, -1.2, RIVER_Z + dz, 14, 2.6, 2.2, 0x6a6e70, "rock", { ao: false }));
  reserveRect(bx - 11, z0, bx + 11, z1);
});

// 按楼型生成建筑参数
function makeBuildingSpec(type, x, z, poi) {
  const r = Math.random;
  if (type === "house") return { cx: x, cz: z, w: 9 + r() * 3.5, d: 9 + r() * 3, floors: 1, roof: r() < 0.6 ? "gable" : "flat", poi, kind: "house" };
  if (type === "house2") return { cx: x, cz: z, w: 11 + r() * 3.5, d: 11 + r() * 2.5, floors: 2, roof: r() < 0.45 ? "gable" : "flat", poi, kind: "house2" };
  if (type === "apartment") return { cx: x, cz: z, w: 15 + r() * 4, d: 12 + r() * 2.5, floors: 3, roof: "flat", poi, kind: "apartment", lootMul: 0.85 };
  if (type === "warehouse") {
    return { cx: x, cz: z, w: 16 + r() * 6, d: 13 + r() * 4, floors: 1, wallH: 6, roof: "flat", poi, kind: "warehouse",
      color: pickColor([0x7d8a8f, 0x8a7560, 0x6f7a6a, 0x9a8f7f]), doorW: 4.2, doorH: 4.2, roofProps: false, lootMul: 1.2 };
  }
  return null;
}
function buildingFits(spec, margin) {
  return isRectBuildable(spec.cx - spec.w / 2, spec.cz - spec.d / 2, spec.cx + spec.w / 2, spec.cz + spec.d / 2, margin);
}
// L 形组合：主楼 + 侧翼（两栋相贴，共用墙上开通道）
function tryBuildLHouse(x, z, poi) {
  const main = makeBuildingSpec(Math.random() < 0.6 ? "house2" : "house", x, z, poi);
  const ww = 6.5 + Math.random() * 2.5, wd = 7 + Math.random() * 2;
  const north = Math.random() < 0.5;
  main.color = pickColor(FACADE_COLORS);
  const wing = {
    cx: x + main.w / 2 + 0.4 + ww / 2, cz: north ? z - main.d / 2 + wd / 2 : z + main.d / 2 - wd / 2,
    w: ww, d: wd, floors: 1, roof: "flat", poi, kind: "wing", color: main.color, lootMul: 0.8
  };
  const x0 = x - main.w / 2, x1 = wing.cx + ww / 2;
  if (!isRectBuildable(x0, z - main.d / 2, x1, z + main.d / 2, 4)) return false;
  main.sideOpenings = [{ side: "east", z: wing.cz, width: 1.8, floors: [0] }];
  wing.sideOpenings = [{ side: "west", z: wing.cz, width: 1.8, floors: [0] }];
  buildBuilding(main);
  buildBuilding(wing);
  return true;
}

function pickWeighted(mix) {
  let s = 0;
  for (const k in mix) s += mix[k];
  let r = Math.random() * s;
  for (const k in mix) { r -= mix[k]; if (r <= 0) return k; }
  return Object.keys(mix)[0];
}

function generateTown(poi, gridR, spacing, mix, occupancy = 0.78) {
  for (let gx = -gridR; gx <= gridR; gx++) {
    for (let gz = -gridR; gz <= gridR; gz++) {
      if (gx === 0 && gz === 0) continue; // 镇中心留作广场
      if (Math.random() > occupancy) continue;
      const x = poi.x + gx * spacing + (Math.random() - 0.5) * 10;
      const z = poi.z + gz * spacing + (Math.random() - 0.5) * 10;
      const type = pickWeighted(mix);
      if (type === "lhouse") { tryBuildLHouse(x, z, poi.key); continue; }
      const spec = makeBuildingSpec(type, x, z, poi.key);
      if (buildingFits(spec, 4)) buildBuilding(spec);
    }
  }
}

// 学校：三段相连的两层教学楼 + 体育馆 + 操场跑道 + 篮球场 + 旗杆 + 断续围墙
function buildSchool(poi) {
  const px = poi.x, pz = poi.z;
  const mw = 18, md = 14, gap = 0.4;
  const bz = pz - 26;
  const wallColor = 0xd9cfb4;
  [-1, 0, 1].forEach(i => {
    // 相邻教学楼之间的连通门（开在南半边，避开贴西墙的楼梯井）
    const so = [];
    if (i > -1) so.push({ side: "west", z: bz + 4.5, width: 2.4, floors: [0, 1] });
    if (i < 1) so.push({ side: "east", z: bz + 4.5, width: 2.4, floors: [0, 1] });
    buildBuilding({ cx: px + i * (mw + gap), cz: bz, w: mw, d: md, floors: 2, roof: "flat", color: wallColor, roofColor: 0x6b3a2e,
      poi: "school", kind: "school", sideOpenings: so, lootMul: 1.2, floorColor: 0x8a7a66 });
  });
  // 体育馆
  buildBuilding({ cx: px + 48, cz: pz + 12, w: 20, d: 16, floors: 1, wallH: 7, roof: "flat", color: 0xa8b4bc, poi: "school", kind: "gym",
    doorW: 4.2, doorH: 4.2, roofProps: false, lootMul: 1.0 });
  // 操场跑道（椭圆环）+ 草坪
  const track = new THREE.Mesh(new THREE.RingGeometry(10.5, 13.5, 48), new THREE.MeshLambertMaterial({ color: 0xa4503c, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  track.rotation.x = -Math.PI / 2; track.scale.set(2.0, 1.0, 1);
  track.position.set(px - 10, 0.05, pz + 17);
  const field = new THREE.Mesh(new THREE.CircleGeometry(10.5, 48), new THREE.MeshLambertMaterial({ color: 0x4f7d3a, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  field.rotation.x = -Math.PI / 2; field.scale.set(2.0, 1.0, 1);
  field.position.set(px - 10, 0.05, pz + 17);
  [track, field].forEach(m => { m.receiveShadow = true; scene.add(m); freezeObject(m); });
  // 篮球场
  const court = new THREE.Mesh(new THREE.PlaneGeometry(13, 24), new THREE.MeshLambertMaterial({ color: 0x7a7f86, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
  court.rotation.x = -Math.PI / 2;
  court.position.set(px + 48, 0.05, pz - 26);
  court.receiveShadow = true;
  scene.add(court); freezeObject(court);
  [-1, 1].forEach(s => {
    addSolidBox(px + 48, 1.6, pz - 26 + s * 11.5, 0.15, 3.2, 0.15, 0x9a9da0, { los: false });
    addVisualBox(px + 48, 3.1, pz - 26 + s * 11.1, 1.8, 1.05, 0.08, 0xeeeeee, "plaster", { ao: false });
  });
  // 旗杆 + 红旗
  addSolidBox(px - 10, 4.5, pz - 8, 0.14, 9, 0.14, 0xc8c8c8, { los: false });
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.2), new THREE.MeshLambertMaterial({ color: 0xc8102e, side: THREE.DoubleSide }));
  flag.position.set(px - 9.05, 8.2, pz - 8);
  scene.add(flag); freezeObject(flag);
  // 断续围墙（留出多处缺口，AI 和玩家都能进出）
  const wx0 = px - 46, wx1 = px + 64, wz0 = pz - 44, wz1 = pz + 40;
  const fenceSeg = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az);
    if (ax === bx) addSolidBox(ax, 0.7, (az + bz) / 2, 0.3, 1.4, len, 0xb8ad98, { skipBottom: true });
    else addSolidBox((ax + bx) / 2, 0.7, az, len, 1.4, 0.3, 0xb8ad98, { skipBottom: true });
  };
  for (let x = wx0; x < wx1 - 1; x += 22) {
    fenceSeg(x, wz0, Math.min(x + 15, wx1), wz0);
    if (!(x < px + 4 && x + 15 > px - 4)) fenceSeg(x, wz1, Math.min(x + 15, wx1), wz1); // 南门对着学校支路
  }
  for (let z = wz0; z < wz1 - 1; z += 22) {
    fenceSeg(wx0, z, wx0, Math.min(z + 15, wz1));
    fenceSeg(wx1, z, wx1, Math.min(z + 15, wz1));
  }
  // 操场边的器材箱与散落物资
  for (let i = 0; i < 6; i++) {
    const lx = px - 30 + Math.random() * 40, lz = pz + 4 + Math.random() * 26;
    spawnRandomGroundLoot(lx, lz, null, 0);
  }
  reserveRect(wx0, wz0, wx1, wz1);
}

// 遗迹：古神庙台基（可登上）+ 石柱阵 + 残垣断壁 + 拱门 + 残破石塔（两层，可上楼）+ 碎石
function buildRuins(poi) {
  const px = poi.x, pz = poi.z;
  const stone = () => pickColor([0x9a9384, 0x8c8676, 0xa39c8b, 0x857f70]);
  const sk = "rock";
  // 石铺地面
  addVisualBox(px, 0.02, pz, 64, 0.04, 56, 0x8f8a7c, sk, { ao: false });
  // 台基 + 南侧台阶坡道
  addSolidBox(px, 0.7, pz, 24, 1.4, 18, stone(), { key: sk, aoBase: 0 });
  addWalkRect(px - 12, pz - 9, px + 12, pz + 9, 1.4);
  addWalkRampZ(px - 4, px + 4, pz + 9, pz + 13.5, 1.4, 0);
  for (let k = 0; k < 6; k++) {
    const top = 1.4 * (6 - k) / 6;
    addVisualBox(px, top / 2, pz + 9 + 4.5 * (k + 0.5) / 6, 8, top, 4.5 / 6, 0x9a9384, sk, { ao: false, skipBottom: true });
  }
  addSolidBox(px, 0.7, pz + 11.25, 8, 0.2, Math.hypot(4.5, 1.4), 0, { visual: false, los: false, collider: false, rotX: Math.atan2(1.4, 4.5) });
  // 石柱阵（部分断裂）
  const colGeo = new THREE.CylinderGeometry(0.55, 0.62, 1, 10);
  colGeo.userData.shared = true;
  const columnTops = [];
  for (let i = 0; i < 5; i++) {
    for (const row of [-1, 1]) {
      const x = px - 9 + i * 4.5, z = pz + row * 6;
      const h = Math.random() < 0.35 ? 1.2 + Math.random() * 2.5 : 5.5 + Math.random() * 1.2;
      const m = new THREE.Mesh(colGeo, PROXY_MAT);
      m.position.set(x, 1.4 + h / 2, z);
      m.scale.set(1, h, 1);
      addToStaticBatch(m, sk, stone(), { aoBase: 1.4 });
      shootableEnvironment.push(m);
      wallMeshesForLOS.push(m);
      addCollider(x - 0.6, x + 0.6, z - 0.6, z + 0.6, 1.4, 1.4 + h);
      columnTops.push({ x, z, h, row, i });
    }
  }
  // 完整石柱之间搭着的残存横梁
  columnTops.forEach(c => {
    const nb = columnTops.find(o => o.row === c.row && o.i === c.i + 1);
    if (nb && c.h > 5 && nb.h > 5 && Math.random() < 0.7) {
      const y = 1.4 + Math.min(c.h, nb.h) + 0.35;
      addSolidBox((c.x + nb.x) / 2, y, c.z, 5.6, 0.7, 1.3, stone(), { key: sk, collider: false, ao: false });
    }
  });
  // 台基北侧残墙
  for (let i = 0; i < 5; i++) {
    const h = 1.5 + Math.random() * 3;
    addSolidBox(px - 10 + i * 5, 1.4 + h / 2, pz - 8.6, 4.2, h, 0.7, stone(), { key: sk, aoBase: 1.4 });
  }
  // 拱门（南面入口）
  [-1, 1].forEach(s => addSolidBox(px + s * 3.2, 2.6, pz + 27, 1.4, 5.2, 1.4, stone(), { key: sk }));
  addSolidBox(px, 5.6, pz + 27, 8.2, 1.0, 1.6, stone(), { key: sk, collider: false });
  // 四周残垣（L 形墙角，高低不一，适合当掩体）
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3;
    const rr = 20 + Math.random() * 9;
    const x = px + Math.cos(a) * rr * 1.15, z = pz + Math.sin(a) * rr;
    if (Math.abs(x - px) < 5 && z > pz + 9) continue;
    const len1 = 3 + Math.random() * 4, len2 = 2 + Math.random() * 3;
    const h1 = 1.2 + Math.random() * 2.6, h2 = 0.9 + Math.random() * 2;
    addSolidBox(x, h1 / 2, z, len1, h1, 0.7, stone(), { key: sk, skipBottom: true });
    addSolidBox(x + len1 / 2 - 0.35, h2 / 2, z + len2 / 2, 0.7, h2, len2, stone(), { key: sk, skipBottom: true });
  }
  // 倒塌的石柱段
  const fallenGeo = new THREE.CylinderGeometry(0.55, 0.55, 3.2, 10);
  fallenGeo.userData.shared = true;
  for (let i = 0; i < 6; i++) {
    const x = px + (Math.random() - 0.5) * 50, z = pz + (Math.random() - 0.5) * 44;
    if (Math.abs(x - px) < 14 && Math.abs(z - pz) < 15) continue;
    const m = new THREE.Mesh(fallenGeo, PROXY_MAT);
    const alongX = Math.random() < 0.5;
    m.position.set(x, 0.55, z);
    if (alongX) m.rotation.z = Math.PI / 2; else m.rotation.x = Math.PI / 2;
    addToStaticBatch(m, sk, stone(), { ao: false });
    shootableEnvironment.push(m);
    wallMeshesForLOS.push(m);
    if (alongX) addCollider(x - 1.6, x + 1.6, z - 0.55, z + 0.55, 0, 1.1);
    else addCollider(x - 0.55, x + 0.55, z - 1.6, z + 1.6, 0, 1.1);
  }
  // 残破石塔（两层、无顶，可上楼俯瞰）
  buildBuilding({ cx: px + 34, cz: pz - 16, w: 10, d: 10, floors: 2, roof: "none", color: 0x8c8676, key: sk, poi: "ruins", kind: "ruin",
    furniture: false, trim: false, roofProps: false, lootMul: 1.3, floorColor: 0x7c7668 });
  // 台基上和周围的物资
  for (let i = 0; i < 5; i++) spawnRandomGroundLoot(px - 9 + Math.random() * 18, pz - 6 + Math.random() * 12, null, 1.4);
  for (let i = 0; i < 6; i++) {
    const x = px + (Math.random() - 0.5) * 50, z = pz + (Math.random() - 0.5) * 44;
    if (!isPointBlocked2D(x, z, 0.4, 0) && getGroundHeight(x, z, 0.1) === 0) spawnRandomGroundLoot(x, z, null, 0);
  }
  reserveRect(px - 32, pz - 28, px + 40, pz + 30);
}

// 农场：农舍 + 谷仓 + 草垛
const farmPois = [];
function tryBuildFarm(x, z, idx) {
  const house = makeBuildingSpec(Math.random() < 0.5 ? "house2" : "house", x, z, null);
  const barn = makeBuildingSpec("warehouse", x + 22, z + (Math.random() - 0.5) * 8, null);
  barn.w = 13 + Math.random() * 3; barn.d = 11 + Math.random() * 3; barn.wallH = 5;
  if (!buildingFits(house, 6) || !isRectBuildable(barn.cx - barn.w / 2, barn.cz - barn.d / 2, barn.cx + barn.w / 2, barn.cz + barn.d / 2, 4)) return false;
  const key = "farm" + idx;
  const poi = { key, name: "", x: x + 11, z, r: 32, weight: 0.6, buildings: [] };
  POIS.push(poi); POI_BY_KEY[key] = poi; farmPois.push(poi);
  house.poi = key; barn.poi = key;
  buildBuilding(house);
  buildBuilding(barn);
  for (let i = 0; i < 4; i++) {
    const hx = x + 6 + Math.random() * 28, hz = z + 14 + Math.random() * 8;
    if (isPointBlocked2D(hx, hz, 1.6, 0)) continue;
    const hay = new THREE.Mesh(HAY_GEO, PROXY_MAT);
    hay.rotation.z = Math.PI / 2;
    hay.position.set(hx, 0.75, hz);
    addToStaticBatch(hay, "bark", 0xd4ae4a, { ao: false, shadeFn: p => 0.72 + 0.28 * Math.min(1, p.y / 1.5) });
    shootableEnvironment.push(hay);
    wallMeshesForLOS.push(hay);
    addCollider(hx - 1.1, hx + 1.1, hz - 1.1, hz + 1.1, 0, 1.5);
  }
  return true;
}

const HAY_GEO = new THREE.CylinderGeometry(1.1, 1.1, 1.5, 10);
HAY_GEO.userData.shared = true;

const TOWN_MIX_CITY = { house: 25, house2: 33, apartment: 22, lhouse: 12, warehouse: 8 };
const TOWN_MIX_VILLAGE = { house: 42, house2: 30, lhouse: 16, warehouse: 12 };
buildSchool(POI_BY_KEY.school);
buildRuins(POI_BY_KEY.ruins);
generateTown(POI_BY_KEY.pcity, 4, 46, TOWN_MIX_CITY, 0.8);
["rcity", "ycity", "lcity", "mcity"].forEach(k => generateTown(POI_BY_KEY[k], 2, 46, TOWN_MIX_VILLAGE, 0.8));

// 散布在野外的农场
for (let i = 0, made = 0; i < 160 && made < 24; i++) {
  const x = (Math.random() - 0.5) * (MAP_SIZE - 260), z = (Math.random() - 0.5) * (MAP_SIZE - 260);
  if (POIS.some(p => Math.hypot(p.x - x, p.z - z) < p.r + 90)) continue;
  if (tryBuildFarm(x, z, made)) made++;
}
// 路边零散民房
for (let i = 0, made = 0; i < 300 && made < 36; i++) {
  const poly = roadPolylines[Math.floor(Math.random() * roadPolylines.length)];
  const k = 1 + Math.floor(Math.random() * (poly.pts.length - 2));
  const [ax, az] = poly.pts[k - 1], [bx, bz] = poly.pts[k + 1];
  const tl = Math.hypot(bx - ax, bz - az) || 1;
  const side = Math.random() < 0.5 ? -1 : 1;
  const off = poly.w / 2 + 14 + Math.random() * 12;
  const x = poly.pts[k][0] - (bz - az) / tl * off * side, z = poly.pts[k][1] + (bx - ax) / tl * off * side;
  if (Math.abs(x) > MAP_LIMIT - 60 || Math.abs(z) > MAP_LIMIT - 60) continue;
  if (POIS.some(p => !p.key.startsWith("farm") && Math.hypot(p.x - x, p.z - z) < p.r + 40)) continue;
  const spec = makeBuildingSpec(Math.random() < 0.55 ? "house" : (Math.random() < 0.7 ? "house2" : "warehouse"), x, z, null);
  if (buildingFits(spec, 4)) { buildBuilding(spec); made++; }
}

// ---------------------------------------------------------------------------
// 3.15 植被与岩石：成片树林 + 零散树木、岩石、草垛、灌木
// ---------------------------------------------------------------------------
const trunkMat = new THREE.MeshLambertMaterial({ color: 0x4a3525 });
const leafMat = new THREE.MeshLambertMaterial({ color: 0x2d4c2b });
const rockMat = new THREE.MeshLambertMaterial({ color: 0x6b6e70 });

// 树冠：低多边形硬边造型（松树叠层锥 / 阔叶树团簇），每棵树色调与大小随机，纯视觉不影响碰撞
const FOLIAGE_COLORS = [0x2d4c2b, 0x355a2c, 0x2b5034, 0x41602e, 0x3a5526];
const foliageConeGeo = (() => { const g = new THREE.ConeGeometry(1, 1, 7).toNonIndexed(); g.computeVertexNormals(); return g; })();
const foliageBlobGeo = new THREE.IcosahedronGeometry(1, 0);
const TRUNK_GEO = new THREE.CylinderGeometry(0.4, 0.5, 3.6, 7);
TRUNK_GEO.userData.shared = true;
const ROCK_GEO = new THREE.DodecahedronGeometry(1.6, 0);
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

// 植被摆放点是否合适：不出界、不在河里/路上、不压建筑
function canPlaceProp(x, z, clearance) {
  if (Math.abs(x) > MAP_LIMIT - 30 || Math.abs(z) > MAP_LIMIT - 30) return false;
  if (Math.abs(z - RIVER_Z) < RIVER_HALF + clearance + 2) return false;
  if (roadEdgeDistance(x, z, clearance + 4) < clearance) return false;
  return !isRectReserved(x, z, x, z, clearance + 1);
}

function plantTree(tx, tz) {
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(TRUNK_GEO, trunkMat);
  trunk.position.y = 1.8;
  tree.add(trunk);
  tree.position.set(tx, 0, tz);
  tree.updateMatrixWorld(true);
  addToStaticBatch(trunk, "bark", 0x5c4331, { ao: false, shadeFn: p => 0.75 + 0.25 * Math.min(1, p.y / 3) });
  addTreeFoliageToBatch(tx, tz);
  shootableEnvironment.push(trunk);
  wallMeshesForLOS.push(trunk);
  addCollider(tx - 0.45, tx + 0.45, tz - 0.45, tz + 0.45, 0, 3.6);
}

// 成片树林（记录位置，用于地图上画出林区）
const forestPatches = [];
for (let f = 0, made = 0; f < 60 && made < 13; f++) {
  const fx = (Math.random() - 0.5) * (MAP_SIZE - 400), fz = (Math.random() - 0.5) * (MAP_SIZE - 400);
  if (POIS.some(p => Math.hypot(p.x - fx, p.z - fz) < p.r + 120)) continue;
  made++;
  const fr = 70 + Math.random() * 90, n = 30 + Math.floor(Math.random() * 30);
  forestPatches.push({ x: fx, z: fz, r: fr });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * fr;
    const tx = fx + Math.cos(a) * rr, tz = fz + Math.sin(a) * rr;
    if (canPlaceProp(tx, tz, 3)) plantTree(tx, tz);
  }
}
// 零散树木
for (let i = 0; i < 300; i++) {
  const tx = (Math.random() - 0.5) * (MAP_SIZE - 120), tz = (Math.random() - 0.5) * (MAP_SIZE - 120);
  if (canPlaceProp(tx, tz, 3)) plantTree(tx, tz);
}
// 岩石与草垛（遗迹附近多放碎石）
for (let i = 0; i < 300; i++) {
  let rx, rz;
  if (i < 30) {
    const a = Math.random() * Math.PI * 2, rr = 40 + Math.random() * 70;
    rx = POI_BY_KEY.ruins.x + Math.cos(a) * rr; rz = POI_BY_KEY.ruins.z + Math.sin(a) * rr;
  } else {
    rx = (Math.random() - 0.5) * (MAP_SIZE - 160); rz = (Math.random() - 0.5) * (MAP_SIZE - 160);
  }
  if (!canPlaceProp(rx, rz, 4)) continue;
  if (Math.random() < 0.68) {
    const rock = new THREE.Mesh(ROCK_GEO, rockMat);
    rock.position.set(rx, 0.9, rz);
    rock.scale.set(1.2, 0.85, 1.1);
    addToStaticBatch(rock, "rock", Math.random() < 0.5 ? 0x7a7d7f : 0x6b6e70, { ao: false, shadeFn: p => 0.7 + 0.3 * Math.min(1, p.y / 1.4) });
    shootableEnvironment.push(rock);
    wallMeshesForLOS.push(rock);
    addCollider(rx - 1.4, rx + 1.4, rz - 1.3, rz + 1.3, 0, 1.8);
  } else {
    const hay = new THREE.Mesh(HAY_GEO, PROXY_MAT);
    hay.rotation.z = Math.PI / 2;
    hay.position.set(rx, 0.75, rz);
    addToStaticBatch(hay, "bark", 0xd4ae4a, { ao: false, shadeFn: p => 0.72 + 0.28 * Math.min(1, p.y / 1.5) });
    shootableEnvironment.push(hay);
    wallMeshesForLOS.push(hay);
    addCollider(rx - 1.1, rx + 1.1, rz - 1.1, rz + 1.1, 0, 1.5);
  }
}

// 装饰灌木（纯视觉，可穿行，和端游草丛一样不挡子弹）
for (let i = 0; i < 760; i++) {
  const bx = (Math.random() - 0.5) * (MAP_SIZE - 80);
  const bz = (Math.random() - 0.5) * (MAP_SIZE - 80);
  if (!canPlaceProp(bx, bz, 1.5)) continue;
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
syncColliderGrid();

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
// 航线：每局随机方向、随机偏离中心，横穿整张地图（端游同款），飞行高度 300 米
const PLANE_ALT = 300;
const PLANE_SPEED = 85;
const flightPath = { sx: 0, sz: 0, dx: 1, dz: 0, len: 1, travel: 0 };
(function planFlightPath() {
  const ang = Math.random() * Math.PI * 2;
  const dx = Math.cos(ang), dz = Math.sin(ang);
  const off = (Math.random() - 0.5) * 900;
  const ox = -dz * off, oz = dx * off;
  const half = MAP_SIZE / 2 - 100;
  let t0 = -Infinity, t1 = Infinity;
  [[ox, dx], [oz, dz]].forEach(([o, d]) => {
    if (Math.abs(d) < 1e-6) return;
    const a = (-half - o) / d, b = (half - o) / d;
    t0 = Math.max(t0, Math.min(a, b));
    t1 = Math.min(t1, Math.max(a, b));
  });
  flightPath.sx = ox + dx * t0; flightPath.sz = oz + dz * t0;
  flightPath.dx = dx; flightPath.dz = dz;
  flightPath.len = t1 - t0;
})();
function flightPointAt(s) {
  return { x: flightPath.sx + flightPath.dx * s, z: flightPath.sz + flightPath.dz * s };
}
planeGroup.position.set(flightPath.sx, PLANE_ALT, flightPath.sz);
planeGroup.lookAt(flightPath.sx + flightPath.dx * 50, PLANE_ALT, flightPath.sz + flightPath.dz * 50);
scene.add(planeGroup);

// ============================================================================
// 4. 空投补给系统
// ============================================================================
const airdrops = [];
let nextAirdropTime = 80;

function spawnAirdropEvent() {
  const dropX = zoneState.cx + (Math.random() - 0.5) * zoneState.targetR * 1.1;
  const dropZ = zoneState.cz + (Math.random() - 0.5) * zoneState.targetR * 1.1;
  const landY = getGroundHeight(dropX, dropZ, 1e9); // 可能落在平顶楼的屋顶上

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
    sp.position.set(dropX, landY + 1.2 + i * 0.9, dropZ);
    scene.add(sp);
    smokeParticles.push(sp);
  }

  airdrops.push({
    x: dropX, z: dropZ, landY,
    crateGroup, chute, smokeParticles,
    landed: false,
    smokeEndTime: 0
  });

  showToast("✈️ 空投补给箱已投放在安全区附近，注意抬头查看红色浓烟！");
}

function populateAirdropLoot(ax, az, ay = 0) {
  const airdropWeps = ["awm", "amr", "aug", "mk14", "m249"];
  const wKey = airdropWeps[Math.floor(Math.random() * airdropWeps.length)];
  const wep = WEAPONS_DATA[wKey];

  spawnRandomGroundLoot(ax + 0.9, az, {
    kind: "weapon", id: wKey, name: `🔥${wep.name}`, ammoInMag: wep.mag, attachments: {}
 }, ay);
  spawnRandomGroundLoot(ax + 1.3, az + 0.5, {
    kind: "ammo", id: wep.ammoType, name: `${wep.ammoType} 子弹`, count: wep.ammoType === ".50BMG" ? 20 : 60
 }, ay);
  spawnRandomGroundLoot(ax - 0.9, az + 0.4, {
    kind: "gear", sub: "helm", name: "🔥3级头盔", lv: 3, dur: 240, maxDur: 240
 }, ay);
  spawnRandomGroundLoot(ax - 0.9, az - 0.4, {
    kind: "gear", sub: "vest", name: "🔥3级防弹衣", lv: 3, dur: 300, maxDur: 300
 }, ay);
  spawnRandomGroundLoot(ax, az + 1.0, {
    kind: "attachment", id: "8x", name: ATTACHMENTS_DATA["8x"].name, slot: "scope"
 }, ay);
  spawnRandomGroundLoot(ax, az - 1.0, {
    kind: "med", id: "adrenaline", name: MEDS_DATA["adrenaline"].name, count: 1
 }, ay);
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
  casting: null,
  // 立体移动：脚底高度（站在哪层楼/楼梯/屋顶上）+ 视线高度（随站/蹲/趴平滑过渡）
  feetY: 0,
  eyeH: 1.7,
  stepAccum: 0,
  // 投掷物
  throwBag: { frag: 0, smoke: 0, stun: 0, molotov: 0 },
  throwSel: "frag",
  aimingThrow: false,
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

  // 跳伞规划：按本局航线挑一个够得着的落点（城镇/学校/遗迹/农场/野外），并在飞机最接近落点时跳下
  const plan = planBotLanding();
  const landTarget = new THREE.Vector3(plan.x, 0, plan.z);

  const bot = {
    id,
    name: (AI_NAMES[id % AI_NAMES.length] || "Survivor") + "_" + (10 + id),
    group, legL, legR, body, head, botGunMesh, chuteMesh,
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
    frags: 0,
    nextGrenadeTime: 0,
    stunnedUntil: 0,
    fleeX: 0, fleeZ: 0, fleeUntil: 0,
    stepAccum: 0,
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
    if (bot.weapons[0] && bot.weapons[1]) return 0;
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

function botPickupLoot(bot, entry, now) {
  const it = entry.item;
  if (botLootScore(bot, it) <= 0) return;
  if (it.kind === "weapon") {
    botGiveWeapon(bot, it.id, it.attachments);
  } else if (it.kind === "gear") {
    if (it.sub === "helm") bot.helmLv = it.lv;
    else if (it.sub === "vest") bot.vestLv = it.lv;
    else bot.bagLv = it.lv;
  } else if (it.kind === "med") {
    bot.meds = Math.min(BOT_MED_CAP[bot.bagLv], bot.meds + (it.count || 1));
  } else if (it.kind === "attachment") {
    bot.weaponAtts[botAttachmentTargetSlot(bot, it)][it.slot] = it.id;
  } else if (it.kind === "throwable") {
    bot.frags += it.count || 1;
  }
  removeLootEntry(entry);
  bot.pauseUntil = now + 300 + Math.random() * 500; // 捡东西的短暂停顿
}

// 命中率：随距离从近距值过渡到远距值；倍镜提升远距离命中、枪口/握把更稳；玩家蹲/趴更难被打中
function botHitChance(bot, prof, dist) {
  let p = prof.hitNear + (prof.hitFar - prof.hitNear) * smoothstep(prof.nearR, prof.farR, dist);
  const atts = bot.weaponAtts[bot.activeSlot];
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
      if (Math.random() < hitP) damagePlayer(botShotDamage(wData, prof, d), bot.name, wData.name);
    }, s * gap);
  }
  botAfterShots(bot, shots, dist, now);
}

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
// 任意两点之间是否没有墙体/楼板阻挡（多层楼时楼板也会挡视线）
function losSegmentClear(ax, ay, az, bx, by, bz) {
  if (losGridCount !== wallMeshesForLOS.length) syncLOSGrid();
  const origin = new THREE.Vector3(ax, ay, az);
  const dir = new THREE.Vector3(bx - ax, by - ay, bz - az);
  const dist = dir.length();
  if (dist < 1e-4) return true;
  dir.normalize();
  gatherLOSCandidates(ax, az, bx, bz);
  losRaycaster.set(origin, dir);
  losRaycaster.far = dist;
  return losRaycaster.intersectObjects(losCandidates, false).length === 0;
}
// 烟雾弹的烟团会挡住 AI 视线
function smokeBlocksSegment(ax, ay, az, bx, by, bz) {
  for (let i = 0; i < smokeClouds.length; i++) {
    const c = smokeClouds[i];
    if (c.r < 1.5) continue;
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L2 = dx * dx + dy * dy + dz * dz;
    let t = L2 > 0 ? ((c.x - ax) * dx + (c.y - ay) * dy + (c.z - az) * dz) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    const qx = ax + dx * t - c.x, qy = ay + dy * t - c.y, qz = az + dz * t - c.z;
    if (qx * qx + qy * qy * 2.2 + qz * qz < (c.r * 0.85) * (c.r * 0.85)) return true;
  }
  return false;
}
// eyeA / eyeB：在两个位置的 y 上再加多少作为视线高度（AI 传入的是脚底位置，玩家传入的是眼睛位置）
function hasLineOfSight(posA, posB, eyeA = 1.5, eyeB = 1.5) {
  const ay = posA.y + eyeA, by = posB.y + eyeB;
  if (smokeClouds.length && smokeBlocksSegment(posA.x, ay, posA.z, posB.x, by, posB.z)) return false;
  return losSegmentClear(posA.x, ay, posA.z, posB.x, by, posB.z);
}

// 子弹射线检测空间网格：只测试弹道经过的格子里的物体（结果与全量检测一致；大地图上上万个物体时依然流畅）
const SHOOT_CELL = 8;
const shootGrid = new Map();
let shootGridCount = 1; // 0 号是覆盖全图的地面代理，单独处理
let shootStamp = 0;
const shootCandidates = [];
function syncShootGrid() {
  while (shootGridCount < shootableEnvironment.length) {
    const m = shootableEnvironment[shootGridCount++];
    _losBox.setFromObject(m);
    const x0 = Math.floor((_losBox.min.x - 0.05) / SHOOT_CELL), x1 = Math.floor((_losBox.max.x + 0.05) / SHOOT_CELL);
    const z0 = Math.floor((_losBox.min.z - 0.05) / SHOOT_CELL), z1 = Math.floor((_losBox.max.z + 0.05) / SHOOT_CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = gridKey(ix, iz);
        let arr = shootGrid.get(k);
        if (!arr) { arr = []; shootGrid.set(k, arr); }
        arr.push(m);
      }
    }
  }
}
function gatherShootCandidates(ray, far) {
  if (shootGridCount !== shootableEnvironment.length) syncShootGrid();
  shootStamp++;
  shootCandidates.length = 0;
  shootCandidates.push(shootableEnvironment[0]);
  for (let i = 0; i < aiHitboxes.length; i++) shootCandidates.push(aiHitboxes[i]);
  const x0 = ray.origin.x, z0 = ray.origin.z;
  const dx = ray.direction.x * far, dz = ray.direction.z * far;
  let cx = Math.floor(x0 / SHOOT_CELL), cz = Math.floor(z0 / SHOOT_CELL);
  const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
  const tDeltaX = dx !== 0 ? Math.abs(SHOOT_CELL / dx) : Infinity;
  const tDeltaZ = dz !== 0 ? Math.abs(SHOOT_CELL / dz) : Infinity;
  let tMaxX = dx !== 0 ? (dx > 0 ? (cx + 1) * SHOOT_CELL - x0 : x0 - cx * SHOOT_CELL) / Math.abs(dx) : Infinity;
  let tMaxZ = dz !== 0 ? (dz > 0 ? (cz + 1) * SHOOT_CELL - z0 : z0 - cz * SHOOT_CELL) / Math.abs(dz) : Infinity;
  for (let guard = 0; guard < 4096; guard++) {
    const arr = shootGrid.get(gridKey(cx, cz));
    if (arr) {
      for (let i = 0; i < arr.length; i++) {
        const m = arr[i];
        if (m.__shootStamp !== shootStamp) { m.__shootStamp = shootStamp; shootCandidates.push(m); }
      }
    }
    if (tMaxX < tMaxZ) {
      if (tMaxX > 1) break;
      tMaxX += tDeltaX; cx += stepX;
    } else {
      if (tMaxZ > 1) break;
      tMaxZ += tDeltaZ; cz += stepZ;
    }
  }
  return shootCandidates;
}

// 地图边长翻倍后，各阶段安全区半径同比放大，前两阶段等待/收缩时间加长（徒步跑圈距离变远）
const ZONE_STAGES = [
  { waitSec: 120, shrinkSec: 100, targetR: 920, dps: 1.0 },
  { waitSec: 80,  shrinkSec: 70,  targetR: 520, dps: 1.8 },
  { waitSec: 60,  shrinkSec: 55,  targetR: 270, dps: 3.0 },
  { waitSec: 45,  shrinkSec: 45,  targetR: 130, dps: 5.0 },
  { waitSec: 35,  shrinkSec: 40,  targetR: 44,  dps: 8.0 }
];

const zoneState = {
  cx: (Math.random() - 0.5) * 960,
  cz: (Math.random() - 0.5) * 960,
  curR: 1560,
  startR: 1560,
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

// AI 投雷：按抛物线精确计算出手速度，丢到玩家位置附近（带随机误差），引信约在落地后 1 秒爆炸
function botThrowGrenade(bot) {
  const pos = bot.group.position;
  const tx = playerRig.position.x + (Math.random() - 0.5) * 5, tz = playerRig.position.z + (Math.random() - 0.5) * 5;
  const ty = player.feetY + 0.1;
  const origin = new THREE.Vector3(pos.x, pos.y + 1.7, pos.z);
  const d = Math.hypot(tx - origin.x, tz - origin.z);
  const T = Math.max(0.8, Math.min(1.9, d / 13));
  const vel = new THREE.Vector3((tx - origin.x) / T, (ty - origin.y + 0.5 * THROW_GRAVITY * T * T) / T, (tz - origin.z) / T);
  bot.frags--;
  setBotFaceHint(bot, tx, tz, 900);
  sfx.playThrow();
  spawnThrowable("frag", origin, vel, bot.name, false, T + 1.1);
}

// ---------------------------------------------------------------------------
// 玩家投掷：按住投掷键瞄准（显示抛物线与落点圈，可拖动转视角），松手扔出
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
// 手里握着的投掷物（第一人称，图层 1）
const throwHandMesh = new THREE.Mesh(throwableGeo("frag"), lootMergedMat);
throwHandMesh.position.set(0.25, -0.22, -0.55);
throwHandMesh.scale.setScalar(0.8);
throwHandMesh.layers.set(1);
throwHandMesh.visible = false;
camera.add(throwHandMesh);

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

function beginThrowAim() {
  if (player.phase !== "ground" || player.aimingThrow) return;
  if ((player.throwBag[player.throwSel] || 0) <= 0) {
    const next = THROW_ORDER.find(k => player.throwBag[k] > 0);
    if (!next) { showToast("没有投掷物"); return; }
    player.throwSel = next;
  }
  if (player.isADS) { player.isADS = false; player.reopenADSAfterBolt = false; updateScopeState(); }
  if (player.casting && player.casting.title.includes("💊")) cancelCastProgress();
  player.isFiring = false;
  player.aimingThrow = true;
  throwHandMesh.geometry = throwableGeo(player.throwSel);
  throwHandMesh.visible = true;
  sfx.playPinPull();
}

function releaseThrow() {
  if (!player.aimingThrow) return;
  player.aimingThrow = false;
  throwHandMesh.visible = false;
  throwPreviewLine.visible = false;
  throwPreviewRing.visible = false;
  const id = player.throwSel;
  if (player.phase !== "ground" || (player.throwBag[id] || 0) <= 0) return;
  const { origin, vel } = throwLaunch(id);
  player.throwBag[id]--;
  player.lastThrowTime = performance.now();
  sfx.playThrow();
  spawnThrowable(id, origin, vel, "你 (Player)", true);
  if (player.throwBag[id] <= 0) {
    const next = THROW_ORDER.find(k => player.throwBag[k] > 0);
    if (next) player.throwSel = next;
  }
  updateAllHUD();
}

// 不扔出、直接收回（阵亡 / 打开背包时）
function cancelThrowAim() {
  if (!player.aimingThrow) return;
  player.aimingThrow = false;
  throwHandMesh.visible = false;
  throwPreviewLine.visible = false;
  throwPreviewRing.visible = false;
}

function cycleThrowable() {
  const owned = THROW_ORDER.filter(k => player.throwBag[k] > 0);
  if (!owned.length) { showToast("没有投掷物"); return; }
  const i = owned.indexOf(player.throwSel);
  player.throwSel = owned[(i + 1) % owned.length];
  if (player.aimingThrow) throwHandMesh.geometry = throwableGeo(player.throwSel);
  sfx.playBoltAction();
  updateAllHUD();
}

// 瞄准时每帧模拟一遍抛物线，画出轨迹与落点
function updateThrowPreview() {
  if (!player.aimingThrow) return;
  const { origin, vel } = throwLaunch(player.throwSel);
  const p = origin.clone(), v = vel.clone();
  const arr = throwPreviewLine.geometry.attributes.position.array;
  let n = 0, landed = false;
  for (; n < THROW_PREVIEW_POINTS; n++) {
    arr[n * 3] = p.x; arr[n * 3 + 1] = p.y; arr[n * 3 + 2] = p.z;
    if (landed) continue;
    for (let k = 0; k < 3; k++) {
      if (throwPhysicsStep(p, v, 1 / 45)) { landed = true; break; }
    }
  }
  if (!landed) n = THROW_PREVIEW_POINTS;
  for (let k = n; k < THROW_PREVIEW_POINTS; k++) { arr[k * 3] = p.x; arr[k * 3 + 1] = p.y; arr[k * 3 + 2] = p.z; }
  throwPreviewLine.geometry.attributes.position.needsUpdate = true;
  throwPreviewLine.visible = true;
  throwPreviewRing.position.set(p.x, p.y - 0.03, p.z);
  throwPreviewRing.visible = true;
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
  crate.position.set(bot.group.position.x, bot.group.position.y + 0.23, bot.group.position.z);
  crate.castShadow = true;
  scene.add(crate);
  freezeObject(crate);

  const bx = bot.group.position.x, bz = bot.group.position.z, by = bot.group.position.y;
  // 盒子掉落 AI 身上的全部装备：两把枪（连同配件）+ 对应子弹、头盔、防弹衣、背包、药品、手雷
  bot.weapons.forEach((wk, i) => {
    if (!wk) return;
    const wd = WEAPONS_DATA[wk];
    spawnRandomGroundLoot(bx + 0.35, bz - 0.3 + i * 0.6, {
      kind: "weapon", id: wk, name: wd.name, ammoInMag: wd.mag, attachments: Object.assign({}, bot.weaponAtts[i])
    }, by);
    spawnRandomGroundLoot(bx + 0.85, bz - 0.3 + i * 0.6, {
      kind: "ammo", id: wd.ammoType, name: `${wd.ammoType} 子弹`, count: wd.type === "SG" ? 10 : 30
    }, by);
  });
  if (bot.helmLv) spawnRandomGroundLoot(bx - 0.45, bz - 0.35, { kind: "gear", sub: "helm", name: `${bot.helmLv}级头盔`, lv: bot.helmLv, dur: bot.helmLv * 80, maxDur: bot.helmLv * 80 }, by);
  if (bot.vestLv) spawnRandomGroundLoot(bx - 0.45, bz + 0.15, { kind: "gear", sub: "vest", name: `${bot.vestLv}级防弹衣`, lv: bot.vestLv, dur: bot.vestLv * 100, maxDur: bot.vestLv * 100 }, by);
  if (bot.bagLv) spawnRandomGroundLoot(bx - 0.9, bz - 0.1, { kind: "gear", sub: "bag", name: `${bot.bagLv}级背包`, lv: bot.bagLv, capBonus: bot.bagLv * 70 }, by);
  if (bot.meds > 0) spawnRandomGroundLoot(bx, bz + 0.6, { kind: "med", id: "firstaid", name: MEDS_DATA.firstaid.name, count: Math.min(3, bot.meds) }, by);
  if (bot.frags > 0) spawnRandomGroundLoot(bx + 0.5, bz + 0.6, { kind: "throwable", id: "frag", name: THROWABLES_DATA.frag.name, count: bot.frags }, by);
  spawnRandomGroundLoot(bx - 0.35, bz + 0.25, null, by);

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
  // 毒圈、坠落、燃烧不受防弹衣减免
  const ignoreArmor = attackerName === "电网蓝圈 (Blue Zone)" || wepName === "跌落" || wepName === "燃烧瓶";
  if (!ignoreArmor && player.vest && player.vest.dur > 0) {
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
    cancelThrowAim();
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
    const newAtts = Object.assign({}, it.attachments || {});
    if (oldWep) {
      // 端游同款换枪：旧枪上的配件自动装到新枪上；新枪装不上的放进背包；背包也满了才随旧枪留在地上
      // （原版会把配件连同旧枪一起丢在地上，看起来就像配件“莫名其妙消失”了）
      const newSlots = WEAPONS_DATA[it.id].slots;
      const keptOnOld = {}, moved = [], bagged = [];
      Object.keys(oldWep.attachments).forEach(slot => {
        const attId = oldWep.attachments[slot];
        const a = ATTACHMENTS_DATA[attId];
        if (!a) return;
        if (newSlots.includes(slot) && !newAtts[slot]) {
          newAtts[slot] = attId;
          moved.push(a.name);
        } else if (getUsedBagWeight() + (a.weight || 10) <= player.maxCap) {
          player.attBag.push({ id: a.id, name: a.name, slot: a.slot });
          bagged.push(a.name);
        } else {
          keptOnOld[slot] = attId;
        }
      });
      spawnRandomGroundLoot(
        playerRig.position.x + (Math.random() - 0.5) * 1.2,
        playerRig.position.z + (Math.random() - 0.5) * 1.2,
        { kind: "weapon", id: oldWep.id, name: oldWep.name, ammoInMag: oldWep.ammoInMag, attachments: keptOnOld, noAutoPickup: true },
        player.feetY
      );
      const msg = [];
      if (moved.length) msg.push(`配件已转移到新枪：${moved.join("、")}`);
      if (bagged.length) msg.push(`放入背包：${bagged.join("、")}`);
      if (msg.length) showToast("🔧 " + msg.join("；"));
    }
    player.weapons[targetSlot] = {
      id: it.id,
      name: it.name.replace("🔥", ""),
      ammoInMag: it.ammoInMag,
      fireMode: WEAPONS_DATA[it.id].modes[0],
      attachments: newAtts
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
  } else if (it.kind === "throwable") {
    const tw = THROWABLES_DATA[it.id].weight * (it.count || 1);
    if (curWeight + tw > player.maxCap) {
      showToast("⚠️ 背包空间不足，无法拾取该投掷物！");
      return;
    }
    player.throwBag[it.id] = (player.throwBag[it.id] || 0) + (it.count || 1);
    if ((player.throwBag[player.throwSel] || 0) <= 0) player.throwSel = it.id;
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

  lootEntry.gone = true;
  scene.remove(lootEntry.mesh);
  worldLootItems.splice(idx, 1);
  sfx.playBoltAction();
  updateAllHUD();
  if (document.getElementById("backpack-modal").style.display === "flex") renderBackpackModal();
}

// ---------------------------------------------------------------------------
// 自动拾取（仿手游）：武器栏有空位时自动捡枪；自动捡手中枪械的子弹、更高级的头盔/甲/背包、
// 当前枪空位可装的配件、少量药品。自己从背包丢出的东西不会被再次自动捡起
// ---------------------------------------------------------------------------
const AUTO_MED_LIMIT = { medkit: 1, firstaid: 3, bandage: 8, adrenaline: 1, painkiller: 3, drink: 4 };
const AUTO_AMMO_LIMIT = 240;
const AUTO_THROW_LIMIT = { frag: 3, smoke: 2, stun: 2, molotov: 2 };

function wantsAutoPickup(it) {
  if (it.noAutoPickup) return false;
  const freeW = player.maxCap - getUsedBagWeight();
  if (it.kind === "weapon") return player.weapons[0] === null || player.weapons[1] === null;
  if (it.kind === "ammo") {
    return player.weapons.some(w => w && WEAPONS_DATA[w.id].ammoType === it.id) &&
      (player.ammoBag[it.id] || 0) < AUTO_AMMO_LIMIT && freeW >= (AMMO_WEIGHT[it.id] || 0.5);
  }
  if (it.kind === "gear") {
    if (it.sub === "helm") return !player.helm || it.lv > player.helm.lv;
    if (it.sub === "vest") return !player.vest || it.lv > player.vest.lv;
    return it.lv > player.bagLv;
  }
  if (it.kind === "med") {
    return (player.medBag[it.id] || 0) < (AUTO_MED_LIMIT[it.id] || 0) &&
      freeW >= (MEDS_DATA[it.id]?.weight || 5) * (it.count || 1);
  }
  if (it.kind === "attachment") {
    const w = player.weapons[player.activeSlot];
    return !!w && WEAPONS_DATA[w.id].slots.includes(it.slot) && !w.attachments[it.slot];
  }
  if (it.kind === "throwable") {
    return (player.throwBag[it.id] || 0) < (AUTO_THROW_LIMIT[it.id] || 0) && freeW >= THROWABLES_DATA[it.id].weight * (it.count || 1);
  }
  return false;
}

// 玩家与物资之间没有墙才自动捡（防止隔墙吸物资）
function isLootReachable(px, pz, lx, lz) {
  const d = Math.hypot(lx - px, lz - pz);
  const steps = Math.ceil(d / 0.25);
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (t * d > d - 0.35) break;
    if (isPointBlocked2D(px + (lx - px) * t, pz + (lz - pz) * t, 0.02, player.feetY)) return false;
  }
  return true;
}

function tryAutoPickup(near) {
  if (!gameSettings.autoPickup || player.phase !== "ground") return;
  const px = playerRig.position.x, pz = playerRig.position.z;
  let best = null, bestD = 2.4;
  for (let i = 0; i < near.length; i++) {
    const e = near[i];
    const d = Math.hypot(e.x - px, e.z - pz);
    if (d < bestD && wantsAutoPickup(e.item) && isLootReachable(px, pz, e.x, e.z)) { best = e; bestD = d; }
  }
  if (!best) return;
  const name = best.item.name + (best.item.count ? " x" + best.item.count : "");
  pickupLootObject(best);
  if (best.gone) showToast(`✅ 自动拾取：${name}`);
}

window.dropAttachmentFromBag = function(attIndex) {
  const att = player.attBag[attIndex];
  if (!att) return;
  player.attBag.splice(attIndex, 1);
  spawnRandomGroundLoot(
    playerRig.position.x + (Math.random() - 0.5) * 1.4,
    playerRig.position.z + (Math.random() - 0.5) * 1.4,
    { kind: "attachment", id: att.id, name: att.name, slot: att.slot, noAutoPickup: true },
    player.feetY
  );
  sfx.playBoltAction();
  updateAllHUD();
  renderBackpackModal();
};

window.dropThrowableFromBag = function(id) {
  if ((player.throwBag[id] || 0) <= 0) return;
  player.throwBag[id]--;
  spawnRandomGroundLoot(
    playerRig.position.x + (Math.random() - 0.5) * 1.4,
    playerRig.position.z + (Math.random() - 0.5) * 1.4,
    { kind: "throwable", id, name: THROWABLES_DATA[id].name, count: 1, noAutoPickup: true },
    player.feetY
  );
  sfx.playBoltAction();
  updateAllHUD();
  renderBackpackModal();
};

window.selectThrowable = function(id) {
  if ((player.throwBag[id] || 0) <= 0) return;
  player.throwSel = id;
  updateAllHUD();
  renderBackpackModal();
};

window.dropMedFromBag = function(medId) {
  if ((player.medBag[medId] || 0) <= 0) return;
  player.medBag[medId]--;
  spawnRandomGroundLoot(
    playerRig.position.x + (Math.random() - 0.5) * 1.4,
    playerRig.position.z + (Math.random() - 0.5) * 1.4,
    { kind: "med", id: medId, name: MEDS_DATA[medId].name, count: 1, noAutoPickup: true },
    player.feetY
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
    { kind: "ammo", id: ammoKey, name: `${ammoKey} 子弹`, count: amount, noAutoPickup: true },
    player.feetY
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

  THROW_ORDER.forEach(tKey => {
    const cnt = player.throwBag[tKey];
    if (cnt > 0) {
      const td = THROWABLES_DATA[tKey];
      const row = document.createElement("div");
      row.className = "inv-row";
      row.innerHTML = `
        <span style="color:#ffb36b;">${td.icon} ${td.name} x${cnt} <small style="color:#888;">(${td.weight * cnt})</small>${player.throwSel === tKey ? ' <b style="color:#ffd000;">[当前]</b>' : ""}</span>
        <div>
          ${player.throwSel === tKey ? "" : `<button onclick="selectThrowable('${tKey}')">选用</button>`}
          <button class="btn-drop" onclick="dropThrowableFromBag('${tKey}')">丢1个</button>
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
  // 只列出同一层楼的物资（楼上楼下的不显示）
  return worldLootItems.filter(e => Math.hypot(e.x - px, e.z - pz) < 3.8 && Math.abs(e.y - player.feetY) < 1.6);
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

  // 准星发光滤镜（SVG 原生滤镜，兼容所有手机浏览器）
  const glowDefs = `
    <defs><filter id="reticle-glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur stdDeviation="2.2" result="b"/>
      <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs>`;
  // 2 倍以上倍镜：目镜外全部遮黑，只透过镜片看（端游效果）
  const eyepieceMask = r => `
    <path fill-rule="evenodd" fill="#050607"
      d="M-400,-400 H1200 V850 H-400 Z M${400 - r},225 a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z"/>`;

  if (scopeId === "reddot") {
    return `
      ${glowDefs}
      ${railBase}
      <rect x="342" y="268" width="116" height="82" rx="8" fill="#1c2026" stroke="#0d0f12" stroke-width="2.5"/>
      <rect x="352" y="276" width="96" height="32" rx="4" fill="#252a32"/>
      <path d="M350,272 C332,162 468,162 450,272 Z" fill="rgba(160,210,230,0.05)" stroke="#181b20" stroke-width="11" stroke-linejoin="round"/>
      <circle cx="400" cy="225" r="3.2" fill="#ff1e1e" filter="url(#reticle-glow)"/>
    `;
  }

  if (scopeId === "holo") {
    // 全息镜：镜框中间挖空成透明观察窗（原版用实心色块铺满，开镜后正前方是一块黑板，什么都看不见）
    return `
      ${glowDefs}
      ${railBase}
      <path fill-rule="evenodd" fill="#15181c" stroke="#090b0d" stroke-width="3"
        d="M268,362 L278,116 Q281,88 310,88 L490,88 Q519,88 522,116 L532,362 Z
           M318,124 L482,124 Q494,124 494,136 L494,296 Q494,308 482,308 L318,308 Q306,308 306,296 L306,136 Q306,124 318,124 Z"/>
      <rect x="306" y="124" width="188" height="184" rx="12" fill="rgba(140,200,215,0.05)" stroke="#2b3139" stroke-width="4"/>
      <rect x="352" y="318" width="28" height="15" rx="2" fill="#1d2127" stroke="#0e1013" stroke-width="1.5"/>
      <rect x="420" y="318" width="28" height="15" rx="2" fill="#1d2127" stroke="#0e1013" stroke-width="1.5"/>
      <text x="400" y="330" fill="#68707a" font-size="9" font-weight="bold" text-anchor="middle">EXPS3</text>
      <circle cx="292" cy="200" r="9" fill="#101215" stroke="#2c313a" stroke-width="1.5"/>
      <circle cx="508" cy="200" r="9" fill="#101215" stroke="#2c313a" stroke-width="1.5"/>
      <g filter="url(#reticle-glow)" stroke="#ff2a1c" fill="none">
        <circle cx="400" cy="225" r="26" stroke-width="1.8"/>
        <line x1="400" y1="195" x2="400" y2="203" stroke-width="1.8"/>
        <line x1="400" y1="247" x2="400" y2="255" stroke-width="1.8"/>
        <line x1="370" y1="225" x2="378" y2="225" stroke-width="1.8"/>
        <line x1="422" y1="225" x2="430" y2="225" stroke-width="1.8"/>
        <circle cx="400" cy="225" r="2.1" fill="#ff2a1c" stroke="none"/>
      </g>
    `;
  }

  if (scopeId === "2x") {
    return `
      ${eyepieceMask(116)}
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
      ${eyepieceMask(150)}
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
    ${eyepieceMask(200)}
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

// 开镜过程动画（仿端游）：枪身抬到眼前 → 视野平滑拉近 → 镜片画面淡入放大；关镜时反向播放
// t: 0 = 腰射，1 = 完全开镜。倍率越高抬枪越慢（红点约 0.17 秒，8 倍约 0.32 秒）
const adsAnim = { t: 0, active: false, targetFov: 75, dur: 0.18, sightY: 0.075, svgKey: "", lastOverlay: -1 };
const adsScopeEl = document.getElementById("ads-scope");
const scopeSvgEl = document.getElementById("scope-svg");

function updateScopeState() {
  const curWep = player.weapons[player.activeSlot];
  if (!curWep || !player.isADS || player.phase !== "ground") {
    adsAnim.active = false;
    document.getElementById("hip-crosshair").style.display = "block";
    updateAllHUD();
    return;
  }

  adsAnim.active = true;
  document.getElementById("hip-crosshair").style.display = "none";
  document.getElementById("sg-circle").style.display = "none";

  const scopeId = curWep.attachments.scope || "iron";
  const att = ATTACHMENTS_DATA[scopeId];
  adsAnim.targetFov = scopeId === "iron" ? 65 : (att ? att.fov : 55);
  const zoom = scopeId === "iron" ? 1.1 : (att ? att.zoom : 1.35);
  adsAnim.dur = 0.16 + Math.min(0.16, (zoom - 1) * 0.023);
  adsAnim.sightY = scopeId === "iron" ? 0.075 : 0.105;
  const svgKey = curWep.id + "|" + scopeId;
  if (svgKey !== adsAnim.svgKey) {
    adsAnim.svgKey = svgKey;
    scopeSvgEl.innerHTML = buildScopeOrIronSightSVG(curWep, scopeId);
  }
}

function updateADSAnimation(dt) {
  const goal = adsAnim.active ? 1 : 0;
  const rate = 1 / Math.max(0.05, adsAnim.dur);
  if (adsAnim.t < goal) adsAnim.t = Math.min(goal, adsAnim.t + dt * rate);
  else if (adsAnim.t > goal) adsAnim.t = Math.max(goal, adsAnim.t - dt * rate * 1.35);
  const e = adsAnim.t * adsAnim.t * (3 - 2 * adsAnim.t);

  const fov = 75 + (adsAnim.targetFov - 75) * e;
  if (Math.abs(camera.fov - fov) > 0.01) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  // 镜片画面在抬枪后半程淡入，并从略大缩放到正常（贴近眼睛的感觉）
  const overlay = Math.round(smoothstep(0.55, 1.0, adsAnim.t) * 100) / 100;
  if (overlay !== adsAnim.lastOverlay) {
    adsAnim.lastOverlay = overlay;
    adsScopeEl.style.display = overlay > 0 ? "flex" : "none";
    adsScopeEl.style.opacity = overlay;
    scopeSvgEl.style.transform = `scale(${(1 + (1 - overlay) * 0.22).toFixed(3)})`;
  }
  // 捏着投掷物瞄准时收起枪
  fpGunGroup.visible = adsAnim.t < 0.92 && !player.aimingThrow;
  return e;
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

  // 投掷物按钮：当前选中的种类与数量
  const tSel = THROWABLES_DATA[player.throwSel];
  const tCnt = player.throwBag[player.throwSel] || 0;
  const totalThrow = THROW_ORDER.reduce((n, k) => n + (player.throwBag[k] || 0), 0);
  document.getElementById("btn-throw").innerHTML = `${tSel.icon}<br><small>${tCnt > 0 ? "x" + tCnt : "无"}</small>`;
  document.getElementById("btn-throw").classList.toggle("empty", totalThrow === 0);
  document.getElementById("btn-throw-cycle").innerText = totalThrow > 0 ? `${tSel.short} ▸` : "投掷物";

  const healOrder = ["firstaid", "medkit", "bandage", "painkiller", "drink", "adrenaline"];
  const availMed = healOrder.find(k => (player.medBag[k] || 0) > 0);
  document.getElementById("quick-heal-name").innerText = availMed
    ? `${MEDS_DATA[availMed].name}(${player.medBag[availMed]})`
    : "无药";
}

// ---------------------------------------------------------------------------
// 地图：开局把地形、林区、河流、桥、道路、建筑一次性画进离屏底图，
// 小地图（以玩家为中心）与大地图（全图 + 地点标注）都从这张底图裁切缩放，每帧不再重画矢量
// ---------------------------------------------------------------------------
const MAP_BASE_PX = 1280;
const MAP_PX_PER_M = MAP_BASE_PX / MAP_SIZE;
const mapBaseCanvas = document.createElement("canvas");
mapBaseCanvas.width = mapBaseCanvas.height = MAP_BASE_PX;
(function paintMapBase() {
  const c = mapBaseCanvas.getContext("2d");
  const k = MAP_PX_PER_M, H = MAP_SIZE / 2;
  const X = x => (x + H) * k;
  // 草地底色 + 低频明暗起伏（64×64 噪声图放大平滑，几乎零开销）
  c.fillStyle = "#3f4f35";
  c.fillRect(0, 0, MAP_BASE_PX, MAP_BASE_PX);
  const noise = document.createElement("canvas");
  noise.width = noise.height = 64;
  const nctx = noise.getContext("2d");
  const img = nctx.createImageData(64, 64);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const n = fbm(x / 13, y / 13, 41, 4);
      const o = (y * 64 + x) * 4;
      img.data[o] = 70 + n * 40; img.data[o + 1] = 88 + n * 38; img.data[o + 2] = 56 + n * 22; img.data[o + 3] = 120;
    }
  }
  nctx.putImageData(img, 0, 0);
  c.imageSmoothingEnabled = true;
  c.drawImage(noise, 0, 0, MAP_BASE_PX, MAP_BASE_PX);
  // 林区
  c.fillStyle = "rgba(34, 52, 30, 0.72)";
  forestPatches.forEach(f => { c.beginPath(); c.arc(X(f.x), X(f.z), f.r * k * 1.05, 0, Math.PI * 2); c.fill(); });
  // 地点地面（城镇略偏土色，学校/遗迹按材质着色）
  POIS.forEach(p => {
    if (p.key.startsWith("farm")) {
      c.fillStyle = "rgba(150, 128, 70, 0.45)";
      c.fillRect(X(p.x - 30), X(p.z - 22), 60 * k, 44 * k);
      return;
    }
    if (p.special) return;
    c.fillStyle = "rgba(120, 112, 90, 0.35)";
    c.beginPath(); c.arc(X(p.x), X(p.z), p.r * k * 0.95, 0, Math.PI * 2); c.fill();
  });
  const sch = POI_BY_KEY.school, ru = POI_BY_KEY.ruins;
  c.fillStyle = "rgba(170, 160, 135, 0.55)";
  c.fillRect(X(sch.x - 46), X(sch.z - 44), 110 * k, 84 * k);
  c.strokeStyle = "#a4503c"; c.lineWidth = Math.max(1.5, 3 * k);
  c.beginPath(); c.ellipse(X(sch.x - 10), X(sch.z + 17), 24 * k, 12 * k, 0, 0, Math.PI * 2); c.stroke();
  c.fillStyle = "rgba(150, 144, 128, 0.85)";
  c.fillRect(X(ru.x - 32), X(ru.z - 28), 64 * k, 56 * k);
  // 河流 + 河岸
  c.fillStyle = "#5d6b4c";
  c.fillRect(0, X(RIVER_Z - RIVER_HALF - 5), MAP_BASE_PX, (RIVER_HALF * 2 + 10) * k);
  c.fillStyle = "#2f6c93";
  c.fillRect(0, X(RIVER_Z - RIVER_HALF), MAP_BASE_PX, RIVER_HALF * 2 * k);
  // 道路（地图上适当加粗，便于手机上看清）
  c.lineJoin = "round"; c.lineCap = "round";
  roadPolylines.forEach(poly => {
    c.strokeStyle = poly.kind === "asphalt" ? "#2e302e" : "#5a4a34";
    c.lineWidth = Math.max(2.2, poly.w * k * 1.9) + 1.2;
    c.beginPath();
    poly.pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), X(p[1])) : c.moveTo(X(p[0]), X(p[1]))));
    c.stroke();
  });
  roadPolylines.forEach(poly => {
    c.strokeStyle = poly.kind === "asphalt" ? "#9c9d98" : "#b0905f";
    c.lineWidth = Math.max(1.4, poly.w * k * 1.9);
    c.beginPath();
    poly.pts.forEach((p, i) => (i ? c.lineTo(X(p[0]), X(p[1])) : c.moveTo(X(p[0]), X(p[1]))));
    c.stroke();
  });
  // 桥
  BRIDGE_XS.forEach(bx => {
    c.fillStyle = "#26282a";
    c.fillRect(X(bx - 12), X(RIVER_Z - 31), 24 * k, 62 * k);
    c.fillStyle = "#b8b6ae";
    c.fillRect(X(bx - 10), X(RIVER_Z - 30), 20 * k, 60 * k);
  });
  // 建筑（多层楼颜色更深）
  buildingFootprints.forEach(b => {
    c.fillStyle = b.kind === "school" || b.kind === "gym" ? "#d8ccb0" : (b.kind === "ruin" ? "#9a9384" : (b.floors >= 3 ? "#a08a6c" : (b.floors === 2 ? "#b89c78" : "#c8ad86")));
    c.strokeStyle = "rgba(30, 24, 18, 0.85)";
    c.lineWidth = 1;
    const x0 = X(b.cx - b.w / 2), z0 = X(b.cz - b.d / 2);
    c.fillRect(x0, z0, Math.max(1.5, b.w * k), Math.max(1.5, b.d * k));
    c.strokeRect(x0, z0, Math.max(1.5, b.w * k), Math.max(1.5, b.d * k));
  });
})();

const mmCanvas = document.getElementById("minimap-canvas");
const mmCtx = mmCanvas.getContext("2d");
const MINIMAP_SPAN = 380; // 小地图显示范围（米）
document.getElementById("minimap-box").addEventListener("click", () => toggleBigMap());

// 地图上的公共图层：毒圈、航线、空投、声音雷达、玩家箭头
function drawMapOverlays(ctx, toX, toZ, scale, W, H, isBig) {
  // 安全区（白圈）与当前毒圈（蓝圈）
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = isBig ? 2 : 1.4;
  ctx.beginPath();
  ctx.arc(toX(zoneState.cx), toZ(zoneState.cz), zoneState.targetR * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#1e9bff";
  ctx.lineWidth = isBig ? 3 : 2;
  ctx.beginPath();
  ctx.arc(toX(zoneState.cx), toZ(zoneState.cz), zoneState.curR * scale, 0, Math.PI * 2);
  ctx.stroke();

  // 航线（还在飞机上或空中时显示）
  if (player.phase === "plane" || player.phase === "sky" || player.phase === "chute") {
    const a = flightPointAt(0), b = flightPointAt(flightPath.len);
    ctx.save();
    ctx.setLineDash(isBig ? [10, 7] : [5, 4]);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
    ctx.lineWidth = isBig ? 2 : 1.4;
    ctx.beginPath(); ctx.moveTo(toX(a.x), toZ(a.z)); ctx.lineTo(toX(b.x), toZ(b.z)); ctx.stroke();
    ctx.restore();
    if (planeGroup.visible) {
      ctx.fillStyle = "#ffd000";
      ctx.beginPath(); ctx.arc(toX(planeGroup.position.x), toZ(planeGroup.position.z), isBig ? 5 : 3.5, 0, Math.PI * 2); ctx.fill();
    }
  }

  airdrops.forEach(ad => {
    const ax = toX(ad.x), az = toZ(ad.z), s = isBig ? 5 : 3.5;
    ctx.fillStyle = "#ff2211";
    ctx.fillRect(ax - s, az - s, s * 2, s * 2);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1;
    ctx.strokeRect(ax - s, az - s, s * 2, s * 2);
  });

  const now = performance.now();
  const px = toX(playerRig.position.x), pz = toZ(playerRig.position.z);
  for (let i = radarSoundMarkers.length - 1; i >= 0; i--) {
    const m = radarSoundMarkers[i];
    const age = now - m.born;
    if (age > m.maxAge) {
      if (!isBig) radarSoundMarkers.splice(i, 1);
      continue;
    }
    const alpha = Math.max(0, 1 - age / m.maxAge);
    const sx = Math.max(6, Math.min(W - 6, toX(m.x)));
    const sz = Math.max(6, Math.min(H - 6, toZ(m.z)));
    const angleFromPlayer = Math.atan2(m.z - playerRig.position.z, m.x - playerRig.position.x);
    if (m.type === "shot") {
      if (!isBig) {
        ctx.strokeStyle = `rgba(255, 45, 25, ${alpha})`;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(W / 2, H / 2, W / 2 - 8, angleFromPlayer - 0.28, angleFromPlayer + 0.28);
        ctx.stroke();
      }
      ctx.fillStyle = `rgba(255, 60, 30, ${alpha})`;
      ctx.beginPath(); ctx.arc(sx, sz, isBig ? 4 : 6, 0, Math.PI * 2); ctx.fill();
    } else {
      const rWave = (isBig ? 3 : 5) + (age / m.maxAge) * (isBig ? 8 : 13);
      ctx.strokeStyle = `rgba(255, 195, 40, ${alpha})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(sx, sz, rWave, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = `rgba(255, 180, 0, ${alpha})`;
      ctx.beginPath(); ctx.arc(sx, sz, isBig ? 2.5 : 4, 0, Math.PI * 2); ctx.fill();
    }
  }

  // 玩家：带朝向的箭头
  const s = isBig ? 1.25 : 1.6;
  ctx.save();
  ctx.translate(px, pz);
  ctx.rotate(-yaw);
  ctx.fillStyle = "#00ff66";
  ctx.strokeStyle = "#04240f";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -7 * s); ctx.lineTo(5 * s, 6 * s); ctx.lineTo(0, 3 * s); ctx.lineTo(-5 * s, 6 * s); ctx.closePath();
  ctx.fill(); ctx.stroke();
  ctx.restore();
}

function drawPoiLabel(ctx, p, x, y, fontPx, big) {
  const label = p.special ? `${p.special} ${p.name}` : p.name;
  ctx.font = `bold ${fontPx}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (p.special && big) {
    // 学校 / 遗迹：醒目的标签底框
    const w = ctx.measureText(label).width + fontPx * 0.9;
    ctx.fillStyle = p.key === "school" ? "rgba(40, 90, 170, 0.85)" : "rgba(140, 90, 30, 0.88)";
    ctx.strokeStyle = "#ffe08a";
    ctx.lineWidth = 1.5;
    const h = fontPx * 1.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2); else ctx.rect(x - w / 2, y - h / 2, w, h);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(label, x, y + 0.5);
    return;
  }
  ctx.lineWidth = Math.max(2, fontPx * 0.22);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.85)";
  ctx.strokeText(label, x, y);
  ctx.fillStyle = p.special ? "#ffe08a" : "#ffffff";
  ctx.fillText(label, x, y);
}

function drawMinimap() {
  const W = mmCanvas.width, H = mmCanvas.height;
  const scale = W / MINIMAP_SPAN;
  const cx = playerRig.position.x, cz = playerRig.position.z;
  const toX = wx => W / 2 + (wx - cx) * scale;
  const toZ = wz => H / 2 + (wz - cz) * scale;
  mmCtx.fillStyle = "#2b3727";
  mmCtx.fillRect(0, 0, W, H);
  const k = MAP_PX_PER_M;
  mmCtx.imageSmoothingEnabled = true;
  mmCtx.drawImage(mapBaseCanvas, (cx - MINIMAP_SPAN / 2 + MAP_SIZE / 2) * k, (cz - MINIMAP_SPAN / 2 + MAP_SIZE / 2) * k,
    MINIMAP_SPAN * k, MINIMAP_SPAN * k, 0, 0, W, H);
  // 视野内的地点名
  POIS.forEach(p => {
    if (!p.name) return;
    const x = toX(p.x), y = toZ(p.z);
    if (x < -30 || x > W + 30 || y < -10 || y > H + 10) return;
    drawPoiLabel(mmCtx, p, x, y, 17, false);
  });
  drawMapOverlays(mmCtx, toX, toZ, scale, W, H, false);
}

// 大地图（点小地图或按 M 打开）：全图 + 8×8 网格 + 城镇/学校/遗迹标注
const bigMapModal = document.getElementById("bigmap-modal");
const bigMapCanvas = document.getElementById("bigmap-canvas");
const bigMapCtx = bigMapCanvas.getContext("2d");
let bigMapOpen = false;
function toggleBigMap(force) {
  bigMapOpen = force !== undefined ? force : !bigMapOpen;
  bigMapModal.style.display = bigMapOpen ? "flex" : "none";
  if (bigMapOpen) {
    const css = Math.floor(Math.min(window.innerHeight - 16, window.innerWidth - 16, 720));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    bigMapCanvas.style.width = bigMapCanvas.style.height = css + "px";
    bigMapCanvas.width = bigMapCanvas.height = Math.round(css * dpr);
    drawBigMap();
  }
}
bigMapModal.addEventListener("click", () => toggleBigMap(false));
bigMapModal.addEventListener("touchstart", e => { e.preventDefault(); toggleBigMap(false); }, { passive: false });

function drawBigMap() {
  const ctx = bigMapCtx;
  const W = bigMapCanvas.width, H = bigMapCanvas.height;
  const scale = W / MAP_SIZE;
  const toX = wx => (wx + MAP_SIZE / 2) * scale;
  const toZ = wz => (wz + MAP_SIZE / 2) * scale;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(mapBaseCanvas, 0, 0, W, H);
  // 网格（每格 400 米）
  ctx.strokeStyle = "rgba(255, 255, 255, 0.16)";
  ctx.lineWidth = 1;
  const cells = MAP_SIZE / 400;
  ctx.font = `bold ${Math.round(W / 60)}px sans-serif`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.55)";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = 1; i < cells; i++) {
    const p = (i / cells) * W;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(W, p); ctx.stroke();
  }
  for (let i = 0; i < cells; i++) {
    ctx.fillText(String.fromCharCode(65 + i), (i / cells) * W + 4, 3);
    ctx.fillText(String(i + 1), 4, (i / cells) * H + 3 + W / 50);
  }
  // 地点标注
  const f = Math.max(12, Math.round(W / 38));
  POIS.forEach(p => {
    if (!p.name) return;
    const x = toX(p.x), y = toZ(p.z);
    if (p.special) {
      ctx.strokeStyle = "rgba(255, 224, 138, 0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.arc(x, y, Math.max(10, p.r * scale * 1.2), 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      drawPoiLabel(ctx, p, x, y - Math.max(10, p.r * scale * 1.2) - f * 0.9, f, true);
    } else {
      drawPoiLabel(ctx, p, x, y, f * (p.key === "pcity" ? 1.25 : 1), true);
    }
  });
  drawMapOverlays(ctx, toX, toZ, scale, W, H, true);
}

// 指南针后缀：当前所在地点
function currentAreaName() {
  const x = playerRig.position.x, z = playerRig.position.z;
  let best = null, bestD = Infinity;
  POIS.forEach(p => {
    if (!p.name) return;
    const d = Math.hypot(p.x - x, p.z - z);
    if (d < p.r + 60 && d < bestD) { bestD = d; best = p; }
  });
  if (best) return best.special ? `${best.special}${best.name}` : best.name;
  if (Math.abs(z - RIVER_Z) < RIVER_HALF + 40) return "河岸";
  if (forestPatches.some(fp => Math.hypot(fp.x - x, fp.z - z) < fp.r)) return "林区";
  return "野外";
}

// ============================================================================
// 11. 触控与键鼠绑定
// ============================================================================
function startTrigger() {
  if (player.phase !== "ground" || player.aimingThrow) return;
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

// 投掷键：按住 = 拔销瞄准（手指可以拖动转视角调整抛物线），松手 = 扔出
(function bindThrowButton() {
  const btn = document.getElementById("btn-throw");
  let touchId = null, lastX = 0, lastY = 0, lastT = 0;
  btn.addEventListener("touchstart", e => {
    e.preventDefault(); e.stopPropagation();
    if (touchId !== null) return;
    const t = e.changedTouches[0];
    touchId = t.identifier; lastX = t.clientX; lastY = t.clientY; lastT = e.timeStamp;
    btn.classList.add("pressing");
    beginThrowAim();
  }, { passive: false });
  btn.addEventListener("touchmove", e => {
    e.preventDefault(); e.stopPropagation();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier !== touchId) continue;
      const dx = t.clientX - lastX, dy = t.clientY - lastY;
      lastX = t.clientX; lastY = t.clientY;
      applyLookDelta(dx, dy, TOUCH_LOOK_BASE, touchLookAccel(dx, dy, e.timeStamp - lastT));
      lastT = e.timeStamp;
    }
  }, { passive: false });
  const endFn = e => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier !== touchId) continue;
      touchId = null;
      btn.classList.remove("pressing");
      if (e.type === "touchcancel") cancelThrowAim(); else releaseThrow();
    }
  };
  btn.addEventListener("touchend", endFn);
  btn.addEventListener("touchcancel", endFn);
  // 桌面端鼠标点按
  btn.addEventListener("mousedown", e => { e.stopPropagation(); beginThrowAim(); });
  btn.addEventListener("mouseup", e => { e.stopPropagation(); releaseThrow(); });
})();

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

// 摇杆：行程随按钮缩放自适应、12% 中心死区；取消走路——推出死区即按冲刺速度全速移动，摇杆只决定方向
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
  if (dist / maxR < JOY_DEADZONE) { moveVec.x = 0; moveVec.z = 0; return; }
  moveVec.x = dx / Math.max(dist, 0.001);
  moveVec.z = dy / Math.max(dist, 0.001);
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
  if (player.aimingThrow) return;
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
bindInstantTouchButton("btn-throw-cycle", cycleThrowable);
bindInstantTouchButton("btn-bag", () => {
  cancelThrowAim();
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
  if (e.code === "KeyM") toggleBigMap();
  if (e.code === "KeyG" && !e.repeat) beginThrowAim();
  if (e.code === "KeyT") cycleThrowable();
  if (e.code === "Tab") {
    e.preventDefault();
    const modal = document.getElementById("backpack-modal");
    if (modal.style.display === "flex") modal.style.display = "none";
    else { cancelThrowAim(); renderBackpackModal(); modal.style.display = "flex"; document.exitPointerLock?.(); }
  }
});
window.addEventListener("keyup", e => {
  keysPressed[e.code] = false;
  if (e.code === "KeyG") releaseThrow();
});

renderer.domElement.addEventListener("mousedown", e => {
  if (document.getElementById("backpack-modal").style.display === "flex") return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
    return;
  }
  if (e.button === 0) startTrigger();
  else if (e.button === 2 && !player.aimingThrow) { player.reopenADSAfterBolt = false; player.isADS = !player.isADS; updateScopeState(); }
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
        populateAirdropLoot(ad.x, ad.z, ad.landY);
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
      moveWithWallCollisions(playerRig.position, moveDelta.x, moveDelta.z, 0.48, player.feetY);
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

  // ============================================================================
  // AI 完整生命周期：飞机跳出 -> 高空俯冲 -> 开降落伞滑翔 -> 落地触须避障寻路 & 交火走位
  // ============================================================================
  aiPlayers.forEach(bot => {
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
      } else if (bot.lootTarget && !bot.lootTarget.gone && !isAlerted) {
        // 5. 已有枪：继续搜第二把枪 / 头盔 / 防弹衣 / 背包 / 药 / 配件
        moveMode = "loot";
        const lt = bot.lootTarget;
        moveGoal = new THREE.Vector3(lt.x, lt.y, lt.z);
        if (Math.hypot(lt.x - bot.group.position.x, lt.z - bot.group.position.z) < 1.8 && Math.abs(lt.y - bot.group.position.y) < 1.2) {
          botPickupLoot(bot, lt, now);
          bot.lootTarget = null;
          bot.nextLootScan = now + 250;
        }
      } else if (bot.group.position.distanceTo(bot.targetPos) < 4.5) {
        // 6. 巡逻漫游：优先挑选安全区内的其它房区门口巡逻
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
      animateBotBody(bot, dt, !!bot.weaponKey && isAlerted && !busy, distToPlayer, now);

      // AI 射击与反击逻辑：按手中武器的射速 / 射程 / 伤害开火；换弹、切枪、打药期间不能开火
      if (bot.weaponKey && !busy) {
        const prof = botProfile(bot);
        const wType = WEAPONS_DATA[bot.weaponKey].type;
        const cdBase = prof.cdMin + Math.random() * (prof.cdMax - prof.cdMin);
        const fireCooldown = isAlerted ? cdBase : cdBase * 1.8;
        if (now - bot.lastFireTime > fireCooldown) {
          const engageRange = isAlerted ? prof.maxRange : Math.min(prof.maxRange, (wType === "SR" || wType === "DMR") ? 110 : 78);
          const engageChance = isAlerted ? 0.88 : 0.42;

          if (player.phase === "ground" && distToPlayer < engageRange && Math.random() < engageChance && canSeePlayer) {
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
              sfx.playShot(bot.weaponAtts[bot.activeSlot].muzzle === "supp", 1.0, distToPlayer, stereoPanFor(bot.group.position.x, bot.group.position.z));
              registerRadarSound("shot", bot.group.position.x, bot.group.position.z, false);
              // AI 互殴：伤害随武器类型变化，并扣除对方防弹衣减伤
              const od = otherBot.group.position.distanceTo(bot.group.position);
              const typeMul = wType === "SG" ? (od < 15 ? 1.6 : 0.4) : (AI_VS_AI_DMG[wType] || 1);
              otherBot.hp -= Math.round(36 * typeMul * (1 - botArmorReduction(otherBot, false)) / 0.9);
              botAfterShots(bot, prof.volley, od, now);
              if (otherBot.hp <= 0) {
                killAIBot(otherBot, bot.name, WEAPONS_DATA[bot.weaponKey].name, Math.random() < 0.25, false);
              }
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
  updateThrowPreview();
  // 远处的静态合批块整块隐藏（地图变大后视野外的城镇不再提交绘制）
  cullStaticBatches();

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
