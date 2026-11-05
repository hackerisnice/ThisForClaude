# 素材来源 / Credits

游戏里用到的照片贴图、树木模型、人物模型、人物动作和枪声录音全部是 **CC0（公有领域）** 素材：可以免费商用、修改，不需要署名。
这里仍然列出来源，方便以后替换或查找原文件。

素材都已经处理过（缩小、裁剪、调色、重新编码），并以 base64 内嵌在
`js/assets_tex.js`（贴图）和 `js/assets_snd.js`（声音）里 —— 这样手机上直接点开 `index.html`
（`file://` 方式）也能加载，不需要本地服务器。

## 贴图（[ambientCG](https://ambientcg.com)，CC0）

| 游戏里的用途 | 素材 |
|---|---|
| 草地 | Grass004 |
| 泥土（村镇 / 河岸） | Ground037 |
| 岩石（山坡 / 石头） | Rock030 |
| 土路 | Ground054 |
| 柏油路（标线为程序绘制） | Asphalt031 |
| 抹灰外墙 | Plaster001 |
| 红砖墙 | Bricks059 |
| 遗迹石墙 | Bricks060 |
| 坡屋顶瓦片 | RoofingTiles002 |
| 仓库 / 谷仓铁皮 | CorrugatedSteel002 |
| 平屋顶水泥 | Concrete034 |
| 木地板 / 木箱 / 家具 | WoodFloor040 |
| 树皮 / 草垛 | Bark012 |

## 树木（[Poly Haven](https://polyhaven.com)，CC0）

游戏里直接用模型的真实几何（离线精简）：叶片 / 针叶小枝是模型里原本的形状（随机保留一部分、按轮廓重新三角化、适当放大），
树干枝杈是模型的减面版，贴图也是模型自带的树皮 / 叶片 / 针叶贴图。离得越远用越简的一档，全程都是立体几何。

| 游戏里的用途 | 模型 |
|---|---|
| 冷杉（两种） | fir_sapling_medium |
| 阔叶树 / 灌木 | island_tree_02 |

## 人物模型（[MakeHuman](http://www.makehumancommunity.org) 资源，CC0）

AI 和回放里的人物：用 MakeHuman 的人体基础网格 + 体型变形数据（男性、年轻、偏结实）离线拼出来，
身体直接用完整精度的基础网格（脸部细节完整，衣服盖住的部分删掉），套上衣服、鞋、手套、头发、头盔，
绑定 MakeHuman 的 game_engine 骨骼权重，再减面成近 / 中 / 远三档。两套衣服（T 恤 + 工装裤 / 长袖作训服）× 六种外观，
每种外观一张图集（脸单独占一大块，衣服重新上了迷彩色），全部以 base64 内嵌在 `js/assets_soldier.js` 里。

| 游戏里的用途 | 素材（作者） |
|---|---|
| 人体网格、体型变形、骨骼权重 | MakeHuman 基础网格 hm08 / macro targets / game_engine 权重（MakeHuman 团队） |
| 身体 | hm08 基础网格（MakeHuman 团队） |
| 皮肤 | young / middleage 男性皮肤贴图（MakeHuman 系统资源） |
| 眼睛 / 眉毛 / 头发 | high-poly / low-poly 眼睛、eyebrow001、short04（MakeHuman 系统资源） |
| 长袖作训服（外套 + 长裤，重新上迷彩） | male_casualsuit05（MakeHuman 系统资源） |
| T 恤 | elvs_crude_t-shirt_male（Elvaerwyn） |
| 工装裤（重新上迷彩） | cortu_cargo_pants（Cortu） |
| 靴子 | culturalibre_male_boots（culturalibre） |
| 手套 | toigo_gloves_short（Margaret Toigo） |
| 1 级头盔 | culturalibre_motorcycle_helmet（culturalibre） |
| 2 / 3 级头盔 | mrgreaterthan_m1_helmet（MrGreaterThan） |

防弹衣（照着 T 恤的躯干部分放大一圈 + 弹匣包）、背包、AI 手里的枪是程序生成的。

## 人物动作（[Quaternius](https://quaternius.com)，CC0）

| 游戏里的用途 | 素材 |
|---|---|
| 站立 / 走 / 跑 / 冲刺 / 蹲 / 蹲走 / 倒地 / 中弹 / 跳 / 扔雷 / 打药 等动捕动作 | Universal Animation Library、Universal Animation Library 2 |

动作离线重定向到 MakeHuman 的骨骼上（按骨骼名对应，先对齐静止姿势再套用每帧的旋转）；
拿枪的姿势、横移 / 后退时腿的朝向、跳伞 / 开伞姿势是游戏里实时计算的（双手 IK 握枪；
手掌握把的角度取自动捕的双手握枪姿势，左手是右手握把姿势的镜像，像握前握把一样托在护木下面）。

## 枪声与音效（[Freesound](https://freesound.org)，均为 CC0 授权的录音）

| 游戏里的用途 | Freesound 编号 | 作者 | 原标题 |
|---|---|---|---|
| 5.56 步枪（M416 / AUG / SCAR-L / M16A4 / M249） | 427598 | michorvath | AR15 pistol shot |
| 7.62 步枪（Beryl / AKM / MK47 / DP-28） | 855842 | serøutōnin--deprivəd | An AK-47 being shot |
| 栓动狙击枪（Kar98k / M24 / AWM / AMR 降调） | 49513 | Jon285 | 405Win.wav |
| 射手步枪（SLR / SKS / Mini14 / 德拉贡诺夫 / MK14） | 514228 | SuperPhat | Sniper Rifle |
| 冲锋枪（UMP45 / Vector / UZI / MP5K） | 427592 | michorvath | 9mm pistol shot |
| 霰弹枪 | 427595 | michorvath | 20 gauge shotgun gunshot |
| 消音器 | 384685 | morganpurkis | Silenced Gunshot 3.wav |
| 远处枪声回响 | 541164 | Resaural | Distant Gunshot |
| 子弹破空声 | 505238 | Daleonfire | Whizzby |
| 跳弹 | 392975 | morganpurkis | Ricochet 2.wav |
| 拉栓 | 267895 | rammbostein | Mosin Nagant Bolt (fast).wav |
| 霰弹枪泵动 | 159710 | AnthonyChan0 | Mossberg 500A - 1 shot and pump |

同一类枪共用一段录音，按枪改变播放速率（音调）和音量来区分；远处的枪声会做音量衰减、低通滤波，再叠一层远处回响。
