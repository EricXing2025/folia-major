# PLAN — machi 町景新场景「长安夜市」（changan）

目标：为 Folia 町景（machi）歌词可视化新增第五个内置场景 `changan`（长安夜市 / Chang'an Night Market）：
一个西安夜市广场，尽头是高台上金光泛照的大雁塔。完整实现 `MachiScene` 契约，提交到
`feat/machi-changan-scene`（基线 e14f3300 = recordstore 含 MIDNIGHT RECORDS 修复，不 push，不 build/package）。

## 关键事实（已核实）

- 契约 `scenes/types.ts`：root/framing/weather/reflectionPlaneY/surfaces(road,lot)/puddles/focusPoint/
  setContent/swapSong/direct/syncColors/busy/dispose，可选 rebuildsForSeed、nextCar。
- 注册点（只加行）：`machi/types.ts`（MACHI_SCENE_IDS、DEFAULT_MACHI_VIEWS）、`scenes/index.ts`（MACHI_SCENES）、
  `MachiSettingsPanel.tsx`（MACHI_SCENE_LABEL_KEYS + SCENE_GLYPHS）、四份 locale（en/zh-CN/in/vi）的
  `options.machiScene*`。`resolveMachiSceneId` 按 `MACHI_SCENE_IDS` 取模，加 id 自动进轮换。
- 运行时：seed 变了且 `rebuildsForSeed` → 整场景重建（城寨同款做法）。changan 的 seed 变体是几何级
  （灯串配色、烟密度、花密度），故 `rebuildsForSeed = true`。
- `focusPoint` 驱动鼓点涟漪圆心与歌词景深对焦 —— 指向歌词屏正面。
- `resolveArt` 的键会覆盖摊平后的调色板同名键（flattenMachiPalette 中 art 后写）——可以用 art 把
  `concrete` 调成青灰石板色，lot 湿地面材质自动走它。
- 内容管线复用：MachiLyricScreen（逐字点亮当前行）、canvas 静态招牌（signRaster 的 fitFont/wrapText/
  strokeNeonText/drawIcon）、beat 信号（machiNeonGroup/machiLightboxGroup/beat.warm/thump/audio/chorus）。
  EQ 光柱条不做新引擎管线：场景内 InstancedMesh 逐帧按 frame 信号改 scaleY。
- 几何 helper：roundedBox/boxAt/boxSpan/cylinderAt/tubeBetween/sagWire/group/mesh + bakeStatic
  （静态合批，dynamic 件与 InstancedMesh 除外）+ withGeometryCache。
- 环境 look：streetLamps/artificial/daylight；atmosphere 填雾里两处灯（glowA/glowB Vector4+颜色）。
- MachiWeatherLayout：roofs ≤4、drips、glints ≤3、windYaw/windSlant、groundY、half。

## 美术定版（定版 v3，对照 ~/machi-changan-reference.png）

- 街角同 konbini/recordstore：两路前右相交（ROAD.inner 2.2 / outer 5.5），场地是青灰湿石板夜市广场。
- 锚点：后中高台 + 七层唐塔。塔身青砖暗色、泛光打金（点光衰减自然上暗下亮），各层叠涩出檐带微翘角、
  拱洞暖光（InstancedMesh 自发光）、塔刹。塔高 ≈2.45× 底宽（3.0m），层层收分 0.9；高台 ≈1.7× 底宽 ≈5.6×3.6，
  高 1.35m，正中台阶朝默认镜头（前 +z 面），周边栏杆（望柱 instanced）。
- 内容面：
  - 歌词：高台右侧（+x）面墙的宽幅深色灯箱 = MachiLyricScreen（木框）。前面被台阶从中剖开，右墙整面
    更宽 → 选右墙。其下一条竖条 EQ（InstancedMesh，高度跟 beat/audio/chorus，吃现成 beatFx 信号）。
  - 曲名：牌坊横匾（金底黑匾金字）= song.title。
  - 歌手：牌坊两柱前挂竖式灯箱联匾（竖排 CJK / 横排拉丁，nobori 的 drawVertical 同款思路）= song.artist。
  - 摊位牌：静态 canvas「肉夹馍 / 羊肉泡馍 / 油泼面 / 酸梅汤」。
  - 茶楼紫霓虹：加色 canvas「茶」牌在后右屋面角。
- 前景：前左唐式牌坊（25° 朝镜头）+ 一对石狮；右侧一排 3 摊 + 中景 1 摊（蒸汽、红灯笼、小桌凳）；
  红灯笼串 + 灯串泡跨广场悬垂（sagWire + instanced）；两盏宫灯柱（光柱同兄弟场景）；台边一尊陶土色
  兵马俑小像；左缘一树粉花。
- 背景：左缘一段城墙带城楼剪影；后右两三座低唐屋顶；深蓝紫夜空两盏天灯慢升循环（dynamic）。
- 倒影：灯笼、屏、霓虹、塔拱洞进 MACHI_REFLECT_LAYER；reflectionPlaneY = lot（0.12），湿石板映出
  灯笼与台下部/塔身。
- seed 变体：lanternScheme（灯串配色）、smokeDensity、 blossomDensity、skyPhase（天灯相位 ×2）、
  stringSag、windYaw/windSlant、puddleOffset/Amount；过路车色走 `car:${seed}` 既有哈希（随歌变）。

## 文件清单

新增 `src/components/visualizer/machi/scenes/changan/`（对标 recordstore 切分）：

| 文件 | 职责 |
| --- | --- |
| `layout.ts` | BASE/LEVEL/ROAD/TERRACE/STAIR/PAGODA/PAIFANG/STALLS/PROPS/VIEW 常量表 |
| `changanSeed.ts` | `resolveChanganVariation(seed)` |
| `base.ts` | plinth + 两路 + lot surfaces + 石板缝 InstancedMesh + 路缘 + 路漆 + 井盖 |
| `terrace.ts` | 高台（台基/栏板/台阶）+ 大雁塔（七层/叠涩檐/拱洞/塔刹）+ 兵马俑 + 歌词屏与 EQ 的挂面 |
| `market.ts` | 牌坊+石狮、四摊位、桌凳、宫灯柱、灯笼串+灯串、花树、茶楼+屋脊剪影、城墙城楼、天灯 |
| `changanSignPaint.ts` | 横匾/柱联/摊牌/茶楼霓虹的 Canvas 画法 |
| `changanSigns.ts` | MachiLyricScreen + EQ 条 + 静态招牌组 + 亮度/闪烁调度 |
| `changanLights.ts` | 点光（塔下泛光、广场灯笼、摊位）+ 宫灯 spot + 地面光斑 |
| `changanScene.ts` | MachiScene 实现 + ART + resolveChanganArt + `CHANGAN_SCENE` |

接入（只做加法）：types.ts、scenes/index.ts、MachiSettingsPanel.tsx、4 份 locale。

测试：

- 新 `test/unit/visualizer/machi/changan.test.ts`：seed 确定性、布局不变量（塔/高台/牌坊/摊位都在底座内
  不压路、屏朝默认镜头 30° 内、拱洞数与层数对得上、内容面朝向正确）、实例批色表对齐。
- 改 `machiTuning.test.ts` views 断言补 changan（3 处）；`storedSettingsPins.test.ts.snap`、
  `modTuningKeys.test.ts.snap` 用 `vitest -u` 更新并人工核对 diff。

## 验证

1. `npm run typecheck` → exit 0。
2. `npx vitest run test/unit/visualizer/machi/` 全绿；相关快照更新后核对。
3. `npm run codemap:check`。
4. `git diff` 通读 + 新文件逐个自检。
5. 派独立只读子代理审查（development-workflow），逐条核实处理；最多两轮。
6. 真机视觉验收归组织者；本任务不声称视觉已验。
