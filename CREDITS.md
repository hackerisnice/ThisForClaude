# 素材来源 / Credits

游戏里用到的照片贴图、树木模型和枪声录音全部是 **CC0（公有领域）** 素材：可以免费商用、修改，不需要署名。
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

离线渲染成贴图（每种树正面 + 侧面两张），游戏里用两张交叉的透明面片显示。

| 游戏里的用途 | 模型 |
|---|---|
| 冷杉（两种） | fir_sapling_medium |
| 阔叶树 / 灌木 | island_tree_02 |

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
