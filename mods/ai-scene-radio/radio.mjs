// mods/ai-scene-radio/radio.mjs
// AI 场景电台的核心逻辑：提示词组装、候选解析与核验、队列送播与续单、听感反馈、兜底链。
// 所有副作用都经 deps 注入（fetch/omni/playback/storage/secrets/settings/log/toast），
// client.mjs 接真宿主，tests/run.mjs 接 fake——本文件不直接碰 folium。

import { PROFILE, SCENES, EXCLUSIONS } from './configData.mjs';

export const STORAGE_KEY = 'aiSceneRadio.v1';
export const SECRET_KEY = 'apiKey';
export const DEFAULT_GATEWAY = 'https://trendxai.io/v1';
export const DEFAULT_MODEL = 'gemini-3.8-flash-high';
// trendxai 网关躲在 Cloudflare 后面：无浏览器 UA 的请求会被 403（error 1010）拒绝。
export const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const SKIP_SECONDS = 30;
export const HISTORY_LIMIT = 300;
export const AVOID_HISTORY = 60;
export const CONTINUE_REMAINING = 3;
export const MIN_QUEUE_SONGS = 3;
export const SEARCH_LIMIT = 8;
export const VERIFY_FAIL_RATIO = 0.6;
export const GENERATE_COOLDOWN_MS = 8000;

const sceneList = () => SCENES;
const sceneById = (id) => sceneList().find((scene) => scene.id === id) || null;

// ---------------------------------------------------------------- 文本归一化

// NFKC 归一、小写、（）→()、去全部空白。中英文标题/歌手比较的统一口径。
export const normalizeText = (text) =>
    String(text ?? '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/（/g, '(')
        .replace(/）/g, ')')
        .replace(/\s+/g, '');

// 剥掉标题末尾成对的 (...) 标记（版本/语种注记），得到「裸名」；剥不动就回原样。
// 先把全角（）折成半角：QQ 歌名两种括号都出。
export const stripParens = (text) => {
    const normalized = String(text ?? '').replace(/（/g, '(').replace(/）/g, ')');
    const out = normalized.replace(/\s*(\([^()]*\)\s*)+$/u, '');
    return out.trim() ? out : String(text ?? '').trim();
};

export const splitArtists = (artist) =>
    String(artist ?? '')
        .split(/\/|、|,|，|;|；|\bfeat\.?\b|\bft\.?\b|\bwith\b|\bvs\.?\b|\bx\b|\&/i)
        .map((part) => normalizeText(part))
        .filter(Boolean);

// 歌手署名分隔符归一：平台把「A / B」写成「A、B」「A,B」「A；B」都见过，统一折成 / 再比。
// 只统一分隔符，不把组合拆成个人去封（组合条目按整体匹配，避免误封成员个人作品）。
const normalizeArtist = (artist) =>
    normalizeText(String(artist ?? '').replace(/、|,|，|;|；|&|＆/g, '/'));

const normTitle = (title) => normalizeText(stripParens(title));
const pairKey = (title, artist) => `${normTitle(title)}|${normalizeArtist(artist)}`;
const pairIdentity = (song) => `pair:${pairKey(song?.title, song?.artist)}`;
export const songIdentity = (song) =>
    song && song.source && song.id != null ? `id:${song.source}:${song.id}` : pairIdentity(song);

// ---------------------------------------------------------------- 排除簇

// pairMap：归一歌名 → 该歌名下被排除的歌手 token 集。比对按 token 交集而不是整串相等，
// 平台署名变体（合唱缺成员、分隔符不同）不至于漏掉整簇。
export const buildExclusionIndex = (exclusions = EXCLUSIONS) => {
    const pairMap = new Map();
    for (const item of exclusions.blockedSongs || []) {
        const title = normTitle(item.title);
        if (!title) continue;
        const tokens = pairMap.get(title) || new Set();
        splitArtists(item.artist).forEach((part) => tokens.add(part));
        pairMap.set(title, tokens);
    }
    return {
        artists: new Set((exclusions.blockedArtists || []).map(normalizeArtist)),
        pairMap,
    };
};

// 整簇排除：歌手名单直接命中（含合唱拆分、署名分隔变体），或「歌名+歌手 token 交集」命中
//（confirmed 与 suspected 一视同仁）。
export const isExcluded = (song, index) => {
    if (!song) return false;
    const artistNorm = normalizeArtist(song.artist);
    if (artistNorm && index.artists.has(artistNorm)) return true;
    const parts = splitArtists(song.artist);
    if (parts.some((part) => index.artists.has(part))) return true;
    const blocked = index.pairMap.get(normTitle(song.title));
    return !!blocked && parts.some((part) => blocked.has(part));
};

// ---------------------------------------------------------------- 候选解析

// 把 LLM 回答宽容地解析成 [{title, artist}]：剥围栏、截取首个数组、去尾逗号。
export const parseCandidates = (text) => {
    if (typeof text !== 'string') return [];
    let body = text.trim();
    const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fence) body = fence[1].trim();
    const start = body.indexOf('[');
    const end = body.lastIndexOf(']');
    if (start === -1 || end === -1 || end <= start) return [];
    const slice = body.slice(start, end + 1).replace(/,\s*([}\]])/g, '$1');
    let items;
    try {
        items = JSON.parse(slice);
    } catch {
        return [];
    }
    if (!Array.isArray(items)) return [];
    const out = [];
    for (const item of items) {
        if (!item || typeof item !== 'object') continue;
        const title = typeof item.title === 'string' ? item.title.trim() : typeof item.song === 'string' ? item.song.trim() : '';
        const artist = typeof item.artist === 'string' ? item.artist.trim() : typeof item.singer === 'string' ? item.singer.trim() : '';
        if (title && artist) out.push({ title, artist });
    }
    return out;
};

// 按「歌名+歌手」归一去重，并保持顺序。
export const dedupeCandidates = (candidates) => {
    const seen = new Set();
    const out = [];
    for (const cand of candidates || []) {
        const key = pairKey(cand.title, cand.artist);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ title: String(cand.title).trim(), artist: String(cand.artist).trim() });
    }
    return out;
};

// ---------------------------------------------------------------- 提示词

// 组装 system/user 提示词：画像 + 场景参数 + 已播避重 + 负反馈 + 排除歌手；要的歌比 batchSize 多要冗余量。
export const buildPrompt = ({ scene, history = [], profile = PROFILE, exclusions = EXCLUSIONS, extra = 8 }) => {
    const batchSize = scene.batchSize || 15;
    const count = batchSize + extra;
    const heard = history.filter((h) => h.v !== 'neg').slice(-AVOID_HISTORY);
    const skipped = history.filter((h) => h.v === 'neg').slice(-12);
    const liked = history.filter((h) => h.v === 'pos').slice(-12);
    const fmt = (h) => `${h.t} - ${h.a}`;
    const user = [
        `为「${scene.label}」场景选 ${count} 首歌，按播放顺序排列（我会再核验，所以宁多勿少，但最多 ${count} 首）。`,
        '',
        `【场景】${scene.label}：能量曲线「${scene.energyCurve}」；节奏「${scene.tempo}」；人声「${scene.vocalRatio}」；情绪：${(scene.mood || []).join('、')}。`,
        '',
        '【口味画像】' + profile.summary,
        `特质：${(profile.traits || []).join('；')}。`,
        `核心歌手：${(profile.coreSingers || []).join('、')}（不必只选他们，但他们是定调参照）。`,
        '',
        '【硬性规则】',
        `- 以下歌手永不出现：${(exclusions.blockedArtists || []).join('、')}。`,
        '- 只选真实存在、正式发行的版本；不要翻唱、Live、DJ 版、remix，除非场景特别说明。',
        '- 避免重复：歌与歌手都不要在一批里重复。',
        heard.length ? `- 这些歌最近放过，不要再选：${heard.map(fmt).join('；')}。` : '',
        skipped.length ? `- 这些歌被很快切走（不喜欢），不要再选类似气质的：${skipped.map(fmt).join('；')}。` : '',
        liked.length ? `- 这些歌被完整听完（喜欢），可接近其气质：${liked.map(fmt).join('；')}。` : '',
        '',
        '【输出】只输出一个 JSON 数组，无其他文字，元素为 {"title":"歌名","artist":"歌手"}。',
    ].filter((line) => line !== '').join('\n');
    const system = '你是私人电台的音乐编辑，按用户的口味画像和场景要求，从华语与优质流行全曲库中挑歌。只输出要求的 JSON，不解释。';
    return { system, user, count };
};

// ---------------------------------------------------------------- 核验匹配

// 标题分：3=归一化全等；2=候选无版本注记、结果剥括号后同名（如「红豆」对上「红豆(2023版)」）；
// 1=候选带版本注记、剥括号后同名（结果缺版本，弱匹配）；0=不同名。
export const titleScore = (candTitle, songTitle) => {
    const candFull = normalizeText(candTitle);
    const songFull = normalizeText(songTitle);
    if (!candFull || !songFull) return 0;
    if (candFull === songFull) return 3;
    const candBare = normalizeText(stripParens(candTitle));
    const songBare = normalizeText(stripParens(songTitle));
    if (candBare === songBare) {
        if (candBare === candFull) return 2;
        if (songBare === songFull) return 1;
    }
    return 0;
};

// 歌手分：拆分后有共同歌手记 1；候选每位歌手都在结果里（合唱全对上）记 2。翻唱者不同名则 0。
export const artistScore = (candArtist, songArtist) => {
    const candParts = splitArtists(candArtist);
    const songParts = new Set(splitArtists(songArtist));
    if (!candParts.length || !songParts.size) return 0;
    const hits = candParts.filter((part) => songParts.has(part)).length;
    if (hits === 0) return 0;
    return hits === candParts.length ? 2 : 1;
};

// 在搜索结果里挑「确切版本」：标题与歌手都必须过线，取综合分最高者。
// details 为可选的 availability 读取器（同步），taken-down 直接排除。
export const pickMatch = (candidate, items, describe) => {
    let best = null;
    let bestScore = 0;
    for (const song of items || []) {
        const t = titleScore(candidate.title, song.title);
        if (t === 0) continue;
        const a = artistScore(candidate.artist, song.artist);
        if (a === 0) continue;
        const availability = describe ? describe(song)?.availability : undefined;
        if (availability === 'taken-down') continue;
        const score = t * 10 + a + (availability === 'playable' ? 0.5 : availability === 'restricted' ? -0.5 : 0);
        if (score > bestScore) {
            best = song;
            bestScore = score;
        }
    }
    return best;
};

// ---------------------------------------------------------------- 听感反馈

// position/duration 秒：先判「听完」（≥85% 或距尾 ≤15s，短歌才不会播完还记负），
// 再判 <30s 切走→neg；其余→heard（记为听过，只喂避重）。
export const classifyListen = (position, duration) => {
    if (!Number.isFinite(position) || position < 0) return null;
    if (Number.isFinite(duration) && duration > 0 && position >= Math.max(duration * 0.85, duration - 15)) return 'pos';
    if (position < SKIP_SECONDS) return 'neg';
    return 'heard';
};

export const shouldContinue = (snapshot) =>
    !!snapshot && snapshot.kind === 'queue' && snapshot.currentIndex >= 0 && snapshot.length - snapshot.currentIndex - 1 <= CONTINUE_REMAINING;

// ---------------------------------------------------------------- 引擎

const emptyState = () => ({ history: [], batches: {} });

const clip = (list, limit) => (list.length > limit ? list.slice(list.length - limit) : list);

// deps: { fetch, omni, playback, storage, secrets, settings(), log, toast, sleep }
export const createRadio = (deps) => {
    const { omni, playback, storage, secrets, settings, log, toast } = deps;
    const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    const exclusionIndex = buildExclusionIndex(EXCLUSIONS);

    const state = {
        activeSceneId: null,
        generating: null,
        lastGenAt: 0,
        queuedKeys: new Set(),
        lastSong: null,
        lastPosition: 0,
        lastDuration: 0,
        contFails: 0,
        disposed: false,
    };

    const say = (message, type = 'info') => {
        if (state.disposed) return;
        try {
            toast?.(message, { type });
        } catch {
            /* toast 不可用就静默 */
        }
    };

    const loadState = async () => {
        const saved = await storage.get(STORAGE_KEY);
        if (saved && Array.isArray(saved.history) && saved.batches && typeof saved.batches === 'object') {
            return { history: saved.history, batches: saved.batches };
        }
        return emptyState();
    };

    // storage 在会话内只加载成功一次：之后所有读写走同一个内存对象再整体持久化，
    // 避免 load-modify-write 并发丢更新（songChanged 可能连续触发）。
    // 读失败不缓存 promise——下次调用重试；storeCache 为空时 persist 不落盘，
    // 不把瞬时空态盖掉已学的反馈与批次。
    let storeCache = null;
    let dataPromise = null;
    const data = () => {
        dataPromise ??= loadState()
            .then((loaded) => {
                storeCache = loaded;
                return loaded;
            })
            .catch((error) => {
                dataPromise = null;
                log?.warn?.('[ai-scene-radio] storage 读取失败', error);
                return emptyState();
            });
        return dataPromise;
    };
    const persist = async () => {
        if (!storeCache) return;
        try {
            await storage.set(STORAGE_KEY, storeCache);
        } catch (error) {
            log?.warn?.('[ai-scene-radio] storage 写入失败', error);
        }
    };

    // 存的是 {s,i,t,a} 四个字段：FoliumSong.ref 是会话句柄，禁止持久化。
    const portable = (song) => ({ s: song.source ?? null, i: song.id ?? null, t: song.title, a: song.artist });
    const resolvable = (entry) => entry.s && entry.i != null;

    const apiKey = async () => {
        try {
            const key = await secrets.get(SECRET_KEY);
            return typeof key === 'string' && key.trim() ? key.trim() : null;
        } catch (error) {
            log?.warn?.('[ai-scene-radio] 读取 API key 失败', error);
            return null;
        }
    };

    const callLlm = async ({ scene, history }) => {
        const key = await apiKey();
        if (!key) throw new Error('no-api-key');
        const conf = settings();
        const base = (String(conf.gatewayBase ?? '').trim() || DEFAULT_GATEWAY).replace(/\/+$/, '');
        const model = String(conf.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
        const prompt = buildPrompt({ scene, history });
        const response = await deps.fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`,
                'User-Agent': BROWSER_UA,
                Accept: 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: prompt.user },
                ],
                temperature: 0.9,
            }),
            timeoutMs: 45000,
        });
        if (!response.ok) throw new Error(`llm-http-${response.status}`);
        const payload = response.json();
        const text = payload?.choices?.[0]?.message?.content;
        const candidates = dedupeCandidates(parseCandidates(text));
        if (!candidates.length) throw new Error('llm-empty');
        return candidates;
    };

    const blockedKeys = (history, queueSongs) => {
        const keys = new Set();
        for (const h of history.slice(-AVOID_HISTORY)) keys.add(`pair:${pairKey(h.t, h.a)}`);
        for (const song of queueSongs || []) {
            keys.add(songIdentity(song));
            keys.add(pairIdentity(song));
        }
        return keys;
    };

    // 核验一条候选：搜「歌名 歌手」，挑确切版本，过排除簇，去重。返回可送播的 FoliumSong 或 null。
    const verifyOne = async (candidate, taken) => {
        const page = await omni.searchSongs(`${candidate.title} ${candidate.artist}`, { limit: SEARCH_LIMIT });
        const describe = (s) => {
            try {
                return omni.describeSong?.(s);
            } catch {
                return null;
            }
        };
        const song = pickMatch(candidate, page?.items, describe);
        if (!song || isExcluded(song, exclusionIndex)) return null;
        const keys = [songIdentity(song), pairIdentity(song)];
        if (keys.some((key) => taken.has(key))) return null;
        keys.forEach((key) => taken.add(key));
        return song;
    };

    const verifyBatch = async (candidates, taken, target) => {
        const out = [];
        let searched = 0;
        let failures = 0;
        for (const candidate of candidates) {
            if (out.length >= target) break;
            searched += 1;
            try {
                const song = await verifyOne(candidate, taken);
                if (song) out.push(song);
            } catch (error) {
                failures += 1;
                log?.warn?.('[ai-scene-radio] 核验搜索失败', error);
                // 搜索大面积失败基本是离线/平台挂了：再核验也是白费请求，提前判死走兜底。
                if (searched >= 5 && failures / searched >= VERIFY_FAIL_RATIO) throw new Error('verify-network');
            }
        }
        return out;
    };

    // replaceQueue 拒绝分类（契约：未知原因按 transition 处理——等下一条 queueChanged 放行）：
    // - transition / stage / 未知：automix 混合或外部占用，几秒内自愈，1.5s 一拍重试 ≤40s；
    // - stale-version：队列变了，下一轮重建再试；
    // - rate-limited：按 retryAfterMs 退避；
    // - stale-ref / not-queueable：index 指向坏歌，剔除后再试。
    // 前三类计数重试 ≤3 次，避免把瞬态误送进兜底链。
    const TRANSIENT_REFUSAL_MS = 40_000;
    const TRANSIENT_RETRY_MS = 1500;
    const HARD_RETRIES = 3;

    // getBatch() → {songs, version}，每轮重读；返回 null=读不出一致版本，{fatal}=直接放弃。
    const submitQueue = async (getBatch) => {
        let attempt = 0;
        let dropIndex = null;
        const deadline = Date.now() + TRANSIENT_REFUSAL_MS;
        for (;;) {
            const batch = getBatch();
            if (!batch) return { status: 'refused', reason: 'stale-version' };
            if (batch.fatal) return { status: 'refused', reason: batch.fatal };
            const songs = dropIndex == null ? batch.songs : batch.songs.filter((_, i) => i !== dropIndex);
            dropIndex = null;
            const result = await playback.replaceQueue(songs, { expectedVersion: batch.version });
            if (result.status === 'replaced') return result;
            const { reason } = result;
            if (reason === 'stale-version') {
                if (++attempt > HARD_RETRIES) return result;
                continue;
            }
            if (reason === 'rate-limited') {
                if (++attempt > HARD_RETRIES) return result;
                await sleep(result.retryAfterMs || 300);
                continue;
            }
            if ((reason === 'stale-ref' || reason === 'not-queueable') && result.index != null) {
                if (++attempt > HARD_RETRIES) return result;
                dropIndex = result.index;
                continue;
            }
            if (Date.now() >= deadline) return result;
            await sleep(TRANSIENT_RETRY_MS);
        }
    };

    // 整队送播：只借 getQueue 拿当前 version。
    const replaceWhole = (songs) =>
        submitQueue(() => ({ songs, version: playback.getQueue().version }));

    // getQueue 一页最多 500：续单要把旧队列整段保留时按页读全；
    // 任一页 version 变了说明队列中途被改，返回 null 让调用方重读。
    const readWholeQueue = () => {
        const first = playback.getQueue({ offset: 0, limit: 500 });
        const songs = first.items.map((item) => item.song);
        const { version, length } = first;
        for (let offset = songs.length; offset < length;) {
            const page = playback.getQueue({ offset, limit: 500 });
            if (page.version !== version || page.items.length === 0) return null;
            songs.push(...page.items.map((item) => item.song));
            offset += page.items.length; // 按实际页长推进，不假设每页满 500
        }
        return { songs, version, length };
    };

    // 续单：把新歌接在现有队列尾部，整体替换；保留正在播与未播的旧歌。
    // 队列 + 新歌超过 ref 池上限（5000）时放弃续单，不动现有队列。
    const appendQueue = (newSongs) =>
        submitQueue(() => {
            const whole = readWholeQueue();
            if (!whole) return null;
            if (whole.length + newSongs.length > 5000) return { fatal: 'too-long' };
            return { songs: [...whole.songs, ...newSongs], version: whole.version };
        });

    const rememberBatch = async (sceneId, songs) => {
        // id 键与 pair 键都存：overlap 判定对署名/来源变体多一层兜底。
        songs.forEach((song) => {
            state.queuedKeys.add(songIdentity(song));
            state.queuedKeys.add(pairIdentity(song));
        });
        (await data()).batches[sceneId] = songs.map(portable);
        await persist();
    };

    // 兜底链：① 该场景上次核验批次快照（resolveSongs 复活）；② 核心歌手降级生成；③ toast 指向同名歌单。
    const fallback = async (scene) => {
        const { batches } = await data();
        const saved = Array.isArray(batches[scene.id]) ? batches[scene.id].filter(resolvable) : [];
        if (saved.length) {
            try {
                const resolved = await omni.resolveSongs(saved.map(({ s, i }) => ({ source: s, id: String(i) })));
                const songs = resolved
                    .map((r) => (r && r.status === 'found' ? r.song : null))
                    .filter((song) => {
                        if (!song || isExcluded(song, exclusionIndex)) return false;
                        try {
                            return omni.describeSong?.(song)?.availability !== 'taken-down';
                        } catch {
                            return true;
                        }
                    });
                if (songs.length >= MIN_QUEUE_SONGS) {
                    const result = await replaceWhole(songs);
                    if (result.status === 'replaced') {
                        await playback.playQueueItem(0).catch(() => false);
                        songs.forEach((song) => {
                            state.queuedKeys.add(songIdentity(song));
                            state.queuedKeys.add(pairIdentity(song));
                        });
                        say(`生成失败，改播「${scene.label}」上次电台批次（${songs.length} 首）`, 'info');
                        log?.info?.(`[ai-scene-radio] fallback: replayed ${songs.length} saved songs for ${scene.id}`);
                        return true;
                    }
                }
            } catch (error) {
                log?.warn?.('[ai-scene-radio] 兜底批次解析失败', error);
            }
        }
        // 降级生成：核心歌手各取前排可播，同套排除/去重/避重；当前在播的歌也不重排。
        try {
            const { history } = await data();
            let currentSong = null;
            try {
                currentSong = playback.getState?.()?.song ?? null;
            } catch {
                currentSong = null;
            }
            const taken = blockedKeys(history, currentSong ? [currentSong] : []);
            const songs = [];
            for (const singer of PROFILE.coreSingers || []) {
                if (songs.length >= (scene.batchSize || 15)) break;
                try {
                    const page = await omni.searchSongs(singer, { limit: SEARCH_LIMIT });
                    for (const song of page?.items || []) {
                        if (songs.length >= (scene.batchSize || 15)) break;
                        if (isExcluded(song, exclusionIndex)) continue;
                        // 搜「王菲」回来的歌，歌手须真有她：挡掉同名/翻唱。
                        if (artistScore(singer, song.artist) === 0) continue;
                        let availability;
                        try {
                            availability = omni.describeSong?.(song)?.availability;
                        } catch {
                            availability = undefined;
                        }
                        if (availability === 'taken-down') continue;
                        const keys = [songIdentity(song), pairIdentity(song)];
                        if (keys.some((key) => taken.has(key))) continue;
                        keys.forEach((key) => taken.add(key));
                        songs.push(song);
                    }
                } catch (error) {
                    log?.warn?.('[ai-scene-radio] 降级搜索失败', error);
                }
            }
            if (songs.length >= MIN_QUEUE_SONGS) {
                const result = await replaceWhole(songs);
                if (result.status === 'replaced') {
                    await playback.playQueueItem(0).catch(() => false);
                    songs.forEach((song) => {
                        state.queuedKeys.add(songIdentity(song));
                        state.queuedKeys.add(pairIdentity(song));
                    });
                    say(`生成失败，改播核心歌手精选（${songs.length} 首）`, 'info');
                    log?.info?.(`[ai-scene-radio] fallback: degraded ${songs.length} songs for ${scene.id}`);
                    return true;
                }
            }
        } catch (error) {
            log?.warn?.('[ai-scene-radio] 降级兜底失败', error);
        }
        const manual = scene.fallbackPlaylist ? `请手动播放歌单「${scene.fallbackPlaylist}」` : '请手动选歌播放';
        say(`「${scene.label}」生成失败，${manual}`, 'error');
        return false;
    };

    // 生成+核验+送播的主链。continuation=true 时接在队列尾部，不打断当前播放。
    // 返回 'ok'（已送播，含兜底成功）/ 'busy'（生成中或冷却内，什么都没跑）/ 'fail'（兜底也救不回来）。
    const runScene = async (sceneId, { continuation = false } = {}) => {
        const scene = sceneById(sceneId);
        if (!scene || state.disposed) return 'fail';
        if (state.generating) return 'busy';
        const now = Date.now();
        if (now - state.lastGenAt < GENERATE_COOLDOWN_MS) return 'busy';
        state.lastGenAt = now;
        const prevSceneId = state.activeSceneId;
        state.generating = (async () => {
            if (!continuation) {
                state.activeSceneId = sceneId;
                say(`正在为「${scene.label}」生成电台…`);
            }
            try {
                const { history } = await data();
                // 新场景会整队替换，旧队列不占候选位；续单才需要避开仍在队里的歌。
                const queueSongs = continuation ? (readWholeQueue()?.songs ?? []) : [];
                const taken = blockedKeys(history, queueSongs);
                const candidates = await callLlm({ scene, history });
                const target = continuation ? Math.min(scene.batchSize || 15, candidates.length) : scene.batchSize || 15;
                const verified = await verifyBatch(candidates, taken, target);
                if (verified.length < MIN_QUEUE_SONGS) throw new Error('verify-empty');
                if (state.disposed) return 'fail';
                if (continuation) {
                    const result = await appendQueue(verified);
                    if (result.status !== 'replaced') throw new Error(`refused:${result.reason}`);
                    await rememberBatch(scene.id, verified);
                    log?.info?.(`[ai-scene-radio] continuation +${verified.length} for ${scene.id}`);
                } else {
                    const result = await replaceWhole(verified);
                    if (result.status !== 'replaced') throw new Error(`refused:${result.reason}`);
                    const started = await playback.playQueueItem(0).then((v) => v !== false, () => false);
                    await rememberBatch(scene.id, verified);
                    say(
                        started
                            ? `「${scene.label}」电台已开播（${verified.length} 首）`
                            : `「${scene.label}」电台已入队，点播放开始`,
                        'success',
                    );
                    log?.info?.(`[ai-scene-radio] queued ${verified.length} for ${scene.id}`);
                }
                state.contFails = 0;
                return 'ok';
            } catch (error) {
                log?.warn?.(`[ai-scene-radio] generate failed for ${scene.id}`, error);
                if (error?.message === 'no-api-key' && !continuation) {
                    say('未设置 API Key：设置 → 模组 → AI 场景电台 里填写后重试', 'error');
                }
                if (continuation) return 'fail';
                const rescued = await fallback(scene);
                if (!rescued) state.activeSceneId = prevSceneId; // 兜底也空：别把没开播的场景留下
                return rescued ? 'ok' : 'fail';
            }
        })();
        try {
            return await state.generating;
        } finally {
            state.generating = null;
        }
    };

    // queueChanged：队列里我们的歌全没了→停用电台；剩 ≤3 首→自动续单。
    // 续单连续失败 ≥3 次（如 too-long 必败）→ 停用，不无限烧 LLM 调用。
    const onQueueChanged = async () => {
        if (!state.activeSceneId || state.generating || state.disposed) return;
        let snapshot;
        try {
            snapshot = playback.getQueue();
        } catch {
            return;
        }
        if (!snapshot || snapshot.kind !== 'queue') {
            state.activeSceneId = null;
            return;
        }
        // getQueue 一页最多 500：页不满就直接用；看不全（长队列）就按页读全再判，
        // 否则电台歌在页外会被误判「还在」或「没了」。
        let queueSongs;
        if (snapshot.items.length === snapshot.length) {
            queueSongs = snapshot.items.map((item) => item.song);
        } else {
            const whole = readWholeQueue();
            if (!whole) return; // 翻页间 version 变了，等下一条 queueChanged 再判
            queueSongs = whole.songs;
        }
        const queuedMatch = (song) =>
            state.queuedKeys.has(songIdentity(song)) || state.queuedKeys.has(pairIdentity(song));
        if (queueSongs.filter(queuedMatch).length === 0) {
            if (state.queuedKeys.size) state.activeSceneId = null;
            return;
        }
        if (shouldContinue(snapshot)) {
            const result = await runScene(state.activeSceneId, { continuation: true });
            if (result === 'ok') {
                state.contFails = 0;
            } else if (result === 'fail' && ++state.contFails >= 3) {
                state.activeSceneId = null;
                state.contFails = 0;
                say('电台续单连续失败，已停止自动续播', 'error');
            }
        }
    };

    // songChanged：给上一首判读（neg/heard/pos）并写 history。
    // 位置快照与复位必须同步做：两次切歌挨得近时，await 之后才复位会把上一首的末尾位置记到下一首头上。
    const onSongChanged = async (song) => {
        if (state.disposed) return;
        const prev = state.lastSong;
        const position = state.lastPosition;
        const duration = state.lastDuration;
        state.lastSong = song ? { song } : null;
        state.lastPosition = 0;
        state.lastDuration = 0;
        if (prev?.song) {
            const verdict = classifyListen(position, duration);
            if (verdict) {
                const store = await data();
                store.history = clip([...store.history, {
                    ...portable(prev.song),
                    v: verdict,
                    sc: state.activeSceneId,
                    at: Date.now(),
                }], HISTORY_LIMIT);
                await persist();
                log?.info?.(`[ai-scene-radio] listen=${verdict} ${prev.song.title} - ${prev.song.artist}`);
            }
        }
    };

    // 由 client 每秒喂一次 getState() 的结果，维持「这首歌听到哪了」。
    const samplePosition = (snapshotState) => {
        if (!state.lastSong || state.disposed) return;
        state.lastPosition = snapshotState?.position ?? state.lastPosition;
        state.lastDuration = snapshotState?.duration ?? state.lastDuration;
    };

    const stop = () => {
        state.activeSceneId = null;
        state.contFails = 0;
    };

    // 模组停用后不再产生任何副作用：在途的生成读到 disposed 直接收手。
    const dispose = () => {
        state.disposed = true;
        state.activeSceneId = null;
    };

    return {
        scenes: sceneList,
        runScene,
        onQueueChanged,
        onSongChanged,
        samplePosition,
        stop,
        dispose,
        _state: state,
    };
};
