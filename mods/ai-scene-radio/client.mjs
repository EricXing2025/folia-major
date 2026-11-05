// mods/ai-scene-radio/client.mjs
// AI 场景电台：选场景即自动播放符合 Eric 口味的歌，v2 桥按能力增量接入。
// 设计简报：qqmusic-archive/Folia-AI场景电台-设计简报.md（Muse 侧档案）
//
// 主流程（radio.mjs 实现，这里只接线）：
//   1. 场景命令 → 组装提示词（口味画像+场景参数+已播避重+跳歌负反馈）；
//   2. folium.net.fetch 调 LLM（trendxai 网关，OpenAI 兼容；密钥走 folium.secrets；
//      网关在 Cloudflare 后，必须带浏览器 UA）；
//   3. folium.omni 逐首搜索核验：确切版本、可播、去重与避重；
//   4. folium.playback.replaceQueue 整队送播并开播；队列剩 ≤3 首自动续单，续单失败升级一次整队；
//   5. 每秒采样播放位置：songChanged 时 <30 秒切走记负反馈、听完记正反馈，存 folium.storage。
// 兜底（生成失败/无 key/核验为空）：有 bridge 时从已记录歌单尝试，之后沿用 v1 快照 → 歌手 → 手动提示；
// 歌单与快照属「重播同一批」，自上次成功生成起最多复活一次，用尽弹错误 toast；失败尝试落盘 diag。

import { createRadio, SECRET_KEY, DEFAULT_GATEWAY, DEFAULT_MODEL, STORAGE_KEY } from './radio.mjs';
import { createScenePlaylistSync } from './sceneBridge.mjs';

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
            ...(typeof folium.audioFx === 'object'
                ? [{ key: 'linkAudioFx', type: 'boolean', label: { 'zh-CN': '联动音效', en: 'Link audio effects' }, defaultValue: true }]
                : []),
            ...(typeof folium.library === 'object'
                ? [{ key: 'savePlaylists', type: 'boolean', label: { 'zh-CN': '保存歌单', en: 'Save scene playlists' }, defaultValue: true }]
                : []),
        ],
    });

    const playlistSync = typeof folium.library === 'object'
        ? createScenePlaylistSync({
            library: folium.library, storage: folium.storage, log: folium.log,
            activeSource: () => folium.omni.listProviders().find(provider => provider.selected)?.providerId,
            accountKey: () => folium.account?.getState('qq')?.accountKey,
            onSaved: () => refreshRadioCovers(),
        })
        : null;
    const radio = createRadio({
        // 批次落地后刷新卡片封面：无场景歌单封面时，二档显示该批次首曲封面。
        onBatchStored: () => refreshRadioCovers(),
        fetch: (url, init) => folium.net.fetch(url, init),
        omni: folium.omni,
        playback: folium.playback,
        storage: folium.storage,
        secrets: folium.secrets,
        settings: () => /** @type {{gatewayBase?: string, model?: string}} */ (section.settings.get()),
        audioFx: typeof folium.audioFx === 'object' ? folium.audioFx : null,
        playlistSync,
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

    // Scene playlist covers become card art once playlists exist; refresh picks up what a save made.
    let sceneCovers = {};
    const registerRadioCards = () => {
        try {
            folium.radio.registerEntries(radio.scenes().map(scene => ({
                id: scene.id, title: scene.label, subtitle: `AI 电台 · ${scene.label}`,
                imageUrl: sceneCovers[scene.id],
            })));
        } catch (error) {
            folium.log.warn('[ai-scene-radio] radio cards unavailable', error);
        }
    };
    const refreshRadioCovers = () => {
        if (folium.env?.context !== 'main' || typeof folium.radio !== 'object') return;
        void (async () => {
            // 封面优先级（F8b）：场景歌单封面 > 最近批次首曲封面 > 无图。
            // 二档先取 batchCovers（rememberBatch 记的最近批首曲封面）；旧存档没有这个字段，
            // 退回批次镜像首条的 c（累积镜像下是最旧留存首曲，兜底可用）；都没有就跳过该档。
            const found = playlistSync ? await playlistSync.covers(radio.scenes()).catch(() => ({})) : {};
            const saved = await folium.storage.get(STORAGE_KEY).catch(() => null);
            const batches = saved && typeof saved === 'object' && saved.batches && typeof saved.batches === 'object'
                ? saved.batches
                : {};
            const batchCovers = saved && typeof saved === 'object' && saved.batchCovers && typeof saved.batchCovers === 'object'
                ? saved.batchCovers
                : {};
            for (const scene of radio.scenes()) {
                if (found[scene.id]) continue;
                const recent = batchCovers[scene.id];
                const first = Array.isArray(batches[scene.id]) ? batches[scene.id][0] : null;
                const cover = (typeof recent === 'string' && recent) || (first && typeof first.c === 'string' && first.c) || null;
                if (cover) found[scene.id] = cover;
            }
            sceneCovers = found;
            registerRadioCards();
        })().catch(() => {});
    };

    if (folium.env?.context === 'main' && typeof folium.radio === 'object') {
        registerRadioCards();
        try {
            folium.radio.onStartRequest(id => { void radio.runScene(id); });
        } catch (error) {
            folium.log.warn('[ai-scene-radio] radio start hook unavailable', error);
        }
        refreshRadioCovers();
    }

    // 仅在 linkAudioFx 由开到关的瞬间清音效；别的设置改动不该反复 clear。
    let lastLinkAudioFx = section.settings.get().linkAudioFx;
    section.settings.onChange(() => {
        const current = section.settings.get().linkAudioFx;
        if (current === false && lastLinkAudioFx !== false) radio.clearAudioProfile();
        lastLinkAudioFx = current;
    });

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
                        : `「${scene.label}」生成失败`;
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
        // 停用→启用或重启后：队列主体若还是某场景已存批次，恢复自动续单。
        void radio.restore();
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
