# PLAN — ai-scene-radio v1

目标：Folia Folium 模组「AI 场景电台」v1 可用版（只改 `mods/ai-scene-radio/**`，提交到 `feat/ai-scene-radio`，不 push）。

## 关键事实（已核实）

- `folium.omni`（1.7+）只读：`searchSongs`/`resolveSongs`/`describeSong`/`getLyrics`/`getAlbum`/`getArtists`/`resolveCollection`/`getTracks`/`getArtistAlbums`/`listProviders`。**没有歌单/用户库读取 API**。`platform.raw` 只有 netease 有 endpoints（`foliumShared.json`），QQ 无法经它读歌单 → **「兜底播现有同名歌单」无法按字面实现**，采用等价兜底链并在交付说明。
- `folia-mod://` 只 serve `.js/.mjs`（`modProtocol.cjs`），client 相对 import 可用 → config 数据内嵌为 `configData.mjs` 常量，`config/*.json` 保留为源。
- `replaceQueue`：整体替换、`expectedVersion` 乐观锁、`status: replaced|refused`；续单＝读 getQueue → 旧歌+新歌整体 replace。replace 后不自动开播，fresh 场景用 `playQueueItem(0)` 开播（需 `playback.control`）。
- `folium.net.fetch` 透传任意字符串 header（`netFetch.cjs`），可带浏览器 UA 过 Cloudflare 1010。
- `folium.secrets` 读 `secret` 型设置项；settings section 三个字段：gatewayBase / model / apiKey(secret)。
- 事件：`playback.songChanged`（{song|null}）、`playback.queueChanged`（FoliumQueueChange）。`folium.every(ms, fn)` 轮询；`folium.storage` 1MB JSON。
- `FoliumSong.ref` 会话内句柄，**禁止持久化**：storage 只存 `{s:source,i:id,t:title,a:artist}`。

## 文件

| 文件 | 动作 |
| --- | --- |
| `mod.json` | 改：version→1.0.0，permissions→`playback.queue, playback.control, net.fetch, filesystem.data`，description 去骨架措辞 |
| `configData.mjs` | 新：PROFILE/SCENES/EXCLUSIONS 常量（与 config/*.json 一致，文件头注明以 JSON 为源） |
| `radio.mjs` | 新：纯逻辑引擎（依赖注入端口），含全部可测 helper |
| `client.mjs` | 改：activate 装配——settings section、5 场景命令+停止命令、queueChanged/songChanged 监听、every(1s) 采样位置、接 engine |
| `tests/run.mjs` | 新：node 纯逻辑单测，fake fetch/omni/playback/storage 注入 |
| `README.md` | 改：现状→v1，写清兜底等价实现与未验项 |
| `config/*.json` | 不动（唯一真源） |

## 主流程

1. 场景命令 → runScene(sceneId)：读 secrets/settings/storage → buildPrompt（画像+场景+避重+负反馈+排除歌手）→ net.fetch 调 `${base}/chat/completions`（Bearer + 浏览器 UA，timeout 45s）→ parseCandidates（容错解析 JSON 数组）。
2. 逐首核验：`searchSongs("title artist")` → pickMatch 打分（title 归一化全等>剥括号等>弱等；artist token 交集必须≥1；describeSong 去 taken-down）→ 排除簇过滤 → 去重（本批+近期已播+当前队列）。失败率过高提前中止。
3. 送播：`getQueue`→`replaceQueue(songs,{expectedVersion})`，`stale-version`/`rate-limited` 重读版本重试≤2；fresh 场景 `playQueueItem(0)` 开播；写 batches[sceneId]、queuedKeys；toast N 首。
4. 续单：queueChanged 且 active → snap=getQueue；queuedKeys 与队列无交集→停用电台；`length-currentIndex-1 ≤ 3`→续批：generate → replaceQueue(旧+新)。
5. 反馈：every(1s) 采 getState().position/duration；songChanged 时对上一首 classifyListen：<30s→neg，≥85%或距尾≤15s→pos，其余→heard；入 storage（cap 300）供避重/画像。
6. 兜底链（生成失败/无 key/核验为空/拒绝）：①storage batches[scene] → resolveSongs → replaceQueue+play；②降级生成：核心歌手 searchSongs 各取 top（同套过滤）→ replaceQueue+play；③toast 请手动播「fallbackPlaylist」（驾车无则通用文案）。

## 单测覆盖（tests/run.mjs，fake 注入）

- buildPrompt 含画像/场景/避重/负反馈
- 排除：confirmed 对、suspected 对、blockedArtist 各命中；正常歌放行
- dedupe + 已播避重
- parseCandidates：裸 JSON/```json 围栏/前后散文/尾逗号/坏输入
- pickMatch：确切版本判定（全等>剥括号>翻唱 artist 不交集拒）
- engine 全链：LLM→核验→replaceQueue→playQueueItem；ref 不入 storage
- 失败：LLM 拒→兜底链（snapshot→queue；空 snapshot→降级；全空→toast 含 fallbackPlaylist 名）
- 续单：remaining≤3 触发且 append 保留旧歌；无交集停用
- classifyListen 三类

## 风险

- **同名歌单不可达**（无 API）→ 等价兜底链 + toast 指引，交付注明。
- `searchSongs` 速率 120/min、并发 8：15~23 首顺序核验安全；续单间隔 ≥8s。
- `replaceQueue` 拒绝分支（stage/transition/stale-ref/not-queueable）→ 重读重试或进兜底。
- 续单误触发：以 queuedKeys 交集判定电台活性，用户换队列自动停用；generating 锁+冷却防重入。
- LLM 输出漂移：解析容错+候选过量生成（batchSize+8）+核验过滤。
- 反馈误判：position 靠 1s 采样，暂停/seek 有少量误差，可接受。

## 验证

- `npm run folium:check ai-scene-radio`（需 node_modules：check.mjs 走 electron/modSystem 与 src TS，Node24 原生 strip 即可，npm install 视缺省再跑）
- `node mods/ai-scene-radio/tests/run.mjs`
- 真机冒烟：不在本次验收（标注未验）

## DELIVERY

### 结果

`mods/ai-scene-radio/` v1 可用版完成：5 场景命令走「LLM 生成 → omni 逐首核验确切版本 → replaceQueue 整队送播 → playQueueItem(0) 开播」全链；剩 ≤3 首自动续单（旧歌保留、新歌接尾、>500 队列分页读全、>5000 放弃）；队列里电台歌清零自动停用；跳歌 <30s→neg / 听完→pos / 中途→heard 写入 storage；失败走「上次批次快照 → 核心歌手降级 → toast 指向同名歌单」三级兜底。

文件：新增 `radio.mjs`（引擎，纯逻辑+deps 注入）、`configData.mjs`（配置内嵌，以 config/*.json 为源）、`tests/run.mjs`；改 `client.mjs`（装配：设置区三项/命令双语 FoliumLabel/事件+定时器仅 main context/onDispose→dispose）、`mod.json`（1.0.0 + 约定四权限）、`README.md`（v1 说明）。`config/*.json` 未动。

### 验证输出

- `node mods/ai-scene-radio/tests/run.mjs` → **27 tests passed**（纯逻辑+fake fetch/omni/playback/storage/secrets；含瞬态拒绝重试、busy 重入、长队列分页、activeSceneId 回滚、署名分隔变体等新用例）
- `npm run folium:check ai-scene-radio` → exit 0，`no problem found`（note：无 preview/未签名，属预期；check 只静态扫描不跑模组）
- **真机冒烟：未验**（brief 明确不在本次验收）：Folia 内实际点场景命令、真网关 LLM、真 omni 搜索与真 replaceQueue 均未跑过；`folium:check` 不能替代。

### 独立审查（2 轮）

**第 1 轮**：1 中 + 13 低。中：命令 label/description 用纯字符串违反 `FoliumLabel` 契约（命令面板会回退显示 `play-work-morning`）→ 已改 `{'zh-CN',en}` 对象。低项采纳修复：classifyListen 短歌播完误记 neg（改先判 pos）、storage 读失败缓存空态回写（改不缓存/不落盘）、busy 误报「已走兜底」（runScene 改返回 ok/busy/fail）、新场景误避重旧队列、pairKey 署名变体漏配（改歌名+歌手 token 交集）、网关配置未 trim、快照恢复未滤下架、降级未校歌手归属、续单只读单页（改 readWholeQueue 分页）、batches 非数组防护。未采纳：seek 补偿（精度边界）、非电台歌记 sc（仅信息字段）。

**第 2 轮**：0 高、5 中、17 低；第 1 轮修复全部复核通过。5 中全部修复：
- M1 `transition`/`stage`/未知拒绝被当死错直接进兜底 → `submitQueue` 统一拒绝分类：瞬态 1.5s 一拍重试 ≤40s（契约：未知原因按 transition 处理），stale-version/rate-limited 重读退避 ≤3 次，stale-ref/not-queueable 按 index 剔除再试。
- M2 失败不回滚 `activeSceneId` → 兜底也空时恢复进入前场景，防反馈错标与意外续单。
- M3 `onSongChanged` 位置快照在 await 后才复位 → 函数头同步快照+复位，双事件竞态消除。
- M4 overlap 只查居中页 → 页不满直接用、看不全按 readWholeQueue 读全再判；queuedKeys 同时存 id/pair 两键。
- M5 模组停用在途副作用不中止 → `dispose()` + `folium.onDispose` 接线；say/runScene/事件入口均查 disposed；顺带 main context 才挂事件与定时器。

低项顺带修复：appendQueue 用 retryAfterMs、readWholeQueue 按实际页长推进、playQueueItem 返回值检查+防 reject 级联、blockedArtists 组合署名分隔归一（不拆成员）、降级避开当前在播歌、续单连续失败 ≥3 次停用并 toast、启动接管正在播的歌、gatewayBase 空白兜底。明确保留：L6 版本注记变体放行（有意留口）、L11 stop() 不中止在途生成（语义如此）、L12 核验串行（8/min 量级安全）、L16/L17 一次性空态与 1s 采样精度（设计取舍）。第 2 轮修复按流程不再审查。

### 已知边界 / 剩余风险

- 同名歌单无法自动播放（Folium 无歌单读 API，QQ 无 platform.raw）→ 三级兜底为约定等价实现，README 已注明。
- `queuedKeys` 会话内只增不减：用户长队列恰好含电台历史歌且队尾 ≤3 时可能误续单（低概率，仅追加无害）。
- 反馈判定 ±1s 采样粒度；拖动进度条到尾部的 seek 会记 pos（设计上限）。
- storage 首读持续失败时该次反馈/批次不落盘（选择不覆写已学数据）。

### 提交

`feat/ai-scene-radio`，只含 `mods/ai-scene-radio/**`；PLAN.md 未提交；未 push。

---

# PLAN - ai-scene-radio v2 core bridge (feat/v2-core-bridge)

Base `bcfe33b9` on `feat/ai-scene-radio`. Preserve this pre-existing v1 plan and the unrelated dirty `package-lock.json`. This v2 plan is written before v2 implementation.

## Verified anchors and implementation

- Folium permissions and activation: `electron/modSystem/foliumShared.json` is the permission table; `src/mods/folium/api.ts:createFoliumClientApi` constructs namespaces per activation, and `src/mods/folium/contract.ts:FoliumClientApi` is the source for generated `mods/folium.d.ts`. Add three call-time-gated namespaces here, with stop/dispose cleanup; do not expose provider credentials.
- Playlists: `src/services/onlineMusic/omni.ts:getUserPlaylists`, `getCollectionTracks`, `updateCollectionTracks`, `createPlaylistWithSongs` delegate into provider capabilities; `src/services/onlineMusic/qq/qqMutations.ts:updatePlaylistTracks/createPlaylist` is QQ's existing write path, and `qqProvider.ts:getUserPlaylists` reads the account. Add the smallest Omni methods to create an empty playlist and replace its tracks using existing add/del mutations; resolve only active-account owned editable playlists; fail unsupported with `NOT_SUPPORTED`. Bridge reads active provider/account through Omni, never raw QQ endpoints. Never delete a playlist.
- Effects: `src/stores/useAudioSettingsStore.ts` holds listener settings and a *persisted* Folium mod curve, while `src/components/app/playback/bridges/usePlaybackAudioBridge.ts` and `src/components/panelTab/AudioEqualizerDialog.tsx` resolve heard settings. A new session-only profile overlay must NOT use persisted curve/preset writes; integrate it into the same heard-settings selection feeding the existing Web Audio graph, make the panel reflect the heard settings, and remove the overlay on clear/disable. `src/utils/audioEffects.ts` maps cutoff/drive/crush/wow/noise/width/space/punch; ten bands in `src/utils/audioEqualizer.ts`.
- Radio: actual Bravais native radio projection is `src/library/suites/bravais/BravaisHomeSources.tsx:BravaisHomeOnline` -> `BravaisHomeDirectory`, not an isolated page component. TUI uses `src/library/suites/tui/LibraryTuiHomeLists.tsx`. Add session-scoped per-mod registration with subscription/cleanup and render entries only for radio tab at the head of native list, using each suite's existing card/list styling and click-to-start. Add i18n keys in `src/i18n/locales/{en,zh-CN,in}.ts`.
- Grid's native radio page also consumes `useLibraryHomeOnline` in `src/library/suites/grid/home/Grid3D.tsx`; project the same session-only cards there, ahead of its existing `DesktopGrid3DSurface` entries.
- Mod: `mods/ai-scene-radio/client.mjs:activate` registers commands and owns event subscriptions; `radio.mjs:createRadio` handles run/continue, `fallback` currently tries saved batch before core singers. Feature-detect independently, preserve v1 without bridge. Add profile table, mod-owned playlist IDs and guarded upsert off the playback critical path, and one playlist retry before snapshot fallback. New mod settings default on.

## Verification and constraints

- Tests: mod `node mods/ai-scene-radio/tests/run.mjs`, targeted mod-system/audio/omni Vitest, `npm run folium:check ai-scene-radio`, `npm run typecheck`. Include profile table, exact playlist ownership, all three missing bridges, fallback order, profile cleanup and denied permissions. Do not call live QQ or LLM in automated checks.
- Only v2 source/tests/docs in logical commits; leave existing lockfile diff untouched. Independent read-only review of full diff before delivery; local verification only, no production, GitHub Actions or account writes.

---

# PLAN — v2 修复批（fix/v2-argon-batch，基线 feat/v2-core-bridge @ 313300e3）

Argon 独立审查修复 F1–F7 + 新功能 F8（电台卡片封面）。已核实的关键事实：

- `omni.getSongDetails(providerId, ids)` 已存在，返回 `OmniSongDetail[]`（found/missing/failed/skipped），QQ 侧 `songDetailsPerRequest: 25` 按组顺序发——简报说的「`(UnifiedSong | null)[]`」实际是包装后的形态，按 status !== 'found' → NOT_SUPPORTED 处理。
- `normalizeQqSong` 同写 `song.id`（数字 songId，缺省退 songMid）、`song.qqMid`、`sourceRef.mediaId`（songMid）、`providerData.{songId,songMid,mediaMid}`。`platformNameCount` 按行正则计数，`omni.ts` 不允许出现 `qq` 字样（platformNamePlaces 配额 netease:5 / kugou:2 / qq:0）——匹配键不写 `qqMid`，用 `id + mediaId + providerData.{songId,songMid,mediaMid}` 等价覆盖。
- `ProviderCollection.coverUrl` 已存在；`normalizeQqCollection` 取 `bigpicUrl/picUrl/picurl/coverUrl`，不含上游歌单的 `logo`——补进 pick 列表。
- `mods/folium.d.ts` 与 `docs/folium/api.md` 由 `npm run folium:types` / `folium:api` 从 contract.ts 生成，改源头再跑脚本。
- TUI 的目录与账号列表都是 window 级键绑定（useLibraryTuiDirectoryKeys / useLibraryTuiAccountListKeys），同挂会抢键：F7 在 TUI 不叠两个交互列表，改为目录照常 + 底部状态行（原因 + F2 提示，F2 开完整平台列表）。
- Grid 的 OnlineProviderAccountlessPanel / HomeLoginPanel 均为 flex-1 整面板；Bravais 的 guest 提示（wallHint/accountless 文案）不动；Grid/Bravais 的卡片渲染均按 `item.coverUrl` 通用走，scene-radio 无特判，TUI 纯文本无图属固有。
- `getFoliumModList`（clientLoader）可被组件引用（components 已有 mods/runtime 引用先例），用于 modId→友好名。

## 逐项落地

- **F1** `hostSessionBridge.replacePlaylistSongs`：`tracks.length > 500` 并入现有 TypeError 校验行；`Promise.all(getSongDetail)` → 一次 `omni.getSongDetails(providerId, tracks.map(t => t.id))`；任一 `status !== 'found'` → NOT_SUPPORTED；`sameAccount(owner)` 保持在解析后、写入前。
- **F2** `omni.replaceCollectionTracks`：分页读旧（不变）→ 差量：新列表只 add 现有没有的，现有只 del 不在新列表的；`stillCurrent()` 于 add 前、add/del 之间各一次；add 抛错不再 del（旧歌零删除）。`createEmptyPlaylist` 与 `replaceCollectionTracks` 成功结尾各补 `void this.refreshProviderPlaylists(provider.id).catch(() => undefined)`。
- **F3** `setAudioProfileOverride` set 时写 `audioEqualizerChangeOrigin: { kind:'mod', modId }`（profile 为 null 时写 HOST_ORIGIN）；`clearAudioProfileOverride` 真清掉时写回 HOST_ORIGIN；`hostEqualizer.onAudioSettingsChange` 的 noteChange 条件加 `state.audioProfileOverride !== previous.audioProfileOverride`。
- **F4** `sceneBridge` createPlaylist NOT_SUPPORTED catch：仅 `!disposed` 时回滚，重读台账，只删 `[key][scene.id]` 的 `'pending'` 项后写回。
- **F5** `ModCurveNotice`：override 存在且无 modCurve → 同风格提示条（modId→getFoliumModList 名字，取不到用 modId）+「恢复原音效」（复用 `ui.equalizerModCurveRelease`），调 `clearAudioProfileOverride(modId)`。新 key `ui.equalizerModProfile` 三语（en/zh-CN/in）。modCurve 行为不变。
- **F6** client.mjs：模块级 `lastLinkAudioFx`（登记 onChange 前取当前值），仅 true→false 跳变调 `radio.clearAudioProfile()`。
- **F7** Grid3D：accountless/guest + sceneCards → `DesktopGrid3DSurface` 与对应登录面板并存（面板在列表下方）。TUI：guest/accountless + 有卡 → 目录 + 底部状态行（原因 + `libraryTui.accountsOpenHint`）；resolving 维持现状。Bravais guest 文案不动。
- **F8** contract.ts：registerEntries 条目 +`imageUrl?: string`、listPlaylists 返回项 +`coverUrl?: string`；hostSessionBridge 校验 imageUrl（https:// 前缀且 ≤2048，否则忽略该字段不抛错）、listPlaylists 带 coverUrl（有才带）；sessionBridge.ts 参数类型补 imageUrl；radioEntries.ts `RadioEntry.imageUrl?` + `radioEntryCards` 带 `coverUrl`；qqNormalize collection pick 加 `'logo'`；sceneBridge 加 `covers(scenes)`（一次 listPlaylists + 台账按标题比对）与 `onSaved` 钩子；client.mjs `sceneCovers` + `registerRadioCards`/`refreshRadioCovers`，注册与每次 save 后刷新。

## 验证

- `npm run typecheck`；`npm run test:unit`（omni.test、foliumSessionBridge.test、audioEqualizerModCurve.test、omniArchitecture）；`node mods/ai-scene-radio/tests/run.mjs`；`npm run folium:check ai-scene-radio`。
- 新增测试：`foliumSessionBridge.test.ts` 改 mock getSongDetails + >500 上限；`omni.test.ts` 加差量更新用例（add 失败不 del、只删过期曲）。
- 收尾按 development-workflow 派独立子代理审查，逐条核实再交付。

---

# PLAN — 修复批第二轮 F9 + F10（fix/v2-argon-batch 追加，2026-11-05）

基线 2f53794e（F1–F8 已交付核证）。只动 `mods/ai-scene-radio/**` 与相关断言，分支基线不变。

## F9 选歌去硬屏蔽（Eric 定版）

82 人排除名单只是口味分析防画像混淆的工具，不是聆听禁令；选歌只按画像判断。

- radio.mjs：删 buildPrompt「以下歌手永不出现…」行及 `exclusions` 参数；删 `buildExclusionIndex`/`isExcluded` 与全部 4 处应用点（verifyOne、playlistSync 兜底、快照兜底、降级生成）；import 去 EXCLUSIONS。
- configData.mjs：EXCLUSIONS 数据保留，注释标明选歌不再使用、仅分析溯源。
- client.mjs / README 同步措辞。tests/run.mjs 删 4 个排除簇用例，buildPrompt 断言改为无屏蔽行，全链用例改为名单内歌曲照常入队。

## F10 续单失效与静默兜底（真机故障：14:45 后再无新批次，快照无限重播）

结构性修复，红线：任何失败不打断在播队列；升级路径每轮一次 LLM；不改画像/场景/批次大小。

1. **状态恢复** `restore()`：激活时读 batches 与实时队列按 song identity 对齐——队列主体（命中 ≥MIN_QUEUE_SONGS 且过半）等于某场景批次则恢复 activeSceneId 并重建 queuedKeys，随后走一遍 onQueueChanged 判定（队尾立即续单）。client 仅 main context 调 `void radio.restore()`。
2. **续单升级**：continuation 'fail' → `runScene(sceneId, {force:true})` 整队新生成一次（跳冷却，等同手动点卡）；整队也 'fail' 或 contFails ≥3 → 停用电台 + 可见错误 toast（带失败环节标签）。busy 不升级不计数。
3. **复活上限**：storage 增 `revivals[sceneId]`（rememberBatch 成功生成时清零）；fallback 入口检查 ≥1 次直接返回 false 不发任何重播，playlistSync 与快照两腿任一复活成功即 +1 落盘；降级腿出新歌不算复活。用完走错误 toast。
4. **诊断落盘** `aiSceneRadio.diag.v1`：每次生成尝试失败写 `{at, scene, stage: llm|verify|queue|fallback, error, consecutiveFails}`；真生成成功 `storage.delete`。runScene 内按阶段打标（callLlm→llm / verifyBatch→verify / submitQueue→queue / 兜底耗尽→fallback，error 记 `原阶段:message`）。
5. contFails 改为「连续生成失败」全局计数：runScene 成功清零，任何失败 +1（含兜底救回）；onQueueChanged 不再自管计数，只保留 ≥3 兜底停用闸。

## 验证

- `node mods/ai-scene-radio/tests/run.mjs`：**57 tests passed**（新增：状态恢复对齐/不恢复、续单升级成功与失败停用、append 被拒升级、复活上限、diag 写入与清零、接管不抢队、排空升级、stopped 补播、paused 不补播、dispose 停送、整队替换清旧键等；既有用例同步 F9 断言）。
- `npm run typecheck` exit 0；`npm run folium:check ai-scene-radio` exit 0 `no problem found`（无 preview/未签名两条 note 属预期）。
- 真机验收（组织者）：队尾 ≤3 出新批次；停用→启用后续单仍生效；断网点卡第一次复活、第二次错误 toast + diag 落盘。

## 独立审查（2 轮）

**第 1 轮**：2 中 + 8 低。中项已修：①`submitQueue` 重试环与 fallback 在途缺 disposed 复查——循环头加闸；②续单生成窗口内队列漂移——appendQueue 的 getBatch 加归属检查（排空→queue-empty 升级、无电台歌→queue-taken-over 不追加），升级前 `queueOpenForEscalation` 复查归属，stopped 补播接起自然播完。低项采纳：翻页读队异常 try 包住、restore 异常记 warn、restore 接管即 applyAudioProfile、兜底全空 toast 带环节、exclusions.json note 同步 F9 语义、README 重试次数改 ≤3。刻意保留：升级被兜底救回但连败到顶仍停用（contFails 是需求写的 LLM 上限）；mod.json 版本号不动（留给组织者发版）。

**第 2 轮**（复审修复）：1 高 + 4 中，全部修复。H1 升级路径只在生成前验一次归属，窗口内接管会抢队 → `runScene` 加 `guard` 选项走 `replaceWholeGuarded`，送队每轮复查归属，被接管 fatal + 静默停用。M1 补播 `findIndex` 是页内相对下标、真机居中分页会播错 → 改 `result.length - verified.length`（追加必在队尾）。M2 'replaced' 落地后无 disposed 复查 → 主链两路 + 兜底三腿各补一道。M3 补播/升级不区分自然播完与用户主动停 → 触发时记播放态，仅 playing→stopped 补播；ours 队列升级还要求仍在播，paused/stopped 静默停用。M4 `queuedKeys` 只增不减会把用户队列误判电台 → `markQueued(reset)`，整队替换路径（非续单 + 兜底三腿）重置为当批键。低项未处理：瞬态 getQueue 抛错烧一轮生成、dropIndex 可能剔错旧歌、fake 分页语义与宿主居中不同（已有覆盖，残余）、静默停用不清 contFails 等，交付注明。按流程第二轮修复不再审查。

---

# PLAN — 修复批第三轮 F11–F14 + F8b（fix/v2-argon-batch 追加，2026-11-05）

基线 9743d493。独立 Reviewer 复核 P1×2 阻断上线（成立），P2×2，F8 二档封面为首轮简报截断漏项。只动 `mods/ai-scene-radio/{radio,client}.mjs` 与 tests/run.mjs，宿主源码零改动。

## F11（P1-1）续单后 restore 永远接管失败

- 根因：续单成功时 `rememberBatch` 只存新追加一截，`batches[sceneId]` 被覆盖成最后一批；restore 要求命中严格过半——续单一次后队列 30、命中 15，永远不达标。
- 修法：续单时 `batches[sceneId]` 存**整场累积镜像**（旧批次 + 本次追加，按播放顺序），`clip` 到 `BATCH_STORE_LIMIT=60`；整队替换（reset）语义不变。选「旧批次+追加」而非 readWholeQueue 镜像：队列里可能混着用户歌，镜像会把它们记进批次身份集、稀释 F12 的归属判定，且避免落地后再读一次队列的竞态。

## F12（P1-2）restore 误接管用户小队列

- 接管三条件齐备才恢复：命中 ≥`RESTORE_MIN_MATCHES`(6)、命中/队列 ≥2/3（`matches*3 >= len*2` 边界含）、且显示歌（若有）属于该批次身份集（id 或 pair 键）。显示歌按 `getState().song`（display song）判，读出异常按无歌放行。

## F13（P2-1）补播分不清自然播完与用户按停

- 宿主语义核实：`getState().song` = 显示歌（`transitionDisplay?.song ?? currentSong`）；队列自然播完走 `stopAtQueueEnd` 只置 `PlayerState.IDLE`、**不清 currentSong**（= 队尾那首）；`replaceFoliumQueue` 注释明确 "Nothing about what plays changes"，不改写在播侧。「落地时 stopped 且显示歌仍是追加前队尾」可证明自然耗尽，前提成立。
- 修法：resumePlay 落地判别改为——`state==='stopped'` 且 `getQueue({offset: tailIndex, limit:1})` 取到的追加前队尾与 `getState().song` 同歌（`sameSong`：id 或 pair 键相等）。tailIndex = `result.length - verified.length - 1`，firstNew = tailIndex+1。用户停在中间某首、换歌、登出（song=null）均不补播。

## F14（P2-2）升级失败双 toast + 被接管误导 toast

- `runScene` 加 `quiet`：升级调用传 `quiet:true`；`no-api-key` toast 在 quiet 下也不发；`fallback` 第 4 参 quiet——内部所有 `say` 换 `tell`（腿照跑、额度照记，但零出声）。
- 升级后再判接管：`queueTakenOverByUser()`（整队读、非空、无一首电台歌）补 `lastFail==='refused:queue-taken-over'`——生成败因非接管但兜底腿期间被接管的情况也静默停用。共用整队读取抽为 `queueSongsNow()`。

## F8b 场景卡封面第二档

- `portable(song, withCover)`：withCover 时附 `c`=`omni.describeSong(song)?.coverUrl`（describeSong 同步读 `song.album?.coverUrl`；没有就不写字段）。批次条目（含累积镜像全部条目）带 c；history 条目不带。
- client `refreshRadioCovers`：一档 `covers()` 缺失的场景，二档先取 `batchCovers[sceneId]`（rememberBatch 记的**最近批**首曲封面；镜像批界丢失后 batches[0] 是最旧留存首曲），旧存档没有该字段退回 `batches[sceneId][0].c`，都没有跳过不报错。不再要求 playlistSync 存在（library 缺失时二档仍生效）。新增 deps `onBatchStored`：rememberBatch 落盘后回调刷新，批次更新封面跟随。`loadState` 归一化时保留 `batchCovers`（否则重载后被下个场景落地盖丢）。

## 独立复审（1 轮，explore 子代理）

1 中 + 10 低。**中 M1（必修已修）**：快照复活腿把累积镜像整镜送 `omni.resolveSongs`，超 50-key 契约必抛 → 该腿废；且回放整场而非上一批。修为 `slice(-min(batchSize,50))` 取镜像末尾一批。**低项采纳修复**：L4 batches[0] 非「最近批首曲」→ 加 `batchCovers` 字段；L5 补播 `playQueueItem` 加 `expectedRef` 钉住新批首曲。**低项记录在案不修**：L1 dropIndex 剔新歌时 tailIndex 偏一（方向保守漏补非错补）；L2 显示歌判定用镜像全集宽于 spec 字面命中集（有意取舍，残余面窄）；L3 升级链仍弹「正在生成」info toast（spec 只约束错误侧）；L6 触发前已自然耗尽的队列接尾后不补播（保守）；L7-L9 pair 键宽松/排空放行/读页漂移的固有边界；L10 其余覆盖缺口已按价值补 3 条。

## 验证

- `node mods/ai-scene-radio/tests/run.mjs` → **70 tests passed**（较上轮 +4：镜像>50 快照腿只取末批、F12 无在播歌放行、F12 比例闸拒绝、batchCovers 续单更新；另有 client 用例扩到 batchCovers 优先语义）。
- `npm run folium:check ai-scene-radio` exit 0 `no problem found`；`npm run typecheck` exit 0。宿主文件零改动，无定向宿主单测需跑。
