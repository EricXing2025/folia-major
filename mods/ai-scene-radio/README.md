# AI 场景电台（ai-scene-radio）

选场景即自动播放符合 Eric 口味的歌 —— 把「ChatGPT 按口味画像出单 + Muse 逐首核对 + 手动逐首添加」的人工流程产品化。

设计简报全文在 Muse 侧档案 `qqmusic-archive/Folia-AI场景电台-设计简报.md`。

## 现状（v0.1 骨架，2026-11-04 夜）

- `mod.json`：模组声明，权限只申 `playback.queue`（换队列送播用）。
- `client.mjs`：注册 5 个场景命令（工作·上午/下午/晚上、驾车、读书），点了只提示待接入；主流程五步写在文件头注释里。
- `config/profile.json`：口味画像定版摘要（核心歌手、底层轴、风格与特质）。
- `config/scenes.json`：五场景参数（能量曲线、节奏、人声比例、兜底歌单、批量）。
- `config/exclusions.json`：科玲收藏簇排除名单（已确认 33 + 疑似 68，共 101 首 / 82 位歌手），由归属划分档案生成，永不进推荐。

## 待接入（v1 主流程）

1. 提示词组装（画像+场景+已播避重+跳歌负反馈）→ `folium.net` 调 LLM（trendxai 网关）
2. `folium.omni` 逐首搜索核验（确切版本、可播、排除簇、去重）
3. `folium.playback.replaceQueue` 送播；剩 ≤3 首自动续单
4. 跳歌学习：<30 秒跳过记负反馈、听完记正反馈（folium.storage）
5. 兜底：失败时播 fallbackPlaylist

## 本地验证

仓库根目录：`npm run folium:check ai-scene-radio`（需先 `npm install`），
再在 Folia「设置 → 模组」开模组系统开关、重载、启用本模组（未签名模组会显示「未验证」，自用正常）。
