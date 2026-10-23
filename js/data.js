// data.js：武器、配件、药品、投掷物数值表与负重
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

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
