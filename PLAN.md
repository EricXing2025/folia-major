# PLAN — machi 町景新场景「深夜唱片店」（recordstore）

目标：为 Folia 町景（machi）歌词可视化新增第四个内置场景 `recordstore`（深夜唱片店），完整实现 `MachiScene` 契约，提交到 `feat/machi-record-store`（基线 cb2e4ec0，不 push）。

## 关键事实（已核实）

- 契约在 `src/components/visualizer/machi/scenes/types.ts`：`MachiScene` 要交出 root / framing / weather / reflectionPlaneY / surfaces(road,lot) / puddles / focusPoint / setContent / swapSong / direct / syncColors / busy / dispose，可选 `rebuildsForSeed`、`nextCar`。场景定义 `MachiSceneDefinition = { resolveArt: MachiArtResolver, create(ctx): MachiScene }`。
- `machi/types.ts`：`MACHI_SCENE_IDS = ['konbini','station','kowloon']`；`DEFAULT_MACHI_VIEWS` 每场景一条默认视角。`resolveMachiSceneId`（machiTuning.ts）从 `MACHI_SCENE_IDS` 按 `hashVisualizerSeed('machi-scene:'+seed)` 取模选“自动”场景——加 id 即入轮换，无其他硬编码名单（已 rg 确认 SCENE_CHOICES 由 MACHI_SCENE_IDS 派生）。
- 运行时（createMachiRuntime）：`swapSong` 时 `seedChanged && stage.rebuildsForSeed` → 重建场景；否则 `stage.swapSong`。`direct()` 每帧传 `MachiSceneFrame`（songTime/ambientTime/delta/staticMode/immediate/showText/target/preheat/chorus/audio/flicker/rain/trafficChance/environment/look/atmosphere/beat 等）。`ambientTime`/`delta` 由 MachiClock 驱动——**暂停/静态模式时 clock.delta=0、ambientTime 停走**，唱盘用 ambientTime 驱动即得“播放转、暂停停”。
- konbini 是主模板：街角底座（前后两条路、lot）、店体+自动门（buildKonbiniDoorEvents/resolveKonbiniDoorOpenness，输入仅 `{doorInterval,doorPhase}`，可直接复用）、MachiLyricScreen 屋顶屏、MachiLedStrip 店招跑马灯、canvas 招牌重绘、InstancedMesh 商品批（KonbiniProductBatch：colorIndex+shade 数组换主题批量刷色）、MachiTraffic 四车道、MachiNobori のぼり、MachiLightCones 路灯光柱、MachiSteam 井盖白气、bakeStatic/withGeometryCache 静态合批。
- 性能红线：不重于 konbini——重复唱片封脊必须 InstancedMesh + instanceColor 批色；静态件全走 bakeStatic（`userData.dynamic` 标记的动态件除外）；不加新依赖。
- i18n：界面文案 key 在 `options.*` 下，4 份 locale（en/zh-CN/in/vi）一起加 `machiSceneRecordstore`（zh「深夜唱片店」/en "Midnight Record Store"/in "Toko rekaman tengah malam"/vi "Tiệm đĩa nửa đêm"）。zh-TW 由 traditionalLocalePlugin 自动生成。
- 受影响测试：machiTuning.test.ts（views 断言 3 处硬编码三场景）、storedSettingsPins.test.ts.snap（machiTuning.views 序列化 ~12 处）、modTuningKeys.test.ts.snap（scene options 列表）。用 `vitest -u` 更新快照，测试断言手工补 recordstore 项。
- 现有场景测试模式（kowloon.test.ts / station.test.ts）：seed 确定性 + 布局不变量（都在底座内、互不重叠、屏朝默认镜头）。recordstore 照写 recordstore.test.ts。
- 审查要求：功能收尾派独立只读子代理审查（development-workflow），最多两轮。

## 美术定版（简报要点）

- 构图同 konbini 街角：两路前右相交、店占后左、湿地面+水洼倒影。
- 店：整面落地玻璃+暖琥珀店内光（#ffb36b 族）对街道冷蓝青；墙体墨绿。店内：成排黑胶货架+翻碟木箱（彩色封脊成批实例化）、唱片封面墙、试听角（唱机+耳机架）、柜台。
- 招牌：竖排霓虹「深夜唱片」+英文 MIDNIGHT RECORDS（粉/青双色）；门头屏显曲名、橱窗海报显歌手、屋顶屏经 lyricScreen 逐字点亮。
- 门口：A 字牌（OPEN / 营业中）、门外一箱特价黑胶、のぼり「レコード」。
- 街景：路灯光柱、井盖白气、seed 自行车、偶尔过车（MachiTraffic 复用，不新造）。
- seed 变：封脊配色、海报版式、自行车颜色/有无、水洼 offset/amount、开门节奏。

## 文件清单

新增 `src/components/visualizer/machi/scenes/recordstore/`：

| 文件 | 职责 |
| --- | --- |
| `layout.ts` | 底座/路/店/屏/招牌/道具的常量（对标 konbiniLayout） |
| `recordstoreSeed.ts` | `resolveRecordstoreVariation(seed)`（RNG 确定性） |
| `recordstoreDoor.ts` | 复用 konbiniDoor 段落门机制的薄封装 |
| `base.ts` | plinth+两条路+lot surfaces+curb+井盖/排水口 |
| `store.ts` | 店体壳、落地玻璃、自动门扇、门楣、女儿墙、屋顶屏架 |
| `interior.ts` | 货架+封脊 InstancedMesh 批、封面墙、唱机（含旋转唱盘，dynamic）、柜台 |
| `props.ts` | 路灯、A 字牌、特价箱、のぼり位、空调外机+风扇、自行车、曲面镜 |
| `recordstoreSignPaint.ts` | 竖霓虹/门头/海报/A 字牌 canvas 绘制 |
| `recordstoreSigns.ts` | MachiLyricScreen（屋顶屏）+ LED 跑马灯 + 静态招牌组 + 亮度/闪烁调度 |
| `recordstoreLights.ts` | 店内暖光点光、街角 spot、门脸泛光（对标 konbiniLights） |
| `recordstoreScene.ts` | MachiScene 实现 + ART + resolveRecordstoreArt + `RECORDSTORE_SCENE` 定义 |

接入（只做加法）：

- `machi/types.ts`：`MACHI_SCENE_IDS` 加 `'recordstore'`；`DEFAULT_MACHI_VIEWS` 加一项 `DEFAULT_MACHI_VIEW`。
- `scenes/index.ts`：`MACHI_SCENES` 加 `recordstore: RECORDSTORE_SCENE`。
- `MachiSettingsPanel.tsx`：`MACHI_SCENE_LABEL_KEYS` 加 `recordstore → options.machiSceneRecordstore`；`SCENE_GLYPHS` 加简笔 SVG（风格同前三个）。
- `src/i18n/locales/{en,zh-CN,in,vi}.ts`：options 加 `machiSceneRecordstore`。

测试：

- 新 `test/unit/visualizer/machi/recordstore.test.ts`：seed 确定性、布局不变量（店内件在店体内、道具在底座内不压路、屏朝默认镜头、招牌不出底座）。
- 改 `machiTuning.test.ts` views 断言补 recordstore；`storedSettingsPins.test.ts.snap`、`modTuningKeys.test.ts.snap` 用 `vitest -u` 更新并人工核对 diff。

## 契约方法落点（recordstoreScene）

- `root/framing/weather/reflectionPlaneY/surfaces/puddles/focusPoint`：构造期按 layout 常量交出（weather.roofs/drips/glints；reflection 门脸反射条+店体 occluder；surfaces 给 base 的 road/lot 面片）。
- `setContent`：招牌 canvas 重绘 + lyricScreen.setContent + ticker 文本失效。
- `swapSong`：新歌 seed → 重解析 variation、重排封脊实例色、重画内容、重置门事件表。
- `direct`：门开合（resolveRecordstoreDoorOpenness）、唱盘转（ambientTime）、风扇、霓虹/屏/灯亮度（chorus/audio/flicker/beat→machiNeonGroup）、weather/traffic/steam/nobori/lightCones 透传。
- `syncColors`：blend 变化时刷材质、灯色、实例批色（换主题无重建）。
- `busy`：`signs.busy`（屏动画未完时保持渲染）。
- `dispose`：几何/材质/纹理/灯/FX 全清，root 从父级摘除。
- `nextCar`：透传 MachiTraffic.nextCar 供调试。

## 验证

1. `npm run typecheck` → exit 0。
2. `npm run test:unit -- test/unit/visualizer`（machi 全部 + tuning/快照）。
3. `npm run codemap:check`（边界规则，新目录不得引入违规）。
4. 自检：`git diff cb2e4ec0` + 新文件逐个读。
5. 派只读子代理审查（development-workflow），逐条处理。
6. 真机视觉验收由组织者装机完成，本任务不声称视觉已验。
