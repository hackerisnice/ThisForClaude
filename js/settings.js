// settings.js：提示消息、设置面板（画质 / 灵敏度 / 按键外观，自动记忆到本机）
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

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
