// vault.js：翻越 —— 跳跃键对着矮墙 / 窗户 / 箱子 / 石头 / 栏杆按下，自动翻过去（够得着顶面又能站人的就爬上去）。
// 障碍顶面比脚高 0.45 ~ 2.05 米、上方留有缩身通过的空间（窗户上沿、二层楼板不挡）、对面有地方落脚才能翻
// （所有脚本共享同一个全局作用域，按 index.html 里的顺序依次加载）

const VAULT_MAX_RISE = 2.05;
const VAULT_PROBE_R = 0.25;  // 缩起身子过窗口时的身体半径

// 规划一次翻越（不执行）：返回路径点，翻不了返回 null
function planVault() {
  if (player.phase !== "ground" || player.vault || player.velY !== 0 || player.stance === "prone") return null;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const px = playerRig.position.x, pz = playerRig.position.z, feet = player.feetY;
  // 1) 正前方 1.25 米内有挡路的东西
  let dObs = -1, top = -Infinity;
  for (let d = 0.45; d <= 1.25; d += 0.1) {
    const x = px + fx * d, z = pz + fz * d;
    if (!isBodyBlocked(x, z, VAULT_PROBE_R, feet + 0.45, feet + 1.6)) continue;
    dObs = d;
    top = obstacleTopAt(x, z, VAULT_PROBE_R, feet);
    break;
  }
  if (dObs < 0 || top - feet > VAULT_MAX_RISE || top - feet < 0.4) return null;
  // 2) 在顶面高度往前走：身子缩着要过得去，直到对面找到能站的地方
  let crossTop = top, land = null;
  for (let d = dObs; d <= dObs + 3.3; d += 0.1) {
    const x = px + fx * d, z = pz + fz * d;
    const t2 = obstacleTopAt(x, z, VAULT_PROBE_R, feet);
    if (t2 > crossTop) {
      if (t2 - feet > VAULT_MAX_RISE) return null;
      crossTop = t2;
    }
    if (isBodyBlocked(x, z, VAULT_PROBE_R, crossTop + 0.05, crossTop + 1.0)) return null; // 窗户上沿 / 楼板挡住了
    if (d < dObs + 0.3) continue;
    const g = getGroundHeight(x, z, crossTop + 0.1);
    if (!isBodyBlocked(x, z, 0.48, g + 0.45, g + 1.6)) { land = { x, z, g, d }; break; }
  }
  if (!land) return null;
  const climb = land.g > crossTop - 0.3; // 顶面就能站人（台基、平台）：爬上去
  const endY = land.g < crossTop - 1.4 ? crossTop + 0.05 : land.g; // 对面很低（窗外是二楼外面）：翻出去后自己往下掉
  const fd = Math.max(0.1, dObs - 0.25);
  return {
    climb,
    pts: [
      [px, feet, pz],
      [px + fx * fd, crossTop + 0.15, pz + fz * fd],
      [land.x - fx * (climb ? 0 : 0.25), crossTop + 0.15, land.z - fz * (climb ? 0 : 0.25)],
      [land.x, endY, land.z]
    ],
    dur: 0.32 + (crossTop - feet) * 0.14 + land.d * 0.06
  };
}

// 按跳跃键：能翻就翻，否则正常起跳
function jumpOrVault() {
  if (player.phase !== "ground" || player.vault) return;
  const plan = planVault();
  if (plan) {
    player.vault = { t: 0, dur: plan.dur, pts: plan.pts, climb: plan.climb };
    if (player.isADS) { player.isADS = false; player.reopenADSAfterBolt = false; updateScopeState(); }
    if (player.casting && player.casting.title.includes("💊")) cancelCastProgress();
    player.stance = "stand";
    sfx.playLanding(0.3);
    notifyBotsOfPlayerStep();
    return;
  }
  if (player.velY === 0) {
    player.stance = "stand";
    player.velY = 6.8;
  }
}

// 翻越动画：抬身（35%）→ 越过顶面（35%）→ 落地（30%），期间视线压低一点
function updateVault(dt) {
  const v = player.vault;
  v.t += dt / v.dur;
  const k = Math.min(1, v.t), P = v.pts;
  let a, b, f;
  if (k < 0.35) { a = P[0]; b = P[1]; f = k / 0.35; }
  else if (k < 0.7) { a = P[1]; b = P[2]; f = (k - 0.35) / 0.35; }
  else { a = P[2]; b = P[3]; f = (k - 0.7) / 0.3; }
  const e = f * f * (3 - 2 * f);
  playerRig.position.x = a[0] + (b[0] - a[0]) * e;
  playerRig.position.z = a[2] + (b[2] - a[2]) * e;
  player.feetY = a[1] + (b[1] - a[1]) * e;
  const dip = Math.sin(Math.PI * k) * 0.45;
  player.eyeH += (STANCE_EYE.stand - dip - player.eyeH) * Math.min(1, dt * 14);
  playerRig.position.y = player.feetY + player.eyeH;
  if (k >= 1) {
    player.vault = null;
    player.velY = 0;
    sfx.playFootstep(surfaceTypeAt(playerRig.position.x, playerRig.position.z, player.feetY), 0.22, 0, false);
  }
}

// 跳跃键文字：前面能翻越时显示“翻越”（每 0.15 秒检查一次）
const jumpBtnEl = document.getElementById("btn-jump");
let vaultHintNext = 0, vaultHintShown = false;
function updateVaultHint(now) {
  if (now < vaultHintNext) return;
  vaultHintNext = now + 150;
  const can = player.phase === "ground" && !player.vault && player.velY === 0 && !!planVault();
  if (can !== vaultHintShown) {
    vaultHintShown = can;
    jumpBtnEl.innerText = can ? "翻越" : "跳";
    jumpBtnEl.classList.toggle("vault", can);
  }
}
