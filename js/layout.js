// layout.js：自定义按键 —— 每个按钮都能拖到任意位置、单独调大小（双指捏合或滑条）、隐藏不用的
// 位置按屏幕百分比存在本机（换手机 / 转屏也不会跑出屏幕），主菜单“设置”和游戏里的 ⚙️ 面板都能进来改
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const LAYOUT_ITEMS = [
  ["joystick-zone", "移动摇杆"], ["btn-fire-left", "左开火"], ["btn-fire-right", "右开火"], ["btn-ads", "开镜"],
  ["btn-jump", "跳 / 翻越"], ["btn-reload", "换弹"], ["btn-crouch", "蹲"], ["btn-prone", "趴"],
  ["btn-throw", "投掷物"], ["btn-throw-cycle", "切换投掷物"], ["btn-bag", "背包"], ["btn-heal-quick", "快速吃药"],
  ["btn-mark", "标点"], ["minimap-box", "小地图"], ["bottom-status", "武器栏 / 血条"]
];
const LAYOUT_NAME = Object.fromEntries(LAYOUT_ITEMS);
const LAYOUT_SCALE_MIN = 0.5, LAYOUT_SCALE_MAX = 2.2;

// id → { x, y（按钮中心占屏幕宽 / 高的比例，没有就用默认位置）, s（单独缩放）, hide }
let ctlLayout = {};
try {
  const saved = JSON.parse(localStorage.getItem("pubg_lite_layout") || "{}");
  if (saved && typeof saved === "object") {
    for (const id in saved) {
      const c = saved[id];
      if (!LAYOUT_NAME[id] || !c || typeof c !== "object") continue;
      const e = {};
      if (typeof c.x === "number" && typeof c.y === "number" && isFinite(c.x) && isFinite(c.y)) {
        e.x = Math.max(0, Math.min(1, c.x)); e.y = Math.max(0, Math.min(1, c.y));
      }
      if (typeof c.s === "number" && isFinite(c.s)) e.s = Math.max(LAYOUT_SCALE_MIN, Math.min(LAYOUT_SCALE_MAX, c.s));
      if (c.hide === true) e.hide = true;
      ctlLayout[id] = e;
    }
  }
} catch (e) { ctlLayout = {}; }

function applyControlLayout(lay) {
  LAYOUT_ITEMS.forEach(([id]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const c = lay[id] || {};
    const custom = typeof c.x === "number";
    el.classList.add("lay-item");
    el.classList.toggle("lay-custom", custom);
    el.style.left = custom ? (c.x * 100).toFixed(3) + "%" : "";
    el.style.top = custom ? (c.y * 100).toFixed(3) + "%" : "";
    el.style.setProperty("--ls", c.s || 1);
    el.classList.toggle("lay-hidden", !!c.hide);
  });
}
applyControlLayout(ctlLayout);

// ---- 编辑器 ----
const layoutEd = { open: false, work: null, sel: null, fromMenu: false, boxes: {}, ptrs: new Map(), drag: null, pinch: null };
const leRoot = document.getElementById("layout-editor");
const leBoxesEl = document.getElementById("le-boxes");
const leSize = document.getElementById("le-size");
const leHide = document.getElementById("le-hide");

function openLayoutEditor() {
  if (layoutEd.open) return;
  layoutEd.open = true;
  layoutEd.work = JSON.parse(JSON.stringify(ctlLayout));
  layoutEd.fromMenu = document.body.classList.contains("menu-mode");
  document.body.classList.remove("menu-mode");
  document.body.classList.add("layout-edit");
  document.getElementById("ui-cfg-panel").style.display = "none";
  // 编辑时不能误触真按钮：先松开所有正在按的
  if (typeof stopTrigger === "function") stopTrigger();
  leBoxesEl.innerHTML = "";
  layoutEd.boxes = {};
  LAYOUT_ITEMS.forEach(([id, name]) => {
    const b = document.createElement("div");
    b.className = "le-box";
    b.dataset.id = id;
    b.innerHTML = `<span>${name}</span>`;
    leBoxesEl.appendChild(b);
    layoutEd.boxes[id] = b;
  });
  layoutEd.ptrs.clear(); layoutEd.drag = null; layoutEd.pinch = null;
  selectLayoutItem(null);
  requestAnimationFrame(syncLayoutBoxes);
}

function closeLayoutEditor(save) {
  if (!layoutEd.open) return;
  if (save) {
    ctlLayout = layoutEd.work;
    try { localStorage.setItem("pubg_lite_layout", JSON.stringify(ctlLayout)); } catch (e) {}
    showToast("✅ 键位已保存");
  }
  applyControlLayout(ctlLayout);
  layoutEd.open = false;
  document.body.classList.remove("layout-edit");
  if (layoutEd.fromMenu) document.body.classList.add("menu-mode");
  leBoxesEl.innerHTML = "";
}

// 编辑框贴着真按钮的实际位置和大小（含缩放）
function syncLayoutBoxes() {
  if (!layoutEd.open) return;
  LAYOUT_ITEMS.forEach(([id]) => {
    const el = document.getElementById(id), b = layoutEd.boxes[id];
    const r = el.getBoundingClientRect();
    const w = Math.max(30, r.width), h = Math.max(24, r.height);
    b.style.left = (r.left + r.width / 2 - w / 2) + "px";
    b.style.top = (r.top + r.height / 2 - h / 2) + "px";
    b.style.width = w + "px";
    b.style.height = h + "px";
    b.classList.toggle("off", !!(layoutEd.work[id] && layoutEd.work[id].hide));
    b.classList.toggle("sel", layoutEd.sel === id);
    // 工具条躲开正在改的按钮：按钮在上半屏就把工具条放到下面
    if (layoutEd.sel === id) document.getElementById("le-bar").classList.toggle("low", r.top + r.height / 2 < window.innerHeight * 0.42);
  });
}

function selectLayoutItem(id) {
  layoutEd.sel = id;
  const tools = document.getElementById("le-tools");
  tools.classList.toggle("dis", !id);
  if (!id) {
    document.getElementById("le-sel").innerText = "点一个按钮选中它：拖动换位置 · 双指捏合或拉滑条改大小 · 可以隐藏";
  } else {
    const c = layoutEd.work[id] || {};
    document.getElementById("le-sel").innerText = `已选中：${LAYOUT_NAME[id]}`;
    leSize.value = c.s || 1;
    document.getElementById("le-size-val").innerText = Math.round((c.s || 1) * 100) + "%";
    leHide.classList.toggle("on", !!c.hide);
    leHide.innerText = c.hide ? "已隐藏" : "隐藏";
  }
  syncLayoutBoxes();
}

function layoutEntry(id) { return layoutEd.work[id] || (layoutEd.work[id] = {}); }
function setLayoutScale(id, s) {
  const c = layoutEntry(id);
  c.s = Math.round(Math.max(LAYOUT_SCALE_MIN, Math.min(LAYOUT_SCALE_MAX, s)) * 100) / 100;
  applyControlLayout(layoutEd.work);
  if (layoutEd.sel === id) {
    leSize.value = c.s;
    document.getElementById("le-size-val").innerText = Math.round(c.s * 100) + "%";
  }
  syncLayoutBoxes();
}

// 拖动：按住的那个按钮跟着手指走；第二根手指放上来就变成双指缩放（缩放的是选中的按钮）
leRoot.addEventListener("pointerdown", e => {
  if (e.target.closest("#le-bar")) return;
  e.preventDefault();
  layoutEd.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const box = e.target.closest(".le-box");
  if (layoutEd.ptrs.size === 1) {
    if (box) {
      selectLayoutItem(box.dataset.id);
      const r = document.getElementById(box.dataset.id).getBoundingClientRect();
      layoutEd.drag = { id: box.dataset.id, pid: e.pointerId, sx: e.clientX, sy: e.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2, moved: false };
    }
  } else if (layoutEd.ptrs.size === 2 && layoutEd.sel) {
    const p = [...layoutEd.ptrs.values()];
    layoutEd.pinch = { d0: Math.max(10, Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y)), s0: (layoutEd.work[layoutEd.sel] || {}).s || 1 };
    layoutEd.drag = null;
  }
});
leRoot.addEventListener("pointermove", e => {
  if (!layoutEd.ptrs.has(e.pointerId)) return;
  e.preventDefault();
  layoutEd.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (layoutEd.pinch && layoutEd.ptrs.size >= 2 && layoutEd.sel) {
    const p = [...layoutEd.ptrs.values()];
    const d = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    setLayoutScale(layoutEd.sel, layoutEd.pinch.s0 * d / layoutEd.pinch.d0);
    return;
  }
  const dr = layoutEd.drag;
  if (!dr || dr.pid !== e.pointerId) return;
  const W = window.innerWidth, H = window.innerHeight;
  const cx = Math.max(8, Math.min(W - 8, dr.cx + e.clientX - dr.sx));
  const cy = Math.max(8, Math.min(H - 8, dr.cy + e.clientY - dr.sy));
  if (!dr.moved && Math.hypot(e.clientX - dr.sx, e.clientY - dr.sy) < 3) return;
  dr.moved = true;
  const c = layoutEntry(dr.id);
  c.x = Math.round(cx / W * 10000) / 10000;
  c.y = Math.round(cy / H * 10000) / 10000;
  applyControlLayout(layoutEd.work);
  syncLayoutBoxes();
});
const leEnd = e => {
  if (!layoutEd.ptrs.delete(e.pointerId)) return;
  if (layoutEd.ptrs.size < 2) layoutEd.pinch = null;
  if (layoutEd.drag && layoutEd.drag.pid === e.pointerId) layoutEd.drag = null;
};
leRoot.addEventListener("pointerup", leEnd);
leRoot.addEventListener("pointercancel", leEnd);

leSize.addEventListener("input", () => { if (layoutEd.sel) setLayoutScale(layoutEd.sel, parseFloat(leSize.value)); });
leHide.addEventListener("click", () => {
  if (!layoutEd.sel) return;
  const c = layoutEntry(layoutEd.sel);
  c.hide = !c.hide;
  if (!c.hide) delete c.hide;
  applyControlLayout(layoutEd.work);
  selectLayoutItem(layoutEd.sel);
});
document.getElementById("le-reset").addEventListener("click", () => {
  layoutEd.work = {};
  applyControlLayout(layoutEd.work);
  selectLayoutItem(null);
  showToast("已恢复默认键位（点“保存”生效）");
});
document.getElementById("le-cancel").addEventListener("click", () => closeLayoutEditor(false));
document.getElementById("le-save").addEventListener("click", () => closeLayoutEditor(true));
document.getElementById("btn-edit-layout").addEventListener("click", openLayoutEditor);
window.addEventListener("resize", () => { if (layoutEd.open) requestAnimationFrame(syncLayoutBoxes); });
