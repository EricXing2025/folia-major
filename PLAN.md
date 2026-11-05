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
