// mods/ai-scene-radio/tests/run.mjs
// AI 场景电台纯逻辑单测：node mods/ai-scene-radio/tests/run.mjs
// 不连真网关、不依赖 folium——全部经 fake 端口注入（fetch/omni/playback/storage/secrets）。

import assert from 'node:assert/strict';
import {
    buildPrompt,
    dedupeCandidates,
    parseCandidates,
    pickMatch,
    titleScore,
    artistScore,
    classifyListen,
    shouldContinue,
    createRadio,
    STORAGE_KEY,
    DIAG_STORAGE_KEY,
    DEFAULT_GATEWAY,
    DEFAULT_MODEL,
} from '../radio.mjs';
import { SCENES } from '../configData.mjs';
import activate from '../client.mjs';
import { createScenePlaylistSync, PLAYLIST_IDS_KEY, playlistTitle, SCENE_PROFILES } from '../sceneBridge.mjs';

let passed = 0;
const test = (name, fn) => {
    try {
        const result = fn();
        if (result instanceof Promise) {
            return result.then(() => {
                passed += 1;
                console.log(`  ok ${name}`);
            }).catch((error) => {
                console.error(`FAIL ${name}`);
                console.error(error);
                process.exitCode = 1;
            });
        }
        passed += 1;
        console.log(`  ok ${name}`);
    } catch (error) {
        console.error(`FAIL ${name}`);
        console.error(error);
        process.exitCode = 1;
    }
};

// ---------------------------------------------------------------- fakes

const song = (id, title, artist, extra = {}) => ({
    id: String(id),
    title,
    artist,
    album: extra.album ?? '专辑',
    source: extra.source ?? 'qq',
    ref: `ref-${id}`,
});

const fakeStorage = () => {
    const map = new Map();
    return {
        _map: map,
        get: async (key) => map.get(key),
        set: async (key, value) => void map.set(key, value),
        has: async (key) => map.has(key),
        delete: async (key) => void map.delete(key),
        keys: async () => [...map.keys()],
    };
};

const fakeSecrets = (value) => ({
    get: async () => value,
    has: async () => value != null,
    set: async () => {},
    subscribe: () => () => {},
});

const fakePlayback = ({ items = [], currentIndex = -1, kind = 'queue' } = {}) => {
    let version = 1;
    let songs = items.slice();
    let index = currentIndex;
    const calls = { replace: [], playItem: [] };
    const api = {
        _calls: calls,
        _songs: () => songs,
        _setIndex: (i) => { index = i; },
        _refusals: [], // 提前排队的一次性拒绝原因，FIFO
        getQueue: (options) => {
            const offset = options?.offset ?? 0;
            const limit = options?.limit ?? 500;
            return {
                items: songs.slice(offset, offset + limit).map((s, i) => ({ song: s, index: offset + i })),
                length: songs.length,
                currentIndex: index,
                kind,
                version: `v${version}`,
            };
        },
        getState: () => ({ song: songs[index] ?? null, state: 'playing', position: 0, duration: 200, liked: false, canLike: false }),
        replaceQueue: async (list, { expectedVersion }) => {
            calls.replace.push({ count: list.length, expectedVersion, titles: list.map((s) => s.title) });
            const injected = api._refusals.shift();
            if (injected) {
                return { status: 'refused', reason: injected, version: `v${version}`, index: null, retryAfterMs: null };
            }
            if (expectedVersion !== `v${version}`) {
                return { status: 'refused', reason: 'stale-version', version: `v${version}`, index: null, retryAfterMs: null };
            }
            songs = list.slice();
            version += 1;
            return { status: 'replaced', version: `v${version}`, length: songs.length, currentIndex: index >= 0 ? 0 : -1 };
        },
        playQueueItem: async (i) => {
            calls.playItem.push(i);
            index = i;
            return true;
        },
    };
    return api;
};

const fakeOmni = ({ search, resolve, describe } = {}) => ({
    searchSongs: async (query, options) => (
        search ? search(query, options) : { items: [], nextCursor: null, total: 0 }
    ),
    resolveSongs: async (keys) => keys.map((key) => (resolve ? resolve(key) : { status: 'not-found' })),
    describeSong: (s) => (describe ? describe(s) : { availability: 'playable', durationMs: 200000, coverUrl: null, pageUrl: null }),
});

const llmResponse = (candidates) => ({
    ok: true,
    status: 200,
    statusText: 'OK',
    headers: {},
    text: () => '',
    json: () => ({ choices: [{ message: { content: JSON.stringify(candidates) } }] }),
});

// 每次调用依次返回 list 里的响应（最后一个用完复读），供续单等多轮生成。
const seqFetch = (list) => {
    let i = 0;
    return async () => list[Math.min(i++, list.length - 1)]();
};

const makeDeps = (over = {}) => {
    const record = { toasts: [], warns: [], infos: [], fetches: [] };
    const fetchImpl = over.fetch || (async () => llmResponse([]));
    const deps = {
        fetch: async (url, init) => {
            record.fetches.push({ url, init });
            return fetchImpl(url, init);
        },
        omni: over.omni || fakeOmni(),
        playback: over.playback || fakePlayback(),
        storage: over.storage || fakeStorage(),
        secrets: over.secrets || fakeSecrets('sk-test'),
        settings: over.settings || (() => ({ gatewayBase: DEFAULT_GATEWAY, model: DEFAULT_MODEL })),
        log: {
            info: (m) => record.infos.push(m),
            warn: (m) => record.warns.push(m),
            error: (m) => record.warns.push(m),
        },
        toast: (message, opts) => record.toasts.push({ message, type: opts?.type }),
        sleep: async () => {},
    };
    return { deps, record };
};

// ---------------------------------------------------------------- 纯函数

console.log('pure helpers');

test('parseCandidates: 裸 JSON 数组', () => {
    const out = parseCandidates('[{"title":"红豆","artist":"王菲"}]');
    assert.deepEqual(out, [{ title: '红豆', artist: '王菲' }]);
});

test('parseCandidates: ```json 围栏 + 前后散文', () => {
    const text = '好的，这是歌单：\n```json\n[{"title":"阴天","artist":"莫文蔚"},{"title":"遇见","artist":"孙燕姿"}]\n```\n希望喜欢。';
    assert.equal(parseCandidates(text).length, 2);
});

test('parseCandidates: 尾逗号容错', () => {
    assert.equal(parseCandidates('[{"title":"红豆","artist":"王菲",},]').length, 1);
});

test('parseCandidates: 坏输入返回空', () => {
    assert.deepEqual(parseCandidates('not json at all'), []);
    assert.deepEqual(parseCandidates('{"a":1}'), []);
    assert.deepEqual(parseCandidates(undefined), []);
    assert.deepEqual(parseCandidates('[{"title":"无歌手"}]'), []);
});

test('dedupeCandidates: 大小写/空白不敏感去重', () => {
    const out = dedupeCandidates([
        { title: '红豆', artist: '王菲' },
        { title: ' 红豆 ', artist: '王菲 ' },
        { title: '红豆', artist: '张悬' },
    ]);
    assert.equal(out.length, 2);
});

test('buildPrompt: 画像 + 场景 + 避重 + 负反馈', () => {
    const scene = SCENES.find((s) => s.id === 'work-morning');
    const history = [
        { t: '红豆', a: '王菲', v: 'pos' },
        { t: '讨厌歌', a: '某人', v: 'neg' },
        { t: '听过歌', a: '另一人', v: 'heard' },
    ];
    const { system, user, count } = buildPrompt({ scene, history });
    assert.ok(count > scene.batchSize);
    assert.ok(user.includes(scene.label));
    assert.ok(user.includes(scene.energyCurve));
    assert.ok(user.includes('王菲') && user.includes('林忆莲'));
    assert.ok(user.includes('讨厌歌'));   // 负反馈入提示词
    assert.ok(user.includes('听过歌'));   // 已播避重入提示词
    assert.ok(!user.includes('永不出现')); // F9：排除名单不进提示词
    assert.ok(!user.includes('任然'));    // F9：名单内歌手不再被点名屏蔽
    assert.ok(system.length > 0);
});

test('titleScore/artistScore: 确切版本分级', () => {
    assert.equal(titleScore('红豆', '红豆'), 3);
    assert.equal(titleScore('红豆', '红豆 (Live)'), 2);
    assert.equal(titleScore('活埋', '活埋（2026女生新版）'), 2); // 全角括号同样剥
    assert.equal(titleScore('红豆 (Live)', '红豆'), 1);
    assert.equal(titleScore('红豆', '绿豆'), 0);
    assert.equal(artistScore('王菲', '王菲'), 2);
    assert.equal(artistScore('王菲', '王菲/那英'), 2); // 候选歌手全在结果里
    assert.equal(artistScore('王菲/那英', '那英'), 1); // 只对了合唱里的一位
    assert.equal(artistScore('王菲', '张悬'), 0);
});

test('pickMatch: 全等优先、翻唱拒、下架剔除', () => {
    const items = [
        song(1, '红豆', '张悬'),           // 翻唱：artist 不交集
        song(2, '红豆 (Live)', '王菲'),
        song(3, '红豆', '王菲'),            // 确切版本
        song(4, '红豆', '王菲'),
    ];
    const describe = (s) => ({ availability: s.id === '4' ? 'taken-down' : 'playable' });
    const picked = pickMatch({ title: '红豆', artist: '王菲' }, items, describe);
    assert.equal(picked.id, '3');
    assert.equal(pickMatch({ title: '红豆', artist: '王菲' }, [items[0]], describe), null);
    assert.equal(pickMatch({ title: '红豆', artist: '王菲' }, [items[3]], describe), null);
});

test('classifyListen: <30s 负反馈 / 听完正反馈 / 中途 heard', () => {
    assert.equal(classifyListen(12, 200), 'neg');
    assert.equal(classifyListen(190, 200), 'pos');
    assert.equal(classifyListen(27, 28), 'pos'); // 短歌播完是 pos 不是 neg
    assert.equal(classifyListen(120, 200), 'heard');
    assert.equal(classifyListen(0, 0), 'neg');
});

test('shouldContinue: 队列尾部 ≤3 才续', () => {
    assert.equal(shouldContinue({ kind: 'queue', length: 15, currentIndex: 11 }), true);
    assert.equal(shouldContinue({ kind: 'queue', length: 15, currentIndex: 5 }), false);
    assert.equal(shouldContinue({ kind: 'queue', length: 15, currentIndex: -1 }), false);
    assert.equal(shouldContinue({ kind: 'fm', length: 15, currentIndex: 11 }), false);
});

// ---------------------------------------------------------------- 引擎

console.log('engine');

const makeOmniFor = (table, fallback) => fakeOmni({
    search: (query) => {
        for (const [needle, items] of Object.entries(table)) {
            if (query.includes(needle)) return { items, nextCursor: null, total: items.length };
        }
        return fallback ? fallback(query) : { items: [], nextCursor: null, total: 0 };
    },
    resolve: () => ({ status: 'not-found' }),
});

test('全链：LLM→核验→replaceQueue→playQueueItem→批次入库且不含 ref', async () => {
    const playback = fakePlayback();
    const storage = fakeStorage();
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
        活埋: [song(4, '活埋 (2026女生新版)', '竹子ZZ')],
    });
    const { deps, record } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
            { title: '活埋 (2026女生新版)', artist: '竹子ZZ' }, // F9：名单内歌手照常可选
            { title: '不存在的歌', artist: '无名氏' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    const ok = await radio.runScene('work-morning');
    assert.equal(ok, 'ok');
    assert.equal(playback._calls.replace.length, 1);
    assert.deepEqual(playback._calls.replace[0].titles, ['红豆', '阴天', '遇见', '活埋 (2026女生新版)']);
    assert.equal(playback._calls.playItem[0], 0);
    const saved = storage._map.get(STORAGE_KEY);
    assert.ok(saved.batches['work-morning'].length === 4);
    assert.equal(JSON.stringify(saved).includes('"ref"'), false, 'storage 不得含 ref');
    // LLM 请求带 UA 与 Authorization
    assert.equal(record.fetches.length, 1);
    const init = record.fetches[0].init;
    assert.ok(init.headers['User-Agent'].startsWith('Mozilla/5.0'));
    assert.equal(init.headers.Authorization, 'Bearer sk-test');
    assert.equal(record.fetches[0].url, `${DEFAULT_GATEWAY}/chat/completions`);
});

test('失败链：LLM 拒→有快照→resolveSongs 复活送播', async () => {
    const playback = fakePlayback();
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { 'work-morning': [{ s: 'qq', i: '99', t: '红豆', a: '王菲' }, { s: 'qq', i: '98', t: '阴天', a: '莫文蔚' }, { s: 'qq', i: '97', t: '遇见', a: '孙燕姿' }] },
    });
    const omni = fakeOmni({
        resolve: (key) => ({ status: 'found', song: song(key.id, { 99: '红豆', 98: '阴天', 97: '遇见' }[key.id], { 99: '王菲', 98: '莫文蔚', 97: '孙燕姿' }[key.id]) }),
        search: () => ({ items: [], nextCursor: null, total: 0 }),
    });
    const { deps } = makeDeps({
        fetch: async () => { throw new Error('gateway down'); },
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    const ok = await radio.runScene('work-morning');
    assert.equal(ok, 'ok');
    assert.equal(playback._calls.replace.length, 1);
    assert.equal(playback._calls.replace[0].count, 3);
    assert.equal(playback._calls.playItem[0], 0);
});

test('失败链：累积镜像超 50 条时快照腿只重播最近一批（复审 M1）', async () => {
    const playback = fakePlayback();
    const storage = fakeStorage();
    // F11 后镜像是多批累积、上限 60：整镜送 resolveSongs 会破单次 50-key 契约（该腿直接抛废），
    // 且回放的是整场而非「上一批」。修正为取镜像末尾 batchSize 条。
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { 'work-morning': Array.from({ length: 60 }, (_, i) => ({ s: 'qq', i: `${i + 1}`, t: `歌${i + 1}`, a: '歌手' })) },
    });
    const seen = [];
    const omni = fakeOmni({
        resolve: (key) => { seen.push(key.id); return { status: 'found', song: song(Number(key.id), `歌${key.id}`, '歌手') }; },
        search: () => ({ items: [], nextCursor: null, total: 0 }),
    });
    const { deps } = makeDeps({
        fetch: async () => { throw new Error('gateway down'); },
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    const ok = await radio.runScene('work-morning');
    assert.equal(ok, 'ok');
    assert.deepEqual(seen, Array.from({ length: 15 }, (_, i) => `${46 + i}`), '只解析镜像末尾一批 15 首');
    assert.equal(playback._calls.replace[0].count, 15);
});

test('失败链：无快照→核心歌手降级送播', async () => {
    const playback = fakePlayback();
    const omni = fakeOmni({
        search: (query) => {
            if (query === '王菲') return { items: [song(1, '红豆', '王菲'), song(2, '笑忘书', '王菲')], nextCursor: null, total: 2 };
            if (query === '林忆莲') return { items: [song(3, '至少还有你', '林忆莲')], nextCursor: null, total: 1 };
            return { items: [], nextCursor: null, total: 0 };
        },
        resolve: () => ({ status: 'not-found' }),
    });
    const { deps, record } = makeDeps({
        fetch: async () => { throw new Error('gateway down'); },
        omni, playback,
    });
    const radio = createRadio(deps);
    const ok = await radio.runScene('work-morning');
    assert.equal(ok, 'ok');
    assert.equal(playback._calls.replace[0].count, 3);
    assert.ok(record.toasts.some((t) => t.message.includes('核心歌手')));
});

test('失败链：全空→toast 指向同名歌单', async () => {
    const playback = fakePlayback();
    const omni = fakeOmni({ search: () => ({ items: [], nextCursor: null, total: 0 }), resolve: () => ({ status: 'not-found' }) });
    const { deps, record } = makeDeps({
        fetch: async () => { throw new Error('gateway down'); },
        omni, playback,
    });
    const radio = createRadio(deps);
    const ok = await radio.runScene('work-morning');
    assert.equal(ok, 'fail');
    const last = record.toasts[record.toasts.length - 1];
    assert.ok(last.message.includes('工作·上午'), `toast 应含同名歌单名: ${last.message}`);
    assert.equal(last.type, 'error');
});

test('无 API key → 直接走兜底，不发 LLM 请求', async () => {
    const playback = fakePlayback();
    const { deps, record } = makeDeps({
        secrets: fakeSecrets(null),
        omni: fakeOmni({ search: () => ({ items: [], nextCursor: null, total: 0 }) }),
        playback,
    });
    const radio = createRadio(deps);
    await radio.runScene('work-morning');
    assert.equal(record.fetches.length, 0);
    assert.ok(record.toasts.some((t) => t.message.includes('API Key')));
});

test('续单：剩 ≤3 触发，旧歌保留在前、新歌接尾', async () => {
    const playback = fakePlayback();
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
        笑忘书: [song(4, '笑忘书', '王菲')],
        至少还有你: [song(5, '至少还有你', '林忆莲')],
        爱情: [song(6, '爱情', '莫文蔚')],
    });
    const { deps } = makeDeps({
        fetch: seqFetch([
            async () => llmResponse([
                { title: '红豆', artist: '王菲' },
                { title: '阴天', artist: '莫文蔚' },
                { title: '遇见', artist: '孙燕姿' },
            ]),
            async () => llmResponse([
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]),
        ]),
        omni, playback,
    });
    const radio = createRadio(deps);
    // 先正常开播一批（3 首），queuedKeys 入库
    await radio.runScene('driving');
    assert.equal(playback._calls.replace.length, 1);
    assert.deepEqual(playback._calls.replace[0].titles, ['红豆', '阴天', '遇见']);
    // 当前 3 首队列、currentIndex 0 → 剩 2 ≤3，触发续单
    playback._setIndex(0);
    radio._state.lastGenAt = 0; // 冷却只防真机重入，测试直通
    await radio.onQueueChanged();
    assert.equal(playback._calls.replace.length, 2);
    const cont = playback._calls.replace[1];
    assert.deepEqual(cont.titles.slice(0, 3), ['红豆', '阴天', '遇见']);
    assert.deepEqual(cont.titles.slice(3), ['笑忘书', '至少还有你', '爱情']);
});

test('续单：队列里电台的歌全没了 → 停用不再生成', async () => {
    const playback = fakePlayback();
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
    });
    const { deps, record } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
        ]),
        omni, playback,
    });
    const radio = createRadio(deps);
    await radio.runScene('driving');
    // 用户把队列整个换掉（不含电台歌）
    playback._songs().splice(0, playback._songs().length, song(9, '别人的歌', '某人'));
    radio._state.lastGenAt = 0;
    await radio.onQueueChanged();
    assert.equal(radio._state.activeSceneId, null);
    assert.equal(record.fetches.length, 1, '停用后不应再发 LLM 请求');
});

test('反馈：上一首 <30s 切走记 neg、听完记 pos、入 storage', async () => {
    const playback = fakePlayback({ items: [song(1, '红豆', '王菲')], currentIndex: 0 });
    const storage = fakeStorage();
    const { deps } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    // 歌 A 开播
    await radio.onSongChanged(song(1, '红豆', '王菲'));
    // 放到 12s 切走 → neg
    radio.samplePosition({ position: 12, duration: 200 });
    await radio.onSongChanged(song(2, '阴天', '莫文蔚'));
    // 第二首放到 190/200 切走 → pos
    radio.samplePosition({ position: 190, duration: 200 });
    await radio.onSongChanged(song(3, '遇见', '孙燕姿'));
    const saved = storage._map.get(STORAGE_KEY);
    assert.equal(saved.history.length, 2);
    assert.equal(saved.history[0].v, 'neg');
    assert.equal(saved.history[1].v, 'pos');
    assert.equal(JSON.stringify(saved).includes('"ref"'), false);
});

test('已播避重：history 里的歌不再进候选核验结果', async () => {
    const playback = fakePlayback();
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [{ t: '红豆', a: '王菲', v: 'pos', sc: 'work-morning', at: 1 }],
        batches: {},
    });
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
        爱情: [song(4, '爱情', '莫文蔚')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },   // 已播 → 被避重
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
            { title: '爱情', artist: '莫文蔚' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    await radio.runScene('work-morning');
    assert.deepEqual(playback._calls.replace[0].titles, ['阴天', '遇见', '爱情']);
});

test('瞬态拒绝：transition 等待重试后成功，不走兜底', async () => {
    const playback = fakePlayback();
    playback._refusals.push('transition', 'stage');
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
        ]),
        omni, playback,
    });
    const radio = createRadio(deps);
    const result = await radio.runScene('work-morning');
    assert.equal(result, 'ok');
    assert.equal(playback._calls.replace.length, 3); // 两次拒绝 + 一次成功
    assert.deepEqual(playback._songs().map((s) => s.title), ['红豆', '阴天', '遇见']);
    assert.equal(radio._state.activeSceneId, 'work-morning');
});

test('生成中再点同场景 → busy，不重入', async () => {
    const playback = fakePlayback();
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
    });
    let release;
    const gate = new Promise((r) => { release = r; });
    const { deps } = makeDeps({
        fetch: async () => { await gate; return llmResponse([{ title: '红豆', artist: '王菲' }]); },
        omni, playback,
    });
    const radio = createRadio(deps);
    const first = radio.runScene('work-morning');
    const second = await radio.runScene('work-morning');
    assert.equal(second, 'busy');
    release();
    await first;
});

test('全失败 → activeSceneId 回滚，不残留未开播场景', async () => {
    const playback = fakePlayback();
    const { deps } = makeDeps({
        fetch: async () => { throw new Error('down'); },
        omni: fakeOmni({ search: () => ({ items: [], nextCursor: null, total: 0 }) }),
        playback,
    });
    const radio = createRadio(deps);
    const result = await radio.runScene('work-morning');
    assert.equal(result, 'fail');
    assert.equal(radio._state.activeSceneId, null);
});

test('续单：>500 长队列分页读全，旧歌不丢尾', async () => {
    const old = Array.from({ length: 600 }, (_, i) => song(1000 + i, `旧歌${i}`, '某人'));
    old[0] = song(1, '红豆', '王菲'); // 让 overlap >0，电台歌在队里
    const playback = fakePlayback({ items: old, currentIndex: 598 }); // 剩 1 首 → 触发续单
    const omni = makeOmniFor({
        笑忘书: [song(4, '笑忘书', '王菲')],
        至少还有你: [song(5, '至少还有你', '林忆莲')],
        爱情: [song(6, '爱情', '莫文蔚')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '笑忘书', artist: '王菲' },
            { title: '至少还有你', artist: '林忆莲' },
            { title: '爱情', artist: '莫文蔚' },
        ]),
        omni, playback,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    radio._state.queuedKeys.add('id:qq:1'); // 假装红豆是本电台排进去的
    await radio.onQueueChanged();
    const cont = playback._calls.replace[0];
    assert.equal(cont.count, 603, '600 旧歌 + 3 新歌，长队列尾部不丢');
    assert.equal(cont.titles[0], '红豆');
    assert.deepEqual(cont.titles.slice(-3), ['笑忘书', '至少还有你', '爱情']);
});

test('五场景 profile 表：10 段与截止频率、动态和空间参数', () => {
    assert.deepEqual(Object.keys(SCENE_PROFILES).sort(), SCENES.map(scene => scene.id).sort());
    const expected = [
        [[0, 1, 0, 1, 3, 3, 2, 1, 1, 0], 60, 20000, 40, 90, 5],
        [[0, 1, 0, 1, 3, 3, 2, 1, 1, 0], 60, 20000, 40, 90, 5],
        [[0, 1, 0, 1, 3, 3, 2, 0, 0, -1], 60, 20000, 40, 90, 8],
        [[1, 3, 2, 1, 2, 2, 1, 1, 0, 0], 40, 20000, 30, 100, 0],
        [[0, 0, 0, 0, 1, 1, 0, 0, 0, 0], 30, 16000, 15, 80, 0],
    ];
    assert.deepEqual(SCENES.map(scene => {
        const p = SCENE_PROFILES[scene.id];
        return [p.bandsDb, p.lowCutHz, p.highCutHz, p.compressorPct, p.widthPct, p.reverbPct];
    }), expected);
});

test('音效仅在成功开播且设置开启时应用，队列接管、关闭设置及停用时撤回', async () => {
    const playback = fakePlayback();
    const effects = [];
    let enabled = true;
    const audioFx = {
        applyProfile: async profile => { effects.push(['apply', profile]); },
        clearProfile: async () => { effects.push(['clear']); },
    };
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' }, { title: '阴天', artist: '莫文蔚' }, { title: '遇见', artist: '孙燕姿' },
        ]),
        omni, playback,
        settings: () => ({ linkAudioFx: enabled }),
    });
    const radio = createRadio({ ...deps, audioFx });
    assert.equal(await radio.runScene('work-morning'), 'ok');
    assert.deepEqual(effects, [['apply', SCENE_PROFILES['work-morning']]]);
    const snapshot = playback.getQueue();
    await playback.replaceQueue([song(99, 'Other', 'Someone')], { expectedVersion: snapshot.version });
    await radio.onQueueChanged();
    assert.deepEqual(effects[1], ['clear']);
    radio.dispose();
    enabled = false;
    const disabled = createRadio({ ...deps, playback: fakePlayback(), audioFx });
    assert.equal(await disabled.runScene('work-afternoon'), 'ok');
    assert.equal(effects.filter(effect => effect[0] === 'apply').length, 1);
    disabled.dispose();
    assert.deepEqual(effects.at(-1), ['clear']);
});

test('歌单：仅 QQ 批次创建一个记录 ID 的专属歌单，后续替换同 ID', async () => {
    const scene = SCENES[0];
    const storage = fakeStorage();
    const calls = { create: [], replace: [] };
    const list = [];
    const library = {
        listPlaylists: async () => list,
        createPlaylist: async title => {
            calls.create.push(title);
            const created = { id: '123', title };
            list.push(created);
            return created;
        },
        replacePlaylistSongs: async (id, tracks) => calls.replace.push({ id, tracks }),
        getPlaylistTracks: async () => [],
    };
    const sync = createScenePlaylistSync({ library, storage, activeSource: () => 'qq', accountKey: () => 'account-A' });
    sync.save(scene, [song(1, '红豆', '王菲')]);
    await sync.settled();
    sync.save(scene, [song(2, '阴天', '莫文蔚')]);
    await sync.settled();
    assert.deepEqual(calls.create, [playlistTitle(scene)]);
    assert.deepEqual(storage._map.get(PLAYLIST_IDS_KEY), { 'account-A': { [scene.id]: '123' } });
    assert.deepEqual(calls.replace, [
        { id: '123', tracks: [{ source: 'qq', id: '1' }] },
        { id: '123', tracks: [{ source: 'qq', id: '2' }] },
    ]);
});

test('歌单：有记录 ID 但标题不符或 ID 消失，绝不按同名用户歌单接管', async () => {
    const scene = SCENES[0];
    const storage = fakeStorage();
    storage._map.set(PLAYLIST_IDS_KEY, { 'account-A': { [scene.id]: 'missing' } });
    const writes = [];
    const library = {
        listPlaylists: async () => [{ id: 'someone-else', title: playlistTitle(scene) }, { id: 'missing', title: 'Personal' }],
        createPlaylist: async title => { writes.push(`create:${title}`); return { id: 'new', title }; },
        replacePlaylistSongs: async id => { writes.push(id); },
        getPlaylistTracks: async id => { writes.push(`read:${id}`); return []; },
    };
    const sync = createScenePlaylistSync({ library, storage, activeSource: () => 'qq', accountKey: () => 'account-A' });
    sync.save(scene, [song(1, '红豆', '王菲')]);
    await sync.settled();
    assert.deepEqual(await sync.tracks(scene), []);
    assert.deepEqual(writes, []);
});

test('歌单：非 QQ 来源、不支持 bridge 或写入失败只记日志，不阻塞送播', async () => {
    const storage = fakeStorage();
    const warns = [];
    const library = {
        listPlaylists: async () => [],
        createPlaylist: async () => { throw Object.assign(new Error('unsupported'), { code: 'NOT_SUPPORTED' }); },
    };
    const sync = createScenePlaylistSync({ library, storage, activeSource: () => 'qq', accountKey: () => 'account-A', log: { warn: (...args) => warns.push(args) } });
    sync.save(SCENES[0], [song(1, '红豆', '王菲', { source: 'netease' })]);
    await sync.settled();
    assert.equal(warns.length, 0);
    sync.save(SCENES[0], [song(1, '红豆', '王菲')]);
    await sync.settled();
    assert.equal(warns.length, 1);
    assert.equal(warns[0][1].code, 'NOT_SUPPORTED');
    assert.equal(storage._map.get(PLAYLIST_IDS_KEY)?.['account-A']?.[SCENES[0].id], undefined);
});

test('QQ 建单响应不明时保留预留标记，后续批次不再冒险重复创建', async () => {
    const scene = SCENES[0];
    const storage = fakeStorage();
    let creates = 0;
    const sync = createScenePlaylistSync({
        library: {
            listPlaylists: async () => [],
            createPlaylist: async () => { creates += 1; throw new Error('response unknown; playlist may exist'); },
            replacePlaylistSongs: async () => { assert.fail('must not replace an untracked playlist'); },
        },
        storage, activeSource: () => 'qq', accountKey: () => 'account-A',
    });
    sync.save(scene, [song(1, '红豆', '王菲')]);
    await sync.settled();
    sync.save(scene, [song(2, '阴天', '莫文蔚')]);
    await sync.settled();
    assert.equal(creates, 1);
    assert.deepEqual(storage._map.get(PLAYLIST_IDS_KEY), { 'account-A': { [scene.id]: 'pending' } });
});

test('建单成功但记录 ID 失败时，预留标记阻止后续建单和曲目写入', async () => {
    const scene = SCENES[0];
    const storage = fakeStorage();
    let writes = 0;
    const set = storage.set;
    storage.set = async (key, value) => {
        if (++writes === 2) throw new Error('storage full');
        return set(key, value);
    };
    let creates = 0;
    let replaces = 0;
    const sync = createScenePlaylistSync({
        library: {
            listPlaylists: async () => [],
            createPlaylist: async title => { creates += 1; return { id: '789', title }; },
            replacePlaylistSongs: async () => { replaces += 1; },
        },
        storage, activeSource: () => 'qq', accountKey: () => 'account-A',
    });
    sync.save(scene, [song(1, '红豆', '王菲')]);
    await sync.settled();
    sync.save(scene, [song(2, '阴天', '莫文蔚')]);
    await sync.settled();
    assert.equal(creates, 1);
    assert.equal(replaces, 0);
    assert.deepEqual(storage._map.get(PLAYLIST_IDS_KEY), { 'account-A': { [scene.id]: 'pending' } });
});

test('账户切换或停用后不再触碰另一个 QQ 账号的同 ID 歌单', async () => {
    const scene = SCENES[0];
    const storage = fakeStorage();
    storage._map.set(PLAYLIST_IDS_KEY, { 'account-A': { [scene.id]: 'owned-id' } });
    let account = 'account-B';
    const writes = [];
    const library = {
        listPlaylists: async () => [{ id: 'owned-id', title: playlistTitle(scene) }],
        createPlaylist: async title => { writes.push('create'); return { id: '456', title }; },
        replacePlaylistSongs: async id => { writes.push(`replace:${id}`); },
        getPlaylistTracks: async id => { writes.push(`read:${id}`); return []; },
    };
    const sync = createScenePlaylistSync({ library, storage, activeSource: () => 'qq', accountKey: () => account });
    assert.deepEqual(await sync.tracks(scene), []);
    sync.save(scene, [song(1, '红豆', '王菲')]);
    await sync.settled();
    assert.deepEqual(storage._map.get(PLAYLIST_IDS_KEY)['account-A'], { [scene.id]: 'owned-id' });
    assert.equal(writes[0], 'create');
    assert.equal(writes[1], 'replace:456');
    account = 'account-A';
    sync.dispose();
    sync.save(scene, [song(2, '阴天', '莫文蔚')]);
    await sync.settled();
    assert.deepEqual(writes, ['create', 'replace:456']);
});

test('歌单异步查找期间切换活跃音源，不在别的平台建单或污染 QQ 记录', async () => {
    const storage = fakeStorage();
    const scene = SCENES[0];
    let source = 'qq';
    let reads = 0;
    const get = storage.get;
    storage.get = async key => {
        const value = await get(key);
        if (++reads === 2) source = 'netease';
        return value;
    };
    const writes = [];
    const library = {
        listPlaylists: async () => [],
        createPlaylist: async () => { writes.push('create'); return { id: 'wrong', title: playlistTitle(scene) }; },
        replacePlaylistSongs: async () => { writes.push('replace'); },
    };
    const sync = createScenePlaylistSync({ library, storage, activeSource: () => source, accountKey: () => 'account-A' });
    sync.save(scene, [song(1, '红豆', '王菲')]);
    await sync.settled();
    assert.deepEqual(writes, []);
    assert.equal(storage._map.has(PLAYLIST_IDS_KEY), false);
});

test('建单请求在途切换音源或 QQ 账号，不记录跨账户 ID，也不写歌曲', async () => {
    const scene = SCENES[0];
    for (const changed of ['source', 'account']) {
        const storage = fakeStorage();
        let source = 'qq';
        let account = 'account-A';
        const writes = [];
        const sync = createScenePlaylistSync({
            storage, activeSource: () => source, accountKey: () => account,
            library: {
                listPlaylists: async () => [],
                createPlaylist: async title => {
                    if (changed === 'source') source = 'netease';
                    else account = 'account-B';
                    writes.push('create');
                    return { id: '789', title };
                },
                replacePlaylistSongs: async () => { writes.push('replace'); },
            },
        });
        sync.save(scene, [song(1, '红豆', '王菲')]);
        await sync.settled();
        assert.deepEqual(writes, ['create']);
        assert.deepEqual(storage._map.get(PLAYLIST_IDS_KEY), { 'account-A': { [scene.id]: 'pending' } });
    }
});

test('建单被拒回滚只收走自己的预留：在途期间别的实例写进台账的键原样保留', async () => {
    const scene = SCENES[0];
    const storage = fakeStorage();
    const sync = createScenePlaylistSync({
        library: {
            listPlaylists: async () => [],
            createPlaylist: async () => {
                // 另一个实例在请求在途期间写入的新台账：同一场景仍是 pending，另有别键。
                storage._map.set(PLAYLIST_IDS_KEY, {
                    'account-A': { [scene.id]: 'pending', 'work-evening': '777' },
                    'account-B': { 'x': '1' },
                });
                throw Object.assign(new Error('unsupported'), { code: 'NOT_SUPPORTED' });
            },
        },
        storage, activeSource: () => 'qq', accountKey: () => 'account-A',
    });
    sync.save(scene, [song(1, '红豆', '王菲')]);
    await sync.settled();
    assert.deepEqual(storage._map.get(PLAYLIST_IDS_KEY), {
        'account-A': { 'work-evening': '777' },
        'account-B': { 'x': '1' },
    });
});

test('建单被拒时台账里已不是 pending 就不动它（新实例已记真 ID）', async () => {
    const scene = SCENES[0];
    const storage = fakeStorage();
    const sync = createScenePlaylistSync({
        library: {
            listPlaylists: async () => [],
            createPlaylist: async () => {
                storage._map.set(PLAYLIST_IDS_KEY, { 'account-A': { [scene.id]: 'real-99' } });
                throw Object.assign(new Error('unsupported'), { code: 'NOT_SUPPORTED' });
            },
        },
        storage, activeSource: () => 'qq', accountKey: () => 'account-A',
    });
    sync.save(scene, [song(1, '红豆', '王菲')]);
    await sync.settled();
    assert.deepEqual(storage._map.get(PLAYLIST_IDS_KEY), { 'account-A': { [scene.id]: 'real-99' } });
});

test('模组已停用时建单被拒不回滚：pending 原样留给台账', async () => {
    const scene = SCENES[0];
    const storage = fakeStorage();
    const sync = createScenePlaylistSync({
        library: {
            listPlaylists: async () => [],
            createPlaylist: async () => {
                sync.dispose();
                throw Object.assign(new Error('unsupported'), { code: 'NOT_SUPPORTED' });
            },
        },
        storage, activeSource: () => 'qq', accountKey: () => 'account-A',
    });
    sync.save(scene, [song(1, '红豆', '王菲')]);
    await sync.settled();
    assert.deepEqual(storage._map.get(PLAYLIST_IDS_KEY), { 'account-A': { [scene.id]: 'pending' } });
});

test('歌单封面：台账命中的场景回 coverUrl，pending、他账号与无名条目不露头', async () => {
    const scene = SCENES[0];
    const storage = fakeStorage();
    storage._map.set(PLAYLIST_IDS_KEY, {
        'account-A': { [scene.id]: '123', 'work-evening': 'pending' },
        'account-B': { 'x': '999' },
    });
    const library = {
        listPlaylists: async () => [
            { id: '123', title: playlistTitle(scene), coverUrl: 'https://y.gtimg.cn/cover.jpg' },
            { id: '999', title: 'other', coverUrl: 'https://should-not-leak.example/x.jpg' },
        ],
    };
    const sync = createScenePlaylistSync({ library, storage, activeSource: () => 'qq', accountKey: () => 'account-A' });
    assert.deepEqual(await sync.covers(SCENES), { [scene.id]: 'https://y.gtimg.cn/cover.jpg' });
});

test('歌单 bridge 谓词同步拒绝时仅记日志，不会把开播后的队列重跑兜底', async () => {
    const playback = fakePlayback();
    const warns = [];
    const sync = createScenePlaylistSync({
        activeSource: () => 'qq',
        accountKey: () => { throw new Error('account-unavailable-in-export-context'); },
        storage: fakeStorage(),
        log: { warn: (...args) => warns.push(args) },
        library: { createPlaylist: async () => { assert.fail('unexpected playlist mutation'); } },
    });
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
    });
    const { deps, record } = makeDeps({
        omni, playback,
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' }, { title: '阴天', artist: '莫文蔚' }, { title: '遇见', artist: '孙燕姿' },
        ]),
    });
    const radio = createRadio({ ...deps, playlistSync: sync });
    assert.equal(await radio.runScene('work-morning'), 'ok');
    assert.equal(playback._calls.replace.length, 1);
    assert.equal(warns.length, 1);
    assert.ok(record.toasts.every(toast => !toast.message.includes('生成失败')));
});

test('失败链：已记录的场景歌单先于 v1 快照，旧链在歌单不可用时不变', async () => {
    const playback = fakePlayback();
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, { history: [], batches: { 'work-morning': [
        { s: 'qq', i: '4', t: '旧歌', a: '王菲' }, { s: 'qq', i: '5', t: '旧歌', a: '林忆莲' }, { s: 'qq', i: '6', t: '旧歌', a: '莫文蔚' },
    ] } });
    const order = [];
    const omni = fakeOmni({ resolve: ({ id }) => {
        order.push(id);
        return { status: 'found', song: song(id, Number(id) <= 3 ? '场景歌单' : '旧歌', '王菲') };
    } });
    const playlistSync = { tracks: async () => [{ source: 'qq', id: '1' }, { source: 'qq', id: '2' }, { source: 'qq', id: '3' }] };
    const { deps } = makeDeps({ omni, playback });
    const radio = createRadio({ ...deps, storage, playlistSync });
    assert.equal(await radio.runScene('work-morning'), 'ok');
    assert.deepEqual(order, ['1', '2', '3']);
    assert.deepEqual(playback._calls.replace[0].titles, ['场景歌单', '场景歌单', '场景歌单']);
    // 歌单复活已用掉本场景的复活额度；清额度（等同中间成功生成了一批）后快照腿才接得上。
    storage._map.get(STORAGE_KEY).revivals = {};
    const second = createRadio({ ...deps, storage, playback: fakePlayback(), playlistSync: { tracks: async () => [] } });
    assert.equal(await second.runScene('work-morning'), 'ok');
    assert.deepEqual(order.slice(3), ['4', '5', '6']);
});

test('三个 namespace 分别缺失时 client 可启动原 v1 命令和路径', async () => {
    for (const missing of ['library', 'audioFx', 'radio']) {
        const commands = new Map();
        const disposers = [];
        const storage = fakeStorage();
        const folium = {
            host: { folium: { major: 1, minor: 8 } }, env: { context: 'main' },
            net: { fetch: async () => llmResponse([]) }, omni: { ...fakeOmni(), listProviders: () => [{ selected: true, providerId: 'qq' }] },
            playback: fakePlayback(), storage, secrets: fakeSecrets(null),
            account: { getState: () => ({ accountKey: 'account-A' }) },
            registries: {
                settingsSections: { register: () => ({ settings: { get: () => ({}), onChange: () => () => {} } }) },
                commands: { register: def => commands.set(def.id, def) },
            },
            log: { warn: () => {}, info: () => {} }, ui: { toast: () => {} },
            events: { on: () => () => {} }, every: () => () => {},
            onDispose: fn => disposers.push(fn),
            library: { listPlaylists: async () => [], createPlaylist: async () => {}, replacePlaylistSongs: async () => {}, getPlaylistTracks: async () => [] },
            audioFx: { applyProfile: async () => {}, clearProfile: async () => {} },
            radio: { registerEntries: () => {}, onStartRequest: () => {} },
        };
        delete folium[missing];
        activate(folium);
        assert.equal(commands.size, 6, missing);
        assert.ok(commands.has('play-work-morning'), missing);
        const result = await commands.get('play-work-morning').run();
        assert.match(result.message, /生成失败/, missing);
        disposers.forEach(dispose => dispose());
    }
});

test('设置变更只在 linkAudioFx 由开到关的跳变上清音效，无关改动不碰', async () => {
    let settings = { linkAudioFx: true };
    let onChange;
    const clears = [];
    const folium = {
        host: { folium: { major: 1, minor: 8 } }, env: { context: 'main' },
        net: { fetch: async () => llmResponse([]) },
        omni: { ...fakeOmni(), listProviders: () => [{ selected: true, providerId: 'qq' }] },
        playback: fakePlayback(), storage: fakeStorage(), secrets: fakeSecrets(null),
        account: { getState: () => ({ accountKey: 'account-A' }) },
        registries: {
            settingsSections: { register: () => ({ settings: { get: () => settings, onChange: (fn) => { onChange = fn; } } }) },
            commands: { register: () => {} },
        },
        log: { warn: () => {}, info: () => {} }, ui: { toast: () => {} },
        events: { on: () => () => {} }, every: () => () => {},
        onDispose: () => {},
        library: { listPlaylists: async () => [], createPlaylist: async () => {}, replacePlaylistSongs: async () => {}, getPlaylistTracks: async () => [] },
        audioFx: { applyProfile: async () => {}, clearProfile: async () => { clears.push(1); } },
        radio: { registerEntries: () => {}, onStartRequest: () => {} },
    };
    activate(folium);
    onChange();
    assert.equal(clears.length, 0);              // 首次回调按「未变」处理
    settings = { linkAudioFx: false };
    onChange();
    assert.equal(clears.length, 1);              // true → false：清
    settings = { linkAudioFx: false, gatewayBase: 'https://other.example/v1' };
    onChange();
    assert.equal(clears.length, 1);              // 无关设置跳变：不清
    settings = { linkAudioFx: true };
    onChange();
    assert.equal(clears.length, 1);              // false → true：不清
    settings = { linkAudioFx: false };
    onChange();
    assert.equal(clears.length, 2);              // 再次 true → false：清
});

// ---------------------------------------------------------------- F10：恢复 / 升级 / 复活上限 / diag

console.log('F10 state restore / escalation / revival cap / diag');

test('状态恢复：队列主体命中已存批次 → 接管且队尾立即续单', async () => {
    // F12 起接管下限是命中 ≥6：8/8 全命中才算队列主体。
    const batchSongs = Array.from({ length: 8 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const playback = fakePlayback({
        items: batchSongs,
        currentIndex: 6, // 剩 1 ≤3 → 恢复即触发续单
    });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: {
            driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })),
        },
    });
    const omni = makeOmniFor({
        笑忘书: [song(9, '笑忘书', '王菲')],
        至少还有你: [song(10, '至少还有你', '林忆莲')],
        爱情: [song(11, '爱情', '莫文蔚')],
    });
    const { deps, record } = makeDeps({
        fetch: async () => llmResponse([
            { title: '笑忘书', artist: '王菲' },
            { title: '至少还有你', artist: '林忆莲' },
            { title: '爱情', artist: '莫文蔚' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    await radio.restore();
    assert.equal(radio._state.activeSceneId, 'driving');
    assert.equal(record.fetches.length, 1, '恢复后队尾应立即发起一次续单');
    const cont = playback._calls.replace[0];
    assert.deepEqual(cont.titles.slice(0, 8), batchSongs.map((s) => s.title));
    assert.deepEqual(cont.titles.slice(8), ['笑忘书', '至少还有你', '爱情']);
    // F11：续单后批次是整场累积镜像（旧 8 + 新 3），不是只存最后一截。
    assert.deepEqual(
        storage._map.get(STORAGE_KEY).batches.driving.map((e) => e.i),
        [...batchSongs.map((s) => s.id), '9', '10', '11'],
        '续单后 batches 应为旧批次 + 本次追加的累积镜像',
    );
});

test('状态恢复：队列主体不是电台批次 → 不接管不发 LLM', async () => {
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(7, '别人的歌', '某人'), song(8, '另一首', '路人'), song(9, '第三首', '路人')],
        currentIndex: 0,
    });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: [{ s: 'qq', i: '1', t: '红豆', a: '王菲' }, { s: 'qq', i: '2', t: '阴天', a: '莫文蔚' }, { s: 'qq', i: '3', t: '遇见', a: '孙燕姿' }] },
    });
    const { deps, record } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    await radio.restore();
    assert.equal(radio._state.activeSceneId, null, '只有 1/4 命中，不算队列主体');
    assert.equal(record.fetches.length, 0);
});

test('F11：首批 → 续单一次 → 新实例（同 storage）restore 必须接管', async () => {
    const playback = fakePlayback();
    const storage = fakeStorage();
    const first = Array.from({ length: 8 }, (_, i) => ({ title: `一批歌${i + 1}`, artist: '王菲' }));
    const second = [
        { title: '笑忘书', artist: '王菲' },
        { title: '至少还有你', artist: '林忆莲' },
        { title: '爱情', artist: '莫文蔚' },
    ];
    const omni = makeOmniFor({
        ...Object.fromEntries(first.map((c, i) => [c.title, [song(i + 1, c.title, c.artist)]])),
        笑忘书: [song(9, '笑忘书', '王菲')],
        至少还有你: [song(10, '至少还有你', '林忆莲')],
        爱情: [song(11, '爱情', '莫文蔚')],
    });
    const { deps, record } = makeDeps({
        fetch: seqFetch([
            async () => llmResponse(first),
            async () => llmResponse(second),
        ]),
        omni, playback, storage,
    });
    const radio1 = createRadio(deps);
    assert.equal(await radio1.runScene('driving'), 'ok');
    assert.equal(playback._songs().length, 8);
    playback._setIndex(5); // 剩 2 ≤3 → 续单
    radio1._state.lastGenAt = 0;
    await radio1.onQueueChanged();
    assert.equal(playback._songs().length, 11, '首批 8 + 续单 3');
    // 换实例（模拟停用→启用/App 重启，内存态全丢），同一份 storage。
    const radio2 = createRadio({ ...deps });
    playback._setIndex(3); // 显示歌是电台歌：restore 的第三条件满足
    await radio2.restore();
    assert.equal(radio2._state.activeSceneId, 'driving', '续单过的累积镜像应能接管');
    // 命中 11/11 ≥6 且 100%：接管后若队尾会续单——这里剩 7 未触发，只查接管本身。
    assert.equal(record.fetches.length, 2, '接管时离队尾还远，不再发 LLM');
});

test('F11：累积镜像上限 60——续单追加后只留最近 60 首', async () => {
    const oldEntries = Array.from({ length: 60 }, (_, i) => ({ s: 'qq', i: `${i + 1}`, t: `旧批${i + 1}`, a: '王菲' }));
    const oldSongs = oldEntries.map((e) => song(e.i, e.t, e.a));
    const playback = fakePlayback({ items: oldSongs, currentIndex: 56 }); // 剩 3 ≤3 → 续单
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, { history: [], batches: { driving: oldEntries } });
    const omni = makeOmniFor({
        新1: [song(101, '新1', '王菲')],
        新2: [song(102, '新2', '王菲')],
        新3: [song(103, '新3', '王菲')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '新1', artist: '王菲' },
            { title: '新2', artist: '王菲' },
            { title: '新3', artist: '王菲' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    radio._state.queuedKeys.add('id:qq:1'); // 队列里的旧批歌仍认作电台的
    await radio.onQueueChanged();
    const saved = storage._map.get(STORAGE_KEY).batches.driving;
    assert.equal(saved.length, 60, '累积镜像封顶 60');
    assert.equal(saved[0].i, '4', '最旧的 3 首被裁掉');
    assert.deepEqual(saved.slice(-3).map((e) => e.i), ['101', '102', '103'], '最新追加在镜像尾部');
});

test('F12：用户 5 首小队列 3 首重合 → 不接管', async () => {
    const playback = fakePlayback({
        items: [
            song(1, '电台歌1', '王菲'), song(2, '电台歌2', '王菲'), song(3, '电台歌3', '王菲'),
            song(91, '用户歌1', '某人'), song(92, '用户歌2', '某人'),
        ],
        currentIndex: 0,
    });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: [
            { s: 'qq', i: '1', t: '电台歌1', a: '王菲' },
            { s: 'qq', i: '2', t: '电台歌2', a: '王菲' },
            { s: 'qq', i: '3', t: '电台歌3', a: '王菲' },
            { s: 'qq', i: '4', t: '电台歌4', a: '王菲' },
        ] },
    });
    const { deps, record } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    await radio.restore();
    assert.equal(radio._state.activeSceneId, null, '命中 3<6 且 3/5<2/3，小队列不得被接管');
    assert.equal(record.fetches.length, 0);
});

test('F12：电台队列 15/15 → 接管', async () => {
    const batchSongs = Array.from({ length: 15 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const playback = fakePlayback({ items: batchSongs, currentIndex: 4 });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })) },
    });
    const { deps, record } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    await radio.restore();
    assert.equal(radio._state.activeSceneId, 'driving');
    assert.equal(record.fetches.length, 0, '剩 10 首未到队尾，接管不触发续单');
});

test('F12：15/15 电台队列且当前无在播歌 → 接管', async () => {
    const batchSongs = Array.from({ length: 15 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const playback = fakePlayback({ items: batchSongs, currentIndex: -1 });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })) },
    });
    const { deps, record } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    await radio.restore();
    assert.equal(radio._state.activeSceneId, 'driving', '无在播歌时第三条件按 spec 放行');
    assert.equal(record.fetches.length, 0);
});

test('F12：10 首队列命中 6（过数量闸但 0.6<2/3）→ 不接管', async () => {
    const batchSongs = Array.from({ length: 6 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const userSongs = Array.from({ length: 4 }, (_, i) => song(90 + i, `用户歌${i + 1}`, '某人'));
    // 显示歌是电台歌——把第三条件也放行，专钉比例闸。
    const playback = fakePlayback({ items: [...batchSongs, ...userSongs], currentIndex: 0 });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })) },
    });
    const { deps, record } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    await radio.restore();
    assert.equal(radio._state.activeSceneId, null, '命中 6 ≥6 但 6/10 < 2/3，比例闸拦下');
    assert.equal(record.fetches.length, 0);
});

test('F12：30 首队列命中 20（累积镜像）→ 接管', async () => {
    const batchSongs = Array.from({ length: 20 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const userSongs = Array.from({ length: 10 }, (_, i) => song(100 + i, `用户歌${i + 1}`, '某人'));
    const playback = fakePlayback({ items: [...batchSongs, ...userSongs], currentIndex: 3 });
    const storage = fakeStorage();
    // 累积镜像存了整场 30 首：20 首仍在队列里 + 10 首已播被移除，续单后镜像与队列不再等长。
    const mirror = [
        ...batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })),
        ...Array.from({ length: 10 }, (_, i) => ({ s: 'qq', i: `${i + 21}`, t: `已播歌${i + 21}`, a: '王菲' })),
    ];
    storage._map.set(STORAGE_KEY, { history: [], batches: { driving: mirror } });
    const { deps } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    await radio.restore();
    // 命中 20 ≥6、20/30 = 2/3 边界（含）、显示歌（队列第 4 首）在批次身份集内。
    assert.equal(radio._state.activeSceneId, 'driving');
});

test('F12：队列 6 电台 + 3 用户、显示歌是用户歌 → 不接管', async () => {
    const batchSongs = Array.from({ length: 6 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const userSongs = [song(91, '用户歌1', '某人'), song(92, '用户歌2', '某人'), song(93, '用户歌3', '某人')];
    const playback = fakePlayback({ items: [...batchSongs, ...userSongs], currentIndex: 6 });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })) },
    });
    const { deps, record } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    await radio.restore();
    // 命中 6/9 = 2/3 过前两闸，但显示歌是用户歌 → 第三条件拦下。
    assert.equal(radio._state.activeSceneId, null);
    assert.equal(record.fetches.length, 0);
});

test('续单失败 → 升级一次整队新生成（整队替换并开播）', async () => {
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(2, '阴天', '莫文蔚'), song(3, '遇见', '孙燕姿')],
        currentIndex: 1,
    });
    const omni = makeOmniFor({
        笑忘书: [song(4, '笑忘书', '王菲')],
        至少还有你: [song(5, '至少还有你', '林忆莲')],
        爱情: [song(6, '爱情', '莫文蔚')],
    });
    const { deps } = makeDeps({
        fetch: seqFetch([
            async () => { throw new Error('llm down'); }, // 续单败
            async () => llmResponse([ // 升级整队成
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]),
        ]),
        omni, playback,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    [1, 2, 3].forEach((id) => radio._state.queuedKeys.add(`id:qq:${id}`));
    await radio.onQueueChanged();
    assert.equal(playback._calls.replace.length, 1, '升级只整队替换一次');
    assert.deepEqual(playback._calls.replace[0].titles, ['笑忘书', '至少还有你', '爱情']);
    assert.equal(playback._calls.playItem[0], 0);
    assert.equal(radio._state.activeSceneId, 'driving');
    assert.equal(radio._state.contFails, 0);
});

test('续单 append 被拒 → 同样升级整队新生成', async () => {
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(2, '阴天', '莫文蔚'), song(3, '遇见', '孙燕姿')],
        currentIndex: 1,
    });
    // append 路径 4 次 stale-version 全拒（超 HARD_RETRIES=3），升级的整队路径最后一次才放行。
    playback._refusals.push('stale-version', 'stale-version', 'stale-version', 'stale-version');
    const omni = makeOmniFor({
        笑忘书: [song(4, '笑忘书', '王菲')],
        至少还有你: [song(5, '至少还有你', '林忆莲')],
        爱情: [song(6, '爱情', '莫文蔚')],
    });
    const { deps, record } = makeDeps({
        fetch: seqFetch([
            async () => llmResponse([ // 续单生成成功，但 append 被拒
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]),
            async () => llmResponse([ // 升级整队
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]),
        ]),
        omni, playback,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    [1, 2, 3].forEach((id) => radio._state.queuedKeys.add(`id:qq:${id}`));
    await radio.onQueueChanged();
    assert.equal(record.fetches.length, 2, '续单与升级各一次 LLM');
    const last = playback._calls.replace.at(-1);
    assert.deepEqual(last.titles, ['笑忘书', '至少还有你', '爱情'], '升级整队只放新批');
    assert.equal(radio._state.activeSceneId, 'driving');
});

test('升级整队也失败 → 停用续播 + 错误 toast 带环节 + diag 落盘', async () => {
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, { history: [], batches: {}, revivals: { driving: 1 } }); // 复活额度已用尽
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(2, '阴天', '莫文蔚'), song(3, '遇见', '孙燕姿')],
        currentIndex: 1,
    });
    const { deps, record } = makeDeps({
        fetch: async () => { throw new Error('llm down'); },
        playback, storage,
        omni: fakeOmni({ resolve: () => ({ status: 'found', song: song(1, '红豆', '王菲') }) }),
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    [1, 2, 3].forEach((id) => radio._state.queuedKeys.add(`id:qq:${id}`));
    await radio.onQueueChanged();
    assert.equal(radio._state.activeSceneId, null);
    // F14：升级链静默——兜底腿的「不再重放」不再单发一条，唯一出口是停用提示。
    const errors = record.toasts.filter((t) => t.type === 'error').map((t) => t.message);
    assert.equal(errors.length, 1, `升级失败应恰好一条提示，实际：${JSON.stringify(errors)}`);
    assert.ok(errors[0].includes('停止自动续播') && errors[0].includes('生成环节'), '停用 toast 带失败环节');
    const diag = storage._map.get(DIAG_STORAGE_KEY);
    assert.equal(diag.scene, 'driving');
    assert.equal(diag.stage, 'fallback');
    assert.ok(diag.error.startsWith('llm:'), `diag error 应保留根因环节: ${diag.error}`);
    assert.equal(diag.consecutiveFails, 2);
});

test('复活上限：手动点卡第二次失败不再重播同批', async () => {
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: {
            'work-morning': [
                { s: 'qq', i: '99', t: '红豆', a: '王菲' },
                { s: 'qq', i: '98', t: '阴天', a: '莫文蔚' },
                { s: 'qq', i: '97', t: '遇见', a: '孙燕姿' },
            ],
        },
    });
    const playback = fakePlayback();
    const omni = fakeOmni({
        resolve: (key) => ({ status: 'found', song: song(key.id, '复活歌', '王菲') }),
        search: () => ({ items: [], nextCursor: null, total: 0 }),
    });
    const { deps, record } = makeDeps({
        fetch: async () => { throw new Error('down'); },
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    assert.equal(await radio.runScene('work-morning'), 'ok'); // 第一次：快照复活
    assert.equal(playback._calls.replace.length, 1);
    radio._state.lastGenAt = 0;
    assert.equal(await radio.runScene('work-morning'), 'fail'); // 第二次：不许重放
    assert.equal(playback._calls.replace.length, 1, '同批不得重播第二遍');
    assert.ok(record.toasts.some((t) => t.type === 'error' && t.message.includes('不再重放')));
    const diag = storage._map.get(DIAG_STORAGE_KEY);
    assert.equal(diag.stage, 'fallback');
    assert.equal(diag.consecutiveFails, 2);
});

test('diag：真生成成功后清零，失败按环节落盘', async () => {
    const storage = fakeStorage();
    storage._map.set(DIAG_STORAGE_KEY, { at: 1, scene: 'driving', stage: 'llm', error: 'x', consecutiveFails: 2 });
    const playback = fakePlayback();
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    assert.equal(await radio.runScene('work-morning'), 'ok');
    assert.equal(storage._map.has(DIAG_STORAGE_KEY), false, '成功后 diag 应清零');
    assert.equal(radio._state.contFails, 0);
});

test('续单窗口内队列被用户接管 → 停用不抢队（不升级、不动用户队列）', async () => {
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(2, '阴天', '莫文蔚'), song(3, '遇见', '孙燕姿')],
        currentIndex: 1,
    });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const omni = makeOmniFor({
        笑忘书: [song(4, '笑忘书', '王菲')],
        至少还有你: [song(5, '至少还有你', '林忆莲')],
        爱情: [song(6, '爱情', '莫文蔚')],
    });
    const { deps, record } = makeDeps({
        fetch: async () => {
            await gate;
            return llmResponse([
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]);
        },
        omni, playback,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    [1, 2, 3].forEach((id) => radio._state.queuedKeys.add(`id:qq:${id}`));
    const pending = radio.onQueueChanged();
    for (let i = 0; i < 50 && !record.fetches.length; i += 1) await Promise.resolve(); // 等 LLM 请求发出
    // 生成窗口内用户整队换成自己的歌
    await playback.replaceQueue([song(90, '用户歌1', '某人'), song(91, '用户歌2', '某人')], { expectedVersion: 'v1' });
    release();
    await pending;
    assert.equal(record.fetches.length, 1, '被接管不升级：不再发第二次 LLM');
    assert.equal(radio._state.activeSceneId, null);
    assert.equal(playback._calls.replace.length, 1, '唯一的 replace 是用户自己的换队');
    assert.deepEqual(playback._songs().map((s) => s.title), ['用户歌1', '用户歌2'], '用户队列不被电台歌污染');
});

test('续单窗口内队列排空 → 升级整队补锅并开播', async () => {
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(2, '阴天', '莫文蔚'), song(3, '遇见', '孙燕姿')],
        currentIndex: 1,
    });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const omni = makeOmniFor({
        笑忘书: [song(4, '笑忘书', '王菲')],
        至少还有你: [song(5, '至少还有你', '林忆莲')],
        爱情: [song(6, '爱情', '莫文蔚')],
    });
    const { deps, record } = makeDeps({
        fetch: seqFetch([
            async () => { await gate; return llmResponse([
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]); },
            async () => llmResponse([
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]),
        ]),
        omni, playback,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    [1, 2, 3].forEach((id) => radio._state.queuedKeys.add(`id:qq:${id}`));
    const pending = radio.onQueueChanged();
    for (let i = 0; i < 50 && !record.fetches.length; i += 1) await Promise.resolve();
    await playback.replaceQueue([], { expectedVersion: 'v1' }); // 生成窗口内队列被排空
    release();
    await pending;
    assert.equal(record.fetches.length, 2, '续单败后升级一次整队');
    const last = playback._calls.replace.at(-1);
    assert.deepEqual(last.titles, ['笑忘书', '至少还有你', '爱情']);
    assert.equal(playback._calls.playItem[0], 0);
    assert.equal(radio._state.activeSceneId, 'driving');
});

test('续单落地但播放已停止 → 从第一首新歌接起，不静默死', async () => {
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(2, '阴天', '莫文蔚'), song(3, '遇见', '孙燕姿')],
        currentIndex: 2, // 剩 0 ≤3 触发续单
    });
    let playState = 'playing';
    // 宿主语义：自然播完停在队尾、显示歌不动——getState 读队列当前项。
    playback.getState = () => {
        const snap = playback.getQueue({ offset: 0, limit: 500 });
        return { song: snap.items[snap.currentIndex]?.song ?? null, state: playState, position: 0, duration: 0, liked: false, canLike: false };
    };
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const omni = makeOmniFor({
        笑忘书: [song(4, '笑忘书', '王菲')],
        至少还有你: [song(5, '至少还有你', '林忆莲')],
        爱情: [song(6, '爱情', '莫文蔚')],
    });
    const { deps, record } = makeDeps({
        fetch: async () => {
            await gate;
            return llmResponse([
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]);
        },
        omni, playback,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    [1, 2, 3].forEach((id) => radio._state.queuedKeys.add(`id:qq:${id}`));
    const pending = radio.onQueueChanged();
    for (let i = 0; i < 50 && !record.fetches.length; i += 1) await Promise.resolve();
    playState = 'stopped'; // 生成窗口内队列自然播完
    release();
    await pending;
    assert.equal(playback._calls.replace.length, 1);
    assert.equal(playback._calls.playItem[0], 3, '触发时在播、落地已停 → 从第一首新歌补播');
    assert.equal(playback._songs().length, 6);
});

test('续单触发时已暂停 → 只接尾不补播（用户自己停的，不替他拉回）', async () => {
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(2, '阴天', '莫文蔚'), song(3, '遇见', '孙燕姿')],
        currentIndex: 2,
    });
    playback.getState = () => ({ song: null, state: 'paused', position: 0, duration: 0, liked: false, canLike: false });
    const omni = makeOmniFor({
        笑忘书: [song(4, '笑忘书', '王菲')],
        至少还有你: [song(5, '至少还有你', '林忆莲')],
        爱情: [song(6, '爱情', '莫文蔚')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '笑忘书', artist: '王菲' },
            { title: '至少还有你', artist: '林忆莲' },
            { title: '爱情', artist: '莫文蔚' },
        ]),
        omni, playback,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    [1, 2, 3].forEach((id) => radio._state.queuedKeys.add(`id:qq:${id}`));
    await radio.onQueueChanged();
    assert.equal(playback._calls.replace.length, 1);
    assert.equal(playback._calls.playItem.length, 0, '暂停状态下续单不得强行开播');
    assert.equal(playback._songs().length, 6);
});

test('F13：生成窗口内用户停在中间某首 → 只接尾不补播', async () => {
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(2, '阴天', '莫文蔚'), song(3, '遇见', '孙燕姿')],
        currentIndex: 2,
    });
    let playState = 'playing';
    // 显示歌读队列当前项：用户停在中间某首时显示歌 ≠ 追加前队尾。
    playback.getState = () => {
        const snap = playback.getQueue({ offset: 0, limit: 500 });
        return { song: snap.items[snap.currentIndex]?.song ?? null, state: playState, position: 0, duration: 0, liked: false, canLike: false };
    };
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const omni = makeOmniFor({
        笑忘书: [song(4, '笑忘书', '王菲')],
        至少还有你: [song(5, '至少还有你', '林忆莲')],
        爱情: [song(6, '爱情', '莫文蔚')],
    });
    const { deps, record } = makeDeps({
        fetch: async () => {
            await gate;
            return llmResponse([
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]);
        },
        omni, playback,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    [1, 2, 3].forEach((id) => radio._state.queuedKeys.add(`id:qq:${id}`));
    const pending = radio.onQueueChanged();
    for (let i = 0; i < 50 && !record.fetches.length; i += 1) await Promise.resolve();
    // 用户在窗口内停在第 2 首（中间某首）——显示歌不是追加前队尾「遇见」。
    playback._setIndex(1);
    playState = 'stopped';
    release();
    await pending;
    assert.equal(playback._calls.replace.length, 1);
    assert.equal(playback._calls.playItem.length, 0, '用户按停不得拉回播放');
    assert.equal(playback._songs().length, 6);
});

test('升级窗口内队列被用户接管 → 整队不落、静默停用（不抢队）', async () => {
    const playback = fakePlayback({
        items: [song(1, '红豆', '王菲'), song(2, '阴天', '莫文蔚'), song(3, '遇见', '孙燕姿')],
        currentIndex: 1,
    });
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const { deps, record } = makeDeps({
        fetch: seqFetch([
            async () => { throw new Error('offline'); }, // 续单 LLM 失败
            async () => { await gate; return llmResponse([
                { title: '笑忘书', artist: '王菲' },
                { title: '至少还有你', artist: '林忆莲' },
                { title: '爱情', artist: '莫文蔚' },
            ]); }, // 升级整队 LLM
        ]),
        omni: makeOmniFor({
            笑忘书: [song(4, '笑忘书', '王菲')],
            至少还有你: [song(5, '至少还有你', '林忆莲')],
            爱情: [song(6, '爱情', '莫文蔚')],
        }),
        playback,
    });
    const radio = createRadio(deps);
    radio._state.activeSceneId = 'driving';
    [1, 2, 3].forEach((id) => radio._state.queuedKeys.add(`id:qq:${id}`));
    const pending = radio.onQueueChanged();
    for (let i = 0; i < 80 && record.fetches.length < 2; i += 1) await Promise.resolve(); // 等升级 LLM 发出
    await playback.replaceQueue([song(90, '用户歌1', '某人'), song(91, '用户歌2', '某人')], { expectedVersion: 'v1' });
    release();
    await pending;
    assert.equal(record.fetches.length, 2, '升级链仍只发一次 LLM');
    assert.equal(playback._calls.replace.length, 1, '升级送队被归属闸拦下，唯一 replace 是用户的');
    assert.deepEqual(playback._songs().map((s) => s.title), ['用户歌1', '用户歌2'], '用户队列原样');
    assert.equal(radio._state.activeSceneId, null);
    // F14：生成其实已成功、队列被用户接管——不许再弹「生成失败」这类与事实相反的提示。
    assert.equal(record.toasts.filter((t) => t.type === 'error').length, 0, '被接管应零错误 toast');
});

test('送队落地后模组被停用 → 不再开播、不上音效', async () => {
    const playback = fakePlayback();
    const effects = [];
    const audioFx = {
        applyProfile: async (profile) => { effects.push(['apply', profile]); },
        clearProfile: async () => { effects.push(['clear']); },
    };
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
        ]),
        omni, playback,
    });
    let radio;
    const origReplace = playback.replaceQueue;
    playback.replaceQueue = async (list, opts) => {
        const result = await origReplace(list, opts);
        radio.dispose(); // replaceQueue await 返回与后续开播之间停用
        return result;
    };
    radio = createRadio({ ...deps, audioFx });
    const result = await radio.runScene('work-morning');
    assert.equal(result, 'fail');
    assert.equal(playback._songs().length, 3, 'replace 已提交无法撤销');
    assert.equal(playback._calls.playItem.length, 0, '停用后不再开播');
    assert.equal(effects.filter((e) => e[0] === 'apply').length, 0, '停用后不再叠加音效');
});

test('整队替换后旧批次键被清掉（历史键不再把用户队列误判为电台）', async () => {
    const playback = fakePlayback();
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
        ]),
        omni, playback,
    });
    const radio = createRadio(deps);
    radio._state.queuedKeys.add('id:qq:999'); // 上一批残留的键
    await radio.runScene('work-morning');
    assert.equal(radio._state.queuedKeys.has('id:qq:999'), false, '整队替换后旧键被清');
    assert.equal(radio._state.queuedKeys.size, 6, '只剩新批次 3 首的 id+pair 键');
});

test('送队瞬态重试中停用模组 → 不再改写队列', async () => {
    const playback = fakePlayback();
    playback._refusals.push('transition', 'transition', 'transition', 'transition', 'transition', 'transition');
    const omni = makeOmniFor({
        红豆: [song(1, '红豆', '王菲')],
        阴天: [song(2, '阴天', '莫文蔚')],
        遇见: [song(3, '遇见', '孙燕姿')],
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
        ]),
        omni, playback,
    });
    let radio;
    deps.sleep = async () => { radio.dispose(); }; // 第一次瞬态退避时停用
    radio = createRadio(deps);
    const result = await radio.runScene('work-morning');
    assert.equal(result, 'fail');
    assert.equal(playback._calls.replace.length, 1, '停用后不再重试送队');
    assert.equal(playback._songs().length, 0, '队列未被改写');
});

test('全链 F10/F11/F12/F14：激活恢复 → 静默复活一次 → 队尾再败 → 停用不重放', async () => {
    const batchSongs = Array.from({ length: 8 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })) },
    });
    const playback = fakePlayback({ items: batchSongs, currentIndex: 6 }); // 剩 1 ≤3
    const omni = fakeOmni({
        resolve: (key) => {
            const found = batchSongs.find((s) => s.id === key.id);
            return found ? { status: 'found', song: found } : { status: 'not-found' };
        },
        search: () => ({ items: [], nextCursor: null, total: 0 }),
    });
    const { deps, record } = makeDeps({
        fetch: async () => { throw new Error('down'); },
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    await radio.restore();
    // 恢复即触发一轮：续单败 → 升级败 → 快照复活（本轮唯一一次重播，quiet 不弹「改播」提示）
    assert.equal(playback._calls.replace.length, 1);
    assert.equal(radio._state.activeSceneId, 'driving');
    assert.equal(
        record.toasts.filter((t) => t.message.includes('改播')).length,
        0,
        '升级链兜底救回也静默（F14）',
    );
    // 复活批放到队尾 → 第二轮：续单败 → 升级败 → 额度已尽 → 停用
    playback._setIndex(6);
    radio._state.lastGenAt = 0; // 冷却只防真机重入，测试直通
    await radio.onQueueChanged();
    assert.equal(playback._calls.replace.length, 1, '同批不得重播第二遍');
    assert.equal(radio._state.activeSceneId, null);
    const errors = record.toasts.filter((t) => t.type === 'error');
    assert.equal(errors.length, 1, '停用提示是唯一一条错误 toast');
    assert.ok(errors[0].message.includes('停止自动续播'));
    const diag = storage._map.get(DIAG_STORAGE_KEY);
    assert.equal(diag.stage, 'fallback');
});

// ---------------------------------------------------------------- F15：迟到接管（真机 activate 早于队列水化）

console.log('F15 late restore (queue rehydrates after activate)');

test('F15：激活时队列为空（水化未完成），queueChanged 填充后迟到接管且队尾续单', async () => {
    const batchSongs = Array.from({ length: 8 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    // 激活时点：宿主 playQueue 还是 []（restoreSession 尚未 setPlayQueue）。
    const playback = fakePlayback({ items: [], currentIndex: -1 });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })) },
    });
    const omni = makeOmniFor({
        笑忘书: [song(9, '笑忘书', '王菲')],
        至少还有你: [song(10, '至少还有你', '林忆莲')],
        爱情: [song(11, '爱情', '莫文蔚')],
    });
    const { deps, record } = makeDeps({
        fetch: async () => llmResponse([
            { title: '笑忘书', artist: '王菲' },
            { title: '至少还有你', artist: '林忆莲' },
            { title: '爱情', artist: '莫文蔚' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    await radio.restore(); // 激活时跑一次：空队 → 不接管，但武装保留
    assert.equal(radio._state.activeSceneId, null);
    // 水化完成：宿主 setPlayQueue → 派发 playback.queueChanged（模组侧走 onQueueChanged）
    playback._songs().push(...batchSongs);
    playback._setIndex(6); // 剩 1 ≤3：接管后应立刻续单
    await radio.onQueueChanged();
    assert.equal(radio._state.activeSceneId, 'driving', '水化后的 queueChanged 应迟到接管');
    assert.equal(record.fetches.length, 1, '接管后队尾应立即续单');
    assert.deepEqual(playback._calls.replace[0].titles.slice(0, 8), batchSongs.map((s) => s.title));
});

test('F15：激活时 getQueue 抛错（宿主动作未注册），水化后同样迟到接管', async () => {
    const batchSongs = Array.from({ length: 8 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const playback = fakePlayback({ items: batchSongs, currentIndex: 6 });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })) },
    });
    const omni = makeOmniFor({
        笑忘书: [song(9, '笑忘书', '王菲')],
        至少还有你: [song(10, '至少还有你', '林忆莲')],
        爱情: [song(11, '爱情', '莫文蔚')],
    });
    const { deps, record } = makeDeps({
        fetch: async () => llmResponse([
            { title: '笑忘书', artist: '王菲' },
            { title: '至少还有你', artist: '林忆莲' },
            { title: '爱情', artist: '莫文蔚' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    // 真机 activate 早于 App 首提交：requireActions 未注册，getQueue 必抛。
    const realGetQueue = playback.getQueue;
    playback.getQueue = () => { throw new Error('playback-unavailable-in-main-context'); };
    await radio.restore();
    assert.equal(radio._state.activeSceneId, null);
    playback.getQueue = realGetQueue; // actions 注册 + 队列水化 → queueChanged
    await radio.onQueueChanged();
    assert.equal(radio._state.activeSceneId, 'driving', '注册+水化后的 queueChanged 应迟到接管');
    assert.equal(record.fetches.length, 1, '接管后队尾应立即续单');
});

test('F15：水化出用户自己的队列 → 迟到评估仍不接管、不发 LLM', async () => {
    const playback = fakePlayback({ items: [], currentIndex: -1 });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: [
            { s: 'qq', i: '1', t: '红豆', a: '王菲' },
            { s: 'qq', i: '2', t: '阴天', a: '莫文蔚' },
            { s: 'qq', i: '3', t: '遇见', a: '孙燕姿' },
        ] },
    });
    const { deps, record } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    await radio.restore();
    playback._songs().push(song(1, '红豆', '王菲'), song(91, '用户歌1', '某人'), song(92, '用户歌2', '某人'), song(93, '用户歌3', '某人'));
    playback._setIndex(0);
    await radio.onQueueChanged();
    assert.equal(radio._state.activeSceneId, null, '命中 1/4 不算队列主体，不得接管');
    assert.equal(record.fetches.length, 0);
});

test('F15：stop() 解除接管武装——之后队列变化不再复活电台', async () => {
    const batchSongs = Array.from({ length: 8 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const playback = fakePlayback({ items: batchSongs, currentIndex: 2 });
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })) },
    });
    const { deps, record } = makeDeps({ playback, storage });
    const radio = createRadio(deps);
    await radio.restore();
    assert.equal(radio._state.activeSceneId, 'driving');
    radio.stop();
    assert.equal(radio._state.activeSceneId, null);
    playback._setIndex(6); // 用户把同一批继续放到队尾
    await radio.onQueueChanged();
    assert.equal(radio._state.activeSceneId, null, 'stop 之后不得重新接管');
    assert.equal(record.fetches.length, 0, 'stop 之后不得再发 LLM');
});

test('F15：手动开播即解除武装——弃用电台再放已存批次主体不复活接管', async () => {
    // 复审中项：restoreArmed 只在接管/stop/disable/dispose 解除。若手动 runScene 开播
    // 后不清武装，用户换掉队列再放「AI 电台」歌单（主体恰是已存批次，F12 三条件全过）
    // 会被无动作复活接管——与「接管后换队」路径语义不对称。
    const batchSongs = Array.from({ length: 8 }, (_, i) => song(i + 1, `电台歌${i + 1}`, '王菲'));
    const playback = fakePlayback();
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: { driving: batchSongs.map((s) => ({ s: 'qq', i: s.id, t: s.title, a: s.artist })) },
    });
    const omni = makeOmniFor({
        红豆: [song(50, '红豆', '王菲')],
        阴天: [song(51, '阴天', '莫文蔚')],
        遇见: [song(52, '遇见', '孙燕姿')],
    });
    const { deps, record } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    assert.equal(await radio.runScene('work-morning'), 'ok'); // 用户显式点卡：spec 停试条件，武装终结
    assert.equal(radio._state.activeSceneId, 'work-morning');
    // 用户整队换成自己的歌 → 电台静默停用
    await playback.replaceQueue([song(90, '用户歌1', '某人'), song(91, '用户歌2', '某人')], { expectedVersion: playback.getQueue().version });
    await radio.onQueueChanged();
    assert.equal(radio._state.activeSceneId, null);
    // 用户随后播放的队列主体恰是已存 driving 批次镜像，显示歌也在集内（F12 全过的复活面）
    await playback.replaceQueue(batchSongs, { expectedVersion: playback.getQueue().version });
    playback._setIndex(0);
    await radio.onQueueChanged();
    assert.equal(radio._state.activeSceneId, null, '电台已被用户换掉后不得复活接管');
    assert.equal(record.fetches.length, 1, '复活接管会再发 LLM');
});

// ---------------------------------------------------------------- F8b：场景卡二档封面

console.log('F8b scene card covers');

test('批次条目写入首曲封面 c（describeSong 提供），听感 history 不带封面', async () => {
    const playback = fakePlayback();
    const storage = fakeStorage();
    const omni = fakeOmni({
        search: (query) => {
            if (query.includes('红豆')) return { items: [song(1, '红豆', '王菲')], nextCursor: null, total: 1 };
            if (query.includes('阴天')) return { items: [song(2, '阴天', '莫文蔚')], nextCursor: null, total: 1 };
            if (query.includes('遇见')) return { items: [song(3, '遇见', '孙燕姿')], nextCursor: null, total: 1 };
            return { items: [], nextCursor: null, total: 0 };
        },
        describe: (s) => ({ availability: 'playable', durationMs: 200000, coverUrl: `https://img/${s.id}.jpg`, pageUrl: null }),
    });
    const { deps } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    assert.equal(await radio.runScene('work-morning'), 'ok');
    const saved = storage._map.get(STORAGE_KEY);
    assert.equal(saved.batches['work-morning'][0].c, 'https://img/1.jpg');
    assert.equal(saved.batches['work-morning'][2].c, 'https://img/3.jpg');
    // 听感历史不需要封面：onSongChanged 的条目不带 c。
    await radio.onSongChanged(song(1, '红豆', '王菲'));
    radio.samplePosition({ position: 12, duration: 200 });
    await radio.onSongChanged(song(2, '阴天', '莫文蔚'));
    const history = storage._map.get(STORAGE_KEY).history;
    assert.ok(history.length && history.every((h) => !('c' in h)), 'history 条目不得带封面字段');
});

test('批次封面：续单后 batchCovers 指向最近批首曲（镜像批界丢失后仍取到）', async () => {
    const playback = fakePlayback();
    const storage = fakeStorage();
    const catalog = [
        song(1, '旧1', '王菲'), song(2, '旧2', '王菲'), song(3, '旧3', '王菲'), song(4, '旧4', '王菲'),
        song(5, '新1', '王菲'), song(6, '新2', '王菲'), song(7, '新3', '王菲'),
    ];
    const omni = fakeOmni({
        search: (query) => {
            const hit = catalog.find((s) => query.includes(s.title));
            return { items: hit ? [hit] : [], nextCursor: null, total: hit ? 1 : 0 };
        },
        describe: (s) => ({ availability: 'playable', durationMs: 200000, coverUrl: `https://img/${s.id}.jpg`, pageUrl: null }),
    });
    const { deps } = makeDeps({
        fetch: seqFetch([
            async () => llmResponse(catalog.slice(0, 4).map((s) => ({ title: s.title, artist: s.artist }))),
            async () => llmResponse(catalog.slice(4).map((s) => ({ title: s.title, artist: s.artist }))),
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    assert.equal(await radio.runScene('driving'), 'ok');
    assert.equal(storage._map.get(STORAGE_KEY).batchCovers.driving, 'https://img/1.jpg', '首批后记本批首曲');
    playback._setIndex(2); // 剩 1 ≤3 → 续单
    radio._state.lastGenAt = 0;
    await radio.onQueueChanged();
    assert.equal(storage._map.get(STORAGE_KEY).batchCovers.driving, 'https://img/5.jpg', '续单后改记新批首曲');
});

test('场景卡封面：歌单封面优先，缺失时用批次首曲封面，旧存档无 c 跳过', async () => {
    const storage = fakeStorage();
    storage._map.set(STORAGE_KEY, {
        history: [],
        batches: {
            'work-morning': [{ s: 'qq', i: '1', t: '红豆', a: '王菲', c: 'https://img/batch.jpg' }],
            // 累积镜像下 batches[0] 是最旧留存首曲；有 batchCovers 时应优先用它。
            'work-evening': [{ s: 'qq', i: '9', t: '最旧留存', a: '某人', c: 'https://img/oldest.jpg' }],
            reading: [{ s: 'qq', i: '2', t: '旧存档歌', a: '某人' }], // 旧存档条目没有 c
        },
        batchCovers: { 'work-evening': 'https://img/recent.jpg' },
    });
    storage._map.set(PLAYLIST_IDS_KEY, { 'account-A': { 'work-afternoon': 'pl-1' } });
    const registrations = [];
    const folium = {
        host: { folium: { major: 1, minor: 8 } }, env: { context: 'main' },
        net: { fetch: async () => llmResponse([]) },
        omni: { ...fakeOmni(), listProviders: () => [{ selected: true, providerId: 'qq' }] },
        playback: fakePlayback(), storage, secrets: fakeSecrets(null),
        account: { getState: () => ({ accountKey: 'account-A' }) },
        registries: {
            settingsSections: { register: () => ({ settings: { get: () => ({}), onChange: () => () => {} } }) },
            commands: { register: () => {} },
        },
        log: { warn: () => {}, info: () => {} }, ui: { toast: () => {} },
        events: { on: () => () => {} }, every: () => () => {}, onDispose: () => {},
        library: {
            listPlaylists: async () => [
                { id: 'pl-1', title: 'AI 电台 · 工作·下午', coverUrl: 'https://img/playlist.jpg' },
            ],
            createPlaylist: async () => {}, replacePlaylistSongs: async () => {}, getPlaylistTracks: async () => [],
        },
        audioFx: { applyProfile: async () => {}, clearProfile: async () => {} },
        radio: { registerEntries: (entries) => registrations.push(entries), onStartRequest: () => {} },
    };
    activate(folium);
    for (let i = 0; i < 20; i += 1) await Promise.resolve();
    const last = registrations.at(-1);
    assert.ok(last, 'refreshRadioCovers 应重新注册一次卡片');
    const byId = Object.fromEntries(last.map((entry) => [entry.id, entry.imageUrl]));
    assert.equal(byId['work-afternoon'], 'https://img/playlist.jpg', '一档：场景歌单封面');
    assert.equal(byId['work-evening'], 'https://img/recent.jpg', '二档：batchCovers 记的是最近批首曲，优先于镜像首条');
    assert.equal(byId['work-morning'], 'https://img/batch.jpg', '无 batchCovers 的旧存档退回镜像首条 c');
    assert.equal(byId['reading'], undefined, '旧存档条目没有 c → 跳过该档不报错');
});

process.on('beforeExit', () => {
    console.log(`\n${passed} tests passed`);
});
