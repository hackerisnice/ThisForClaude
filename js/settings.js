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

const gameSettings = { quality: "auto", lookSens: 1.0, adsSens: 1.0, btnScale: 1.0, btnOpacity: 0.74, autoPickup: true, autoDoor: true, sound: true, volume: 1.0 };
try {
  const saved = JSON.parse(localStorage.getItem("pubg_lite_settings") || "{}");
  if (["auto", "low", "mid", "high"].includes(saved.quality)) gameSettings.quality = saved.quality;
  ["autoPickup", "autoDoor", "sound"].forEach(k => { if (typeof saved[k] === "boolean") gameSettings[k] = saved[k]; });
  ["lookSens", "adsSens", "btnScale", "btnOpacity", "volume"].forEach(k => {
    if (typeof saved[k] === "number" && isFinite(saved[k])) gameSettings[k] = saved[k];
  });
} catch (e) { /* 隐私模式或存储被禁用时使用默认值 */ }

function saveGameSettings() {
  try { localStorage.setItem("pubg_lite_settings", JSON.stringify(gameSettings)); } catch (e) {}
}

// 设置项清单：主菜单的“设置”页和游戏里的 ⚙️ 面板用同一份清单生成，两边改了互相同步
const SETTING_DEFS = [
  { key: "sound", type: "check", label: "声音", text: "枪声 / 脚步 / 音效" },
  { key: "volume", type: "range", label: "音量", min: 0, max: 1, step: 0.05, fmt: v => Math.round(v * 100) + "%" },
  { key: "quality", type: "select", label: "画质", opts: [["auto", "自动(推荐)"], ["low", "流畅"], ["mid", "均衡"], ["high", "高清"]] },
  { key: "lookSens", type: "range", label: "视角灵敏度", min: 0.3, max: 2.0, step: 0.05, fmt: v => v.toFixed(2) },
  { key: "adsSens", type: "range", label: "开镜灵敏度", min: 0.3, max: 2.0, step: 0.05, fmt: v => v.toFixed(2) },
  { key: "autoPickup", type: "check", label: "自动拾取", text: "枪 / 子弹 / 装备 / 药" },
  { key: "autoDoor", type: "check", label: "自动开门", text: "走向关着的门时自动推开" },
  { key: "btnScale", type: "range", label: "按钮整体大小", min: 0.65, max: 1.30, step: 0.05, fmt: v => Math.round(v * 100) + "%" },
  { key: "btnOpacity", type: "range", label: "按键透明度", min: 0.25, max: 1.0, step: 0.05, fmt: v => Math.round(v * 100) + "%" }
];

// 改了某一项之后立即生效
function applySetting(key) {
  const v = gameSettings[key];
  if (key === "btnScale") document.documentElement.style.setProperty("--btn-scale", v);
  else if (key === "btnOpacity") document.documentElement.style.setProperty("--btn-opacity", v);
  else if (key === "sound" || key === "volume") { if (typeof sfx !== "undefined") sfx.applyVolume(); }
  else if (key === "quality" && typeof applyQualityTier === "function") {
    applyQualityTier(v === "auto" ? defaultAutoTier() : v, false);
  }
}

function buildSettingsRows(box) {
  SETTING_DEFS.forEach(d => {
    const row = document.createElement("div");
    row.className = "cfg-row";
    row.innerHTML = `<span>${d.label}:</span>`;
    let input;
    if (d.type === "check") {
      const lab = document.createElement("label");
      lab.className = "cfg-switch";
      lab.innerHTML = `<input type="checkbox"><span>${d.text}</span>`;
      input = lab.firstChild;
      row.appendChild(lab);
    } else if (d.type === "select") {
      input = document.createElement("select");
      input.innerHTML = d.opts.map(o => `<option value="${o[0]}">${o[1]}</option>`).join("");
      row.appendChild(input);
    } else {
      input = document.createElement("input");
      input.type = "range"; input.min = d.min; input.max = d.max; input.step = d.step;
      row.appendChild(input);
      const val = document.createElement("b");
      val.className = "cfg-val";
      row.appendChild(val);
    }
    input.dataset.key = d.key;
    input.addEventListener(d.type === "range" ? "input" : "change", () => {
      gameSettings[d.key] = d.type === "check" ? input.checked : (d.type === "range" ? parseFloat(input.value) : input.value);
      saveGameSettings();
      applySetting(d.key);
      syncSettingsUI();
      if (d.key === "quality") showToast(`画质已切换为：${input.options[input.selectedIndex].text}`);
    });
    box.appendChild(row);
  });
}

function syncSettingsUI() {
  document.documentElement.style.setProperty("--btn-scale", gameSettings.btnScale);
  document.documentElement.style.setProperty("--btn-opacity", gameSettings.btnOpacity);
  document.querySelectorAll(".cfg-rows [data-key]").forEach(input => {
    const d = SETTING_DEFS.find(x => x.key === input.dataset.key);
    const v = gameSettings[d.key];
    if (d.type === "check") input.checked = v;
    else input.value = v;
    if (d.type === "range") input.nextSibling.innerText = d.fmt(v);
  });
}

document.querySelectorAll(".cfg-rows").forEach(buildSettingsRows);
document.getElementById("btn-ui-cfg").addEventListener("click", () => {
  const p = document.getElementById("ui-cfg-panel");
  p.style.display = p.style.display === "block" ? "none" : "block";
});
document.getElementById("btn-close-cfg").addEventListener("click", () => {
  document.getElementById("ui-cfg-panel").style.display = "none";
});
syncSettingsUI();
