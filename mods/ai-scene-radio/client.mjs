// mods/ai-scene-radio/client.mjs
// AI 场景电台（骨架 v0.1）：选场景即自动播放符合 Eric 口味的歌。
// 设计简报：qqmusic-archive/Folia-AI场景电台-设计简报.md（Muse 侧档案）
//
// 本文件现状：命令注册与场景清单就位，点命令只提示「生成逻辑待接入」。
// 待接入的主流程（按简报 v1）：
//   1. 组装提示词：config/profile.json（口味画像）+ config/scenes.json（场景参数）
//      + storage 里的最近已播与跳歌负反馈；
//   2. folium.net 调 LLM（trendxai 网关，OpenAI 兼容；密钥存 folium 密钥区）出候选（歌名+歌手）；
//   3. folium.omni 逐首搜索核验：确切版本、可播、过 config/exclusions.json 排除簇、去重；
//   4. folium.playback.replaceQueue 整队送播（需 playback.queue 权限，mod.json 已声明）；
//   5. 监听队列，剩 <=3 首自动续单；<30 秒跳歌记负反馈、听完记正反馈，存 folium.storage。
// 兜底：生成失败时改播场景的 fallbackPlaylist（现有同名歌单）。

/** @typedef {import('../folium').FoliumClientApi} Folium */

const SCENES = [
    { id: 'work-morning', label: '工作·上午' },
    { id: 'work-afternoon', label: '工作·下午' },
    { id: 'work-evening', label: '工作·晚上' },
    { id: 'driving', label: '驾车' },
    { id: 'reading', label: '读书' },
];

/** @param {Folium} folium */
export default function activate(folium) {
    for (const scene of SCENES) {
        folium.registries.commands.register({
            id: `play-${scene.id}`,
            label: `AI 电台：${scene.label}`,
            description: '按口味画像为这个场景现生成一批歌并自动播放（骨架版：生成逻辑待接入）',
            keywords: ['AI', '电台', '场景', 'scene', 'radio', scene.label],
            run: async () => {
                const message = `AI 场景电台「${scene.label}」：骨架已就位，生成逻辑待接入。`;
                try {
                    await folium.ui.toast(message);
                } catch {
                    // toast 不可用时静默，命令结果里同样返回这句
                }
                return { message };
            },
        });
    }
    console.log('[ai-scene-radio] activated: 5 scene commands registered (skeleton v0.1)');
}
