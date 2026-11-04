# AI 场景电台（ai-scene-radio）

选场景即自动播放符合 Eric 口味的歌 —— 把「ChatGPT 按口味画像出单 + Muse 逐首核对 + 手动逐首添加」的人工流程产品化。

设计简报全文在 Muse 侧档案 `qqmusic-archive/Folia-AI场景电台-设计简报.md`。

## 现状（v1.0.0，2026-11-04）

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

> **API 限制说明**：Folium 没有歌单读取能力（`folium.omni` 不读用户库，`platform.raw` 只有 netease），「播现有同名歌单」无法按字面实现，上面是等价兜底。若后续 Folium 开放歌单读取再换真实现。

## 本地验证

```sh
npm run folium:check ai-scene-radio     # 静态检查（需先 npm install）
node mods/ai-scene-radio/tests/run.mjs  # 纯逻辑单测
```

真机：Folia「设置 → 模组」开模组系统、启用本模组（未签名显示「未验证」，自用正常），在模组设置里填 API Key，命令面板跑「AI 电台：…」。真机冒烟本次未验。
