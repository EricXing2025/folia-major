// mods/ai-scene-radio/tests/run.mjs
// AI 场景电台纯逻辑单测：node mods/ai-scene-radio/tests/run.mjs
// 不连真网关、不依赖 folium——全部经 fake 端口注入（fetch/omni/playback/storage/secrets）。

import assert from 'node:assert/strict';
import {
    buildPrompt,
    buildExclusionIndex,
    isExcluded,
    dedupeCandidates,
    parseCandidates,
    pickMatch,
    titleScore,
    artistScore,
    classifyListen,
    shouldContinue,
    createRadio,
    STORAGE_KEY,
    DEFAULT_GATEWAY,
    DEFAULT_MODEL,
} from '../radio.mjs';
import { PROFILE, SCENES, EXCLUSIONS } from '../configData.mjs';

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

test('排除簇：confirmed 命中', () => {
    const index = buildExclusionIndex(EXCLUSIONS);
    assert.equal(isExcluded(song('x', '活埋 (2026女生新版)', '竹子ZZ'), index), true);
});

test('排除簇：suspected 同样命中', () => {
    const index = buildExclusionIndex(EXCLUSIONS);
    assert.equal(isExcluded(song('x', '雨过后的风景', '羊羊'), index), true);
});

test('排除簇：blockedArtist 命中、正常歌放行', () => {
    const index = buildExclusionIndex(EXCLUSIONS);
    assert.equal(isExcluded(song('x', '任意歌名', '任然'), index), true);
    assert.equal(isExcluded(song('x', '红豆', '王菲'), index), false);
    assert.equal(isExcluded(song('x', '普通歌', '刘至佳'), index), false); // 单人不在簇内
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
    assert.ok(user.includes('任然'));     // 排除歌手进提示词
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
    });
    const { deps, record } = makeDeps({
        fetch: async () => llmResponse([
            { title: '红豆', artist: '王菲' },
            { title: '阴天', artist: '莫文蔚' },
            { title: '遇见', artist: '孙燕姿' },
            { title: '活埋 (2026女生新版)', artist: '竹子ZZ' }, // 排除簇：搜到也会被过滤
            { title: '不存在的歌', artist: '无名氏' },
        ]),
        omni, playback, storage,
    });
    const radio = createRadio(deps);
    const ok = await radio.runScene('work-morning');
    assert.equal(ok, 'ok');
    assert.equal(playback._calls.replace.length, 1);
    assert.deepEqual(playback._calls.replace[0].titles, ['红豆', '阴天', '遇见']);
    assert.equal(playback._calls.playItem[0], 0);
    const saved = storage._map.get(STORAGE_KEY);
    assert.ok(saved.batches['work-morning'].length === 3);
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

test('排除簇：blockedArtist 组合署名分隔变体命中', () => {
    const index = buildExclusionIndex({
        blockedArtists: ['任夏 / 老板'],
        blockedSongs: [],
    });
    assert.equal(isExcluded(song(1, '某歌', '任夏、老板'), index), true);
    assert.equal(isExcluded(song(2, '某歌', '任夏，老板'), index), true);
    assert.equal(isExcluded(song(3, '某歌', '任夏'), index), false); // 组合条目不封成员个人
    assert.equal(isExcluded(song(4, '某歌', '王宇宙'), index), false);
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

process.on('beforeExit', () => {
    console.log(`\n${passed} tests passed`);
});
