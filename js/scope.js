// scope.js：倍镜 / 机瞄 SVG 与开镜动画
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

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
    // 方形红点：方框镜架 + 透明镜片（淡淡的镀膜色和一道反光），镜框下面是底座和亮度旋钮
    return `
      ${glowDefs}
      ${railBase}
      <rect x="350" y="290" width="100" height="60" rx="5" fill="#1c2026" stroke="#0d0f12" stroke-width="2.5"/>
      <rect x="452" y="300" width="14" height="22" rx="3" fill="#15181c" stroke="#0d0f12" stroke-width="1.5"/>
      <path fill-rule="evenodd" fill="#181b20" stroke="#0b0d10" stroke-width="2"
        d="M328,150 H472 Q480,150 480,158 V292 Q480,300 472,300 H328 Q320,300 320,292 V158 Q320,150 328,150 Z
           M336,166 H464 V284 H336 Z"/>
      <rect x="336" y="166" width="128" height="118" fill="rgba(150,205,230,0.07)" stroke="#2b3139" stroke-width="2"/>
      <path d="M344,176 L372,176 L344,214 Z" fill="rgba(255,255,255,0.05)"/>
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
  // 手上拿着投掷物时收起枪
  fpGunGroup.visible = adsAnim.t < 0.92 && !player.throwEquipped;
  return e;
}
