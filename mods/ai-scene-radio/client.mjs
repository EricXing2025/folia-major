// mods/ai-scene-radio/client.mjs
// AI 场景电台 v1：选场景即自动播放符合 Eric 口味的歌。
// 设计简报：qqmusic-archive/Folia-AI场景电台-设计简报.md（Muse 侧档案）
//
// 主流程（radio.mjs 实现，这里只接线）：
//   1. 场景命令 → 组装提示词（口味画像+场景参数+已播避重+跳歌负反馈）；
//   2. folium.net.fetch 调 LLM（trendxai 网关，OpenAI 兼容；密钥走 folium.secrets；
//      网关在 Cloudflare 后，必须带浏览器 UA）；
//   3. folium.omni 逐首搜索核验：确切版本、可播、整簇排除、去重与避重；
//   4. folium.playback.replaceQueue 整队送播并开播；队列剩 ≤3 首自动续单；
//   5. 每秒采样播放位置：songChanged 时 <30 秒切走记负反馈、听完记正反馈，存 folium.storage。
// 兜底（生成失败/无 key/核验为空）：上次核验批次快照 → 核心歌手降级 → 提示手动播同名歌单。
//   说明：Folium 没有歌单读取 API（omni 不读用户库，platform.raw 只有 netease），
//   「播现有同名歌单」只能做到快照+降级+指引的等价链，详见 README。

import { createRadio, SECRET_KEY, DEFAULT_GATEWAY, DEFAULT_MODEL } from './radio.mjs';

/** @typedef {import('../folium').FoliumClientApi} Folium */

/** @param {Folium} folium */
export default function activate(folium) {
    // omni / secrets / replaceQueue 都是 Folium 1.7 才有的；旧宿主直接报不可用。
    if (!folium.host || (folium.host.folium.major === 1 && folium.host.folium.minor < 7) || !folium.omni) {
        folium.log.warn('[ai-scene-radio] 需要 Folium 1.7+（omni / secrets / replaceQueue），当前宿主不支持，模组未启动');
        return;
    }

    const section = folium.registries.settingsSections.register({
        id: 'gateway',
        label: { 'zh-CN': 'AI 网关', en: 'AI gateway' },
        description: {
            'zh-CN': 'LLM 走 OpenAI 兼容网关。API Key 存系统钥匙串（secret），不进设置文件、不进导出。',
            en: 'OpenAI-compatible LLM gateway. The API key is a secret: kept by the OS credential store, never in the settings file or exports.',
        },
        settings: [
            {
                key: 'gatewayBase',
                type: 'text',
                label: { 'zh-CN': '网关地址', en: 'Gateway base URL' },
                description: { 'zh-CN': 'OpenAI 兼容端点的 /v1 根。', en: 'Root of the OpenAI-compatible endpoint, ending in /v1.' },
                defaultValue: DEFAULT_GATEWAY,
                placeholder: 'https://trendxai.io/v1',
            },
            {
                key: 'model',
                type: 'text',
                label: { 'zh-CN': '模型', en: 'Model' },
                defaultValue: DEFAULT_MODEL,
                placeholder: DEFAULT_MODEL,
            },
            {
                key: SECRET_KEY,
                type: 'secret',
                label: { 'zh-CN': 'API Key', en: 'API key' },
                description: { 'zh-CN': 'trendxai 网关的密钥。只显示「已设置/未设置」，不回显。', en: 'Key for the trendxai gateway. Shown only as set/unset, never echoed.' },
                placeholder: 'sk-…',
            },
        ],
    });

    const radio = createRadio({
        fetch: (url, init) => folium.net.fetch(url, init),
        omni: folium.omni,
        playback: folium.playback,
        storage: folium.storage,
        secrets: folium.secrets,
        settings: () => /** @type {{gatewayBase?: string, model?: string}} */ (section.settings.get()),
        log: folium.log,
        toast: (message, options) => folium.ui.toast(message, options),
    });

    const SCENE_EN = {
        'work-morning': 'Work · morning',
        'work-afternoon': 'Work · afternoon',
        'work-evening': 'Work · evening',
        driving: 'Driving',
        reading: 'Reading',
    };

    for (const scene of radio.scenes()) {
        folium.registries.commands.register({
            id: `play-${scene.id}`,
            label: { 'zh-CN': `AI 电台：${scene.label}`, en: `AI radio: ${SCENE_EN[scene.id] ?? scene.label}` },
            description: {
                'zh-CN': '按口味画像为这个场景现生成一批歌，逐首核验后整队送播',
                en: 'Generate a fresh batch for this scene from the taste profile, verify each song, then replace the queue and play',
            },
            keywords: ['AI', '电台', '场景', 'scene', 'radio', scene.label],
            run: async () => {
                const result = await radio.runScene(scene.id);
                const message = result === 'ok'
                    ? `「${scene.label}」电台已开播`
                    : result === 'busy'
                        ? '电台正在生成中，稍候再点'
                        : `「${scene.label}」生成失败，已走兜底`;
                return { message };
            },
        });
    }

    folium.registries.commands.register({
        id: 'stop-radio',
        label: { 'zh-CN': 'AI 电台：停止续播', en: 'AI radio: stop' },
        description: { 'zh-CN': '电台队列继续放完，但不再自动续单', en: 'Let the queued songs play out; stop auto-continuing' },
        keywords: ['AI', '电台', '停止', 'stop', 'radio'],
        run: () => {
            radio.stop();
            folium.ui.toast('AI 电台已停止续播', { type: 'info' });
            return { message: 'AI 电台已停止续播' };
        },
    });

    // 事件与定时器只在主上下文挂：export 窗口里宿主本就不派发，挂上只会空转。
    if (folium.env?.context === 'main') {
        folium.events.on('playback.queueChanged', () => {
            void radio.onQueueChanged();
        });
        folium.events.on('playback.songChanged', ({ song }) => {
            void radio.onSongChanged(song);
        });
        // 模组启动时正在播的歌也接管过来，第一首的反馈不丢。
        try {
            const current = folium.playback.getState()?.song;
            if (current) void radio.onSongChanged(current);
        } catch {
            /* 拿不到就等第一条 songChanged */
        }
        // 每秒采样一次播放位置，songChanged 时据此判「切走 / 听完」。
        folium.every(1000, () => {
            try {
                radio.samplePosition(folium.playback.getState());
            } catch {
                /* getState 在过渡态可能拿不到，下一拍再采 */
            }
        });
    }

    // 模组停用后：在途生成读到 disposed 直接收手，不再 replaceQueue / toast。
    folium.onDispose(() => radio.dispose());

    folium.log.info('[ai-scene-radio] activated: 5 scene commands + stop + feedback listeners');
}
