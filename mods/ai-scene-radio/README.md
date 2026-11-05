# AI 场景电台（ai-scene-radio）

选场景即自动播放符合 Eric 口味的歌 —— 把「ChatGPT 按口味画像出单 + Muse 逐首核对 + 手动逐首添加」的人工流程产品化。

设计简报全文在 Muse 侧档案 `qqmusic-archive/Folia-AI场景电台-设计简报.md`。

## 现状（v1.1.0，2026-11-05）

在提供 v2 bridge 的 Folia 上，五个场景还会出现在原生「电台」页签的「AI 场景」卡片中，点击走与命令面板相同的开播路径。模组设置新增「联动音效」和「保存歌单」，均默认开启。开播成功后音效 profile 暂时覆盖 10 段均衡器和效果链；停止续播、队列被接管或停用模组时撤回，原有预设与自定义槽不写入。生成成功的 QQ 批次会异步保存到本模组创建的 `AI 电台 · <场景>` 歌单；账号以 Folium 不透明 `accountKey` 隔离，只有已记录的 ID 且名称完全匹配才会替换歌曲，不认领同名的别人的歌单，也不删除歌单。生成失败时优先播已记录的场景歌单，随后才按原顺序尝试 v1 批次快照、核心歌手和手动播放提示。

若宿主认识新权限但不提供对应 namespace，上述三项分别降级，v1 命令、生成和兜底逻辑仍能工作；歌单权限不足或平台不支持时只记日志，不影响播放。但未改造的 Folium 1.7 宿主会在加载前拒绝 `mod.json` 的三个未知权限，无法用同一 v2 包运行 v1；旧宿主仍需使用 v1 版本包（`feat/ai-scene-radio`）。这是 manifest 校验早于 client 特性检测的限制。QQ 的完整替换借现有删除旧曲目、添加新曲目的写入路径完成，不是原子事务；中途平台写入失败可能留下部分曲目。建单前先在模组存储里记预留标记：如果 QQ 回包结果不明，不自动重试创建，以免反复造出歌单；该场景保存会暂停，需核实账号里的歌单和模组记录后再恢复。没有对真实 QQ 账号执行过写入验收。

下文保留 v1 背景供对照：其中「没有歌单读取 API」仅指无 v2 bridge 的旧 Folium。

- `mod.json`：权限 `playback.queue`（整队送播）、`playback.control`（开播、续单点播）、`net.fetch`（调 LLM）、`filesystem.data`（反馈与批次快照）。
- `client.mjs`：接线层。注册 5 个场景命令（工作·上午/下午/晚上、驾车、读书）+「AI 电台：停止续播」；设置区三项（网关地址默认 `https://trendxai.io/v1`、模型默认 `gemini-3.8-flash-high`、API Key 为 secret 型走 `folium.secrets`）；挂 `queueChanged`/`songChanged` 监听与每秒位置采样。
- `radio.mjs`：核心逻辑，副作用全经注入端口，可离线单测。
- `configData.mjs`：`config/*.json` 的内嵌副本（`folia-mod://` 只 serve .js/.mjs，读不了 JSON）；**改配置先改 JSON 再同步它**。
- `tests/run.mjs`：纯逻辑单测，fake fetch/omni/playback/storage 注入，不连真网关。

## 主流程

1. 场景命令 → 组装提示词（画像 + 场景参数 + 已播避重 + 跳歌负反馈 + 排除歌手）。
2. `folium.net.fetch` 调 `${base}/chat/completions`（Bearer + 浏览器 UA——网关在 Cloudflare 后，无 UA 被 403/1010；timeout 45s）。
3. `folium.omni` 逐首核验：确切版本（标题归一全等 > 剥括号同名，歌手须有交集）、非下架、整簇排除、去重与已播避重。
4. `replaceQueue` 整队送播（expectedVersion 乐观锁，stale-version/rate-limited 重读重试 ≤2）；开播 `playQueueItem(0)`。
5. 队列剩 ≤3 首自动续单（新歌接尾）；队列里电台的歌全被换掉自动停用。
6. 反馈：每秒采 `getState().position`，`songChanged` 时 <30s 记 `neg`、≥85% 或距尾 ≤15s 记 `pos`、其余 `heard`，入 `folium.storage`（cap 300，只存 `{s,i,t,a}`，**不存 ref**）。

## 兜底链（生成失败 / 无 key / 核验为空 / 送播被拒）

1. 该场景上次核验批次快照 → `resolveSongs` 复活 → 送播；
2. 核心歌手降级生成（`searchSongs` 取前排，同套过滤）→ 送播；
3. toast 指向 `fallbackPlaylist` 同名歌单请手动播。

> **v1 API 限制说明**：旧 Folium 没有歌单读取能力（`folium.omni` 不读用户库，`platform.raw` 只有 netease）；v2 通过新权限控制的 `folium.library` 补上，不使用 `platform.raw`。

## 本地验证

```sh
npm run folium:check ai-scene-radio     # 静态检查（需先 npm install）
node mods/ai-scene-radio/tests/run.mjs  # 纯逻辑单测
```

真机：Folia「设置 → 模组」开模组系统、启用本模组（未签名显示「未验证」，自用正常），在模组设置里填 API Key，命令面板跑「AI 电台：…」。真机冒烟本次未验。
