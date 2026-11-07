// mods/ai-scene-radio/radio.mjs
// AI 场景电台的核心逻辑：提示词组装、候选解析与核验、队列送播与续单、听感反馈、兜底链。
// 所有副作用都经 deps 注入（fetch/omni/playback/storage/secrets/settings/log/toast），
// client.mjs 接真宿主，tests/run.mjs 接 fake——本文件不直接碰 folium。

import { PROFILE, SCENES } from './configData.mjs';
import { SCENE_PROFILES } from './sceneBridge.mjs';

export const STORAGE_KEY = 'aiSceneRadio.v1';
export const DIAG_STORAGE_KEY = 'aiSceneRadio.diag.v1';
export const SECRET_KEY = 'apiKey';
export const DEFAULT_GATEWAY = 'https://trendxai.io/v1';
export const DEFAULT_MODEL = 'gpt-6-luna';
// Eric 2026-11-07 定：电台生成改走 gpt-6-luna＋推理档（网关字段 reasoning_effort）。原定 max 实测不可行：真实提示词在网关侧 126 秒被 Cloudflare 524 掐断、宿主 net.fetch 硬顶又是 60 秒；high 档实测 30.7 秒返回合格候选，为本链路可用的最高档（2026-11-07 组织者实测后改定）。
export const DEFAULT_REASONING_EFFORT = 'high';
// trendxai 网关躲在 Cloudflare 后面：无浏览器 UA 的请求会被 403（error 1010）拒绝。
export const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const SKIP_SECONDS = 30;
export const HISTORY_LIMIT = 300;
export const AVOID_HISTORY = 60;
export const CONTINUE_REMAINING = 3;
export const MIN_QUEUE_SONGS = 3;
// restore 接管下限：命中数、命中占比（≥2/3）双闸；存储的每场批次镜像上限。
export const RESTORE_MIN_MATCHES = 6;
export const BATCH_STORE_LIMIT = 60;
export const SEARCH_LIMIT = 8;
export const VERIFY_FAIL_RATIO = 0.6;
export const GENERATE_COOLDOWN_MS = 8000;
// 同一批兜底自上次成功生成起最多复活一次；续单连续失败上限（超上限停用自动续播）。
export const MAX_REVIVALS = 1;
export const CONT_FAIL_LIMIT = 3;
// 生成链失败环节：diag 落盘与停用 toast 共用一套名字。
const STAGE_LABELS = { llm: '生成', verify: '核验', queue: '送队', fallback: '兜底' };

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

// 两首 FoliumSong 是否同一首：id 键或 pair 键任一相等（署名/来源变体多一层兜底）。
const sameSong = (a, b) =>
    !!a && !!b && (songIdentity(a) === songIdentity(b) || pairIdentity(a) === pairIdentity(b));

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

// 组装 system/user 提示词：画像 + 场景参数 + 已播避重 + 负反馈；要的歌比 batchSize 多要冗余量。
// F9 起不再带排除名单：EXCLUSIONS 只是口味分析防画像混淆的工具，不是聆听禁令，符合画像的歌手照常可选。
export const buildPrompt = ({ scene, history = [], profile = PROFILE, extra = 8 }) => {
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
        '- 只选真实存在、正式发行的版本；不要翻唱、Live、DJ 版、remix，除非场景特别说明。',
        '- 避免重复：歌与歌手都不要在一批里重复。',
        '- 语种构成：英文歌约占四分之一（本批至少 5 首），按画像的英文位口径选；历史列表里英文少只是存量，不代表偏好。',
        '- 年代构成：至少 4 首为 2019 年以后发行的新歌（华语、英文都算）；不要整批都是 2010 年以前的老歌。',
        heard.length ? `- 这些歌最近放过，不要再选：${heard.map(fmt).join('；')}。` : '',
        skipped.length ? `- 这些歌被很快切走（不喜欢），不要再选类似气质的：${skipped.map(fmt).join('；')}。` : '',
        liked.length ? `- 这些歌被完整听完（喜欢），可接近其气质：${liked.map(fmt).join('；')}。` : '',
        '',
        '【输出】只输出一个 JSON 数组，无其他文字，元素为 {"title":"歌名","artist":"歌手"}。',
    ].filter((line) => line !== '').join('\n');
    const system = '你是私人电台的音乐编辑，按用户的口味画像和场景要求，从华语与欧美优质流行全曲库中挑歌。只输出要求的 JSON，不解释。';
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

const emptyState = () => ({ history: [], batches: {}, revivals: {} });

const clip = (list, limit) => (list.length > limit ? list.slice(list.length - limit) : list);

// deps: { fetch, omni, playback, storage, secrets, settings(), log, toast, sleep }
export const createRadio = (deps) => {
    const { omni, playback, storage, secrets, settings, log, toast, audioFx, playlistSync } = deps;
    const sleep = deps.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

    const state = {
        activeSceneId: null,
        generating: null,
        lastGenAt: 0,
        queuedKeys: new Set(),
        lastSong: null,
        lastPosition: 0,
        lastDuration: 0,
        contFails: 0,
        lastFail: null,
        disposed: false,
        // 接管武装（F15）：真机 activate 早于宿主队列水化，restore 此刻读到的常是
        // 空队或 getQueue 直接抛错（host actions 未注册）——读不出不判死。武装保留
        // 期间每条 queueChanged 重试接管；电台一旦以任何方式激活（restore 接管或
        // runScene 开播）、手动停、连败停用、模组停用时解除，电台生命周期已终结后
        // 不再复活接管。
        restoreArmed: true,
        // 武装期内首次读不出队列记一条日志（只记一次）：真机排查要靠它确认武装还在等。
        restoreMissLogged: false,
    };

    const say = (message, type = 'info') => {
        if (state.disposed) return;
        try {
            toast?.(message, { type });
        } catch {
            /* toast 不可用就静默 */
        }
    };
    const clearAudioProfile = () => {
        if (audioFx) void audioFx.clearProfile().catch(error => log?.warn?.('[ai-scene-radio] clear profile failed', error));
    };
    const applyAudioProfile = (sceneId) => {
        if (audioFx && settings()?.linkAudioFx !== false) {
            void audioFx.applyProfile(SCENE_PROFILES[sceneId]).catch(error => log?.warn?.('[ai-scene-radio] profile failed', error));
        } else {
            clearAudioProfile();
        }
    };

    const loadState = async () => {
        const saved = await storage.get(STORAGE_KEY);
        if (saved && Array.isArray(saved.history) && saved.batches && typeof saved.batches === 'object') {
            return {
                history: saved.history,
                batches: saved.batches,
                batchCovers: saved.batchCovers && typeof saved.batchCovers === 'object' && !Array.isArray(saved.batchCovers)
                    ? saved.batchCovers
                    : {},
                revivals: saved.revivals && typeof saved.revivals === 'object' && !Array.isArray(saved.revivals)
                    ? saved.revivals
                    : {},
            };
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

    // 诊断落盘：每次失败的生成尝试记一条（mod-data.json 可直接读），真生成成功时清零。
    const recordDiag = async (sceneId, stage, error) => {
        try {
            await storage.set(DIAG_STORAGE_KEY, {
                at: Date.now(),
                scene: sceneId,
                stage,
                error,
                consecutiveFails: state.contFails,
            });
        } catch (diagError) {
            log?.warn?.('[ai-scene-radio] diag 写入失败', diagError);
        }
    };
    const clearDiag = async () => {
        try {
            await storage.delete(DIAG_STORAGE_KEY);
        } catch (error) {
            log?.warn?.('[ai-scene-radio] diag 清除失败', error);
        }
    };

    // 存的是 {s,i,t,a} 四个字段：FoliumSong.ref 是会话句柄，禁止持久化。
    // withCover 时附首曲封面 `c`（describeSong 同步取，没有就不写字段）——批次条目带封面
    // 供场景卡二档封面用；旧存档没有 c，读取侧跳过即可。听感 history 不需要封面。
    const portable = (song, withCover = false) => {
        const entry = { s: song.source ?? null, i: song.id ?? null, t: song.title, a: song.artist };
        if (withCover) {
            let cover = null;
            try {
                cover = omni.describeSong?.(song)?.coverUrl ?? null;
            } catch {
                cover = null;
            }
            if (cover) entry.c = cover;
        }
        return entry;
    };
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
        const reasoningEffort = String(conf.reasoningEffort ?? '').trim() || DEFAULT_REASONING_EFFORT;
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
                ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
                messages: [
                    { role: 'system', content: prompt.system },
                    { role: 'user', content: prompt.user },
                ],
                temperature: 0.9,
            }),
            timeoutMs: 60000,
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

    // 核验一条候选：搜「歌名 歌手」，挑确切版本，去重。返回可送播的 FoliumSong 或 null。
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
        if (!song) return null;
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

    // 队列里的歌是否还是本电台排进去的：续单/兜底用它判队列归属，id 键与 pair 键都认。
    const queuedMatch = (song) =>
        state.queuedKeys.has(songIdentity(song)) || state.queuedKeys.has(pairIdentity(song));

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
    // 模组停用后不再送队：循环每轮复查 disposed，瞬态重试也不会在停用后改写队列。
    const submitQueue = async (getBatch) => {
        let attempt = 0;
        let dropIndex = null;
        const deadline = Date.now() + TRANSIENT_REFUSAL_MS;
        for (;;) {
            if (state.disposed) return { status: 'refused', reason: 'disposed' };
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

    // 升级链专用（续单失败后的整队补锅）：整队换掉队列是重操作，生成窗口内
    // 队列可能已被用户接管——送队每轮复查归属，别人的队或读不出就放弃。
    const replaceWholeGuarded = (songs) =>
        submitQueue(() => {
            if (!queueOpenForEscalation()) return { fatal: 'queue-taken-over' };
            try {
                return { songs, version: playback.getQueue().version };
            } catch {
                return null;
            }
        });

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
    // 生成窗口内队列可能漂移：已排空或电台歌全被换掉时不再追加——前者升级整队补锅，
    // 后者是用户接管，不能把电台歌塞进别人的队列。
    const appendQueue = (newSongs) =>
        submitQueue(() => {
            const whole = readWholeQueue();
            if (!whole) return null;
            if (whole.length === 0) return { fatal: 'queue-empty' };
            if (!whole.songs.some(queuedMatch)) return { fatal: 'queue-taken-over' };
            if (whole.length + newSongs.length > 5000) return { fatal: 'too-long' };
            return { songs: [...whole.songs, ...newSongs], version: whole.version };
        });

    // 登记一批已入队的歌：id 键与 pair 键都存，overlap 判定对署名/来源变体多一层兜底。
    // reset=true 用于整队替换路径——旧批次的键一并清掉，否则历史键会把
    // 用户自己排的队列误判成电台的（续单追加/升级闸都靠它判归属）。
    const markQueued = (songs, reset = false) => {
        if (reset) state.queuedKeys.clear();
        songs.forEach((song) => {
            state.queuedKeys.add(songIdentity(song));
            state.queuedKeys.add(pairIdentity(song));
        });
    };

    const rememberBatch = async (sceneId, songs, reset = false) => {
        markQueued(songs, reset);
        const store = await data();
        // 续单存整场累积镜像：restore 的命中分母是整个队列，只存最后一截会在续过一次单后
        // 永远达不到接管线（F11）。旧批次 + 本次追加按播放顺序接；上限留最近 BATCH_STORE_LIMIT 首。
        // 不用 readWholeQueue 镜像：队列里可能混着用户歌，镜像会把它们记进批次、稀释 F12 的归属判定。
        // reset（首批/整队替换）照旧只存当批。
        const previous = reset ? [] : (Array.isArray(store.batches[sceneId]) ? store.batches[sceneId] : []);
        const entries = songs.map((song) => portable(song, true));
        store.batches[sceneId] = clip([...previous, ...entries], BATCH_STORE_LIMIT);
        // 「最近批次首曲封面」单记一档：镜像批界丢失后 batches[0] 是最旧留存首曲，不是最近批的。
        if (entries[0]?.c) store.batchCovers = { ...(store.batchCovers || {}), [sceneId]: entries[0].c };
        // 新批次生成成功：该场景的兜底复活额度重新计。
        store.revivals = { ...(store.revivals || {}), [sceneId]: 0 };
        await persist();
        try {
            deps.onBatchStored?.(sceneId);
        } catch {
            /* 封面刷新之类的旁路钩子挂了不影响主链 */
        }
    };

    // 兜底链：持有的场景歌单 → v1 批次快照 → 核心歌手降级 → 提示手动播。
    // 歌单与快照都是「重播同一批」：自上次成功生成起一场景最多复活一次，用尽直接报错，
    // 不静默重放第二遍（F10）。降级腿出新歌不算复活。
    // quiet 时整条链照常跑但不出声（F14：升级路径的唯一出口是 disableRadio / 静默停用，
    // 否则失败会双 toast，被接管时还会弹与事实相反的「生成失败」）。
    const fallback = async (scene, stage, sendWhole = replaceWhole, quiet = false) => {
        if (state.disposed) return false;
        const tell = quiet ? () => {} : say;
        const store = await data();
        const stageLabel = STAGE_LABELS[stage] || stage || '生成';
        if ((store.revivals?.[scene.id] ?? 0) >= MAX_REVIVALS) {
            tell(`「${scene.label}」生成失败（${stageLabel}环节），该场景兜底已重播过一遍，不再重放`, 'error');
            return false;
        }
        const noteRevival = async () => {
            store.revivals = { ...(store.revivals || {}), [scene.id]: (store.revivals?.[scene.id] ?? 0) + 1 };
            await persist();
        };
        if (playlistSync) {
            const tracks = await playlistSync.tracks(scene);
            if (tracks.length) {
                try {
                    const resolved = await omni.resolveSongs(tracks.filter(track => track.source === 'qq').map(({ source, id }) => ({ source, id })));
                    const songs = resolved.map(item => item?.status === 'found' ? item.song : null)
                        .filter(song => song && omni.describeSong?.(song)?.availability !== 'taken-down');
                    if (songs.length >= MIN_QUEUE_SONGS) {
                        const result = await sendWhole(songs);
                        if (result.status === 'replaced') {
                            if (state.disposed) return false;
                            const started = await playback.playQueueItem(0).then(value => value !== false, () => false);
                            markQueued(songs, true);
                            if (started) applyAudioProfile(scene.id);
                            await noteRevival();
                            tell(`生成失败，改播「${scene.label}」场景歌单（${songs.length} 首）`);
                            return true;
                        }
                    }
                } catch (error) {
                    log?.warn?.('[ai-scene-radio] playlist fallback failed', error);
                }
            }
        }
        // 镜像是多批累积（F11，上限 60）：只重播「上一批」——取末尾 batchSize 条再滤可解析项；
        // 不整镜送 resolveSongs，一是会回放整场而非上次批次，二是超 50 keys 契约直接抛错。
        const saved = Array.isArray(store.batches[scene.id])
            ? store.batches[scene.id].slice(-Math.min(scene.batchSize || 15, 50)).filter(resolvable)
            : [];
        if (saved.length) {
            try {
                const resolved = await omni.resolveSongs(saved.map(({ s, i }) => ({ source: s, id: String(i) })));
                const songs = resolved
                    .map((r) => (r && r.status === 'found' ? r.song : null))
                    .filter((song) => {
                        if (!song) return false;
                        try {
                            return omni.describeSong?.(song)?.availability !== 'taken-down';
                        } catch {
                            return true;
                        }
                    });
                if (songs.length >= MIN_QUEUE_SONGS) {
                    const result = await sendWhole(songs);
                    if (result.status === 'replaced') {
                        if (state.disposed) return false;
                        const started = await playback.playQueueItem(0).then(value => value !== false, () => false);
                        markQueued(songs, true);
                        await noteRevival();
                        tell(`生成失败，改播「${scene.label}」上次电台批次（${songs.length} 首）`, 'info');
                        log?.info?.(`[ai-scene-radio] fallback: replayed ${songs.length} saved songs for ${scene.id}`);
                        if (started) applyAudioProfile(scene.id);
                        return true;
                    }
                }
            } catch (error) {
                log?.warn?.('[ai-scene-radio] 兜底批次解析失败', error);
            }
        }
        // 降级生成：核心歌手各取前排可播，同套去重/避重；当前在播的歌也不重排。
        try {
            let currentSong = null;
            try {
                currentSong = playback.getState?.()?.song ?? null;
            } catch {
                currentSong = null;
            }
            const taken = blockedKeys(store.history, currentSong ? [currentSong] : []);
            const songs = [];
            for (const singer of PROFILE.coreSingers || []) {
                if (songs.length >= (scene.batchSize || 15)) break;
                try {
                    const page = await omni.searchSongs(singer, { limit: SEARCH_LIMIT });
                    for (const song of page?.items || []) {
                        if (songs.length >= (scene.batchSize || 15)) break;
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
                const result = await sendWhole(songs);
                if (result.status === 'replaced') {
                    if (state.disposed) return false;
                    const started = await playback.playQueueItem(0).then(value => value !== false, () => false);
                    markQueued(songs, true);
                    tell(`生成失败，改播核心歌手精选（${songs.length} 首）`, 'info');
                    log?.info?.(`[ai-scene-radio] fallback: degraded ${songs.length} songs for ${scene.id}`);
                    if (started) applyAudioProfile(scene.id);
                    return true;
                }
            }
        } catch (error) {
            log?.warn?.('[ai-scene-radio] 降级兜底失败', error);
        }
        const manual = scene.fallbackPlaylist ? `请手动播放歌单「${scene.fallbackPlaylist}」` : '请手动选歌播放';
        tell(`「${scene.label}」生成失败（${stageLabel}环节），${manual}`, 'error');
        return false;
    };

    // 生成+核验+送播的主链。continuation=true 时接在队列尾部，不打断当前播放；
    // force 跳过冷却（续单升级成整队用，一轮只允许一次）；guard=true 走带归属复检的
    // 整队送队（升级链，生成窗口内用户接管就放弃，绝不抢队）；quiet=true 时失败侧不出声
    // （升级链用：兜底腿照跑，但终局与救回提示都静默，出口交给调用方——F14）；
    // resumePlay 标记触发时电台还在播——追加落地后若已 stopped 且显示歌仍是追加前队尾，
    // 视为自然播完从第一首新歌接起（F13：用户在窗口内按停/换了歌不算，不替他拉回）。
    // 每次尝试按阶段打标写 diag：真生成成功清零，任何失败 +1（含兜底救回）。
    // 返回 'ok'（已送播，含兜底成功）/ 'busy'（生成中或冷却内，什么都没跑）/ 'fail'（兜底也救不回来）。
    const runScene = async (sceneId, { continuation = false, force = false, guard = false, resumePlay = false, quiet = false } = {}) => {
        const scene = sceneById(sceneId);
        if (!scene || state.disposed) return 'fail';
        if (state.generating) return 'busy';
        const now = Date.now();
        if (!force && now - state.lastGenAt < GENERATE_COOLDOWN_MS) return 'busy';
        state.lastGenAt = now;
        const prevSceneId = state.activeSceneId;
        const sendWhole = guard ? replaceWholeGuarded : replaceWhole;
        state.generating = (async () => {
            if (!continuation) {
                state.activeSceneId = sceneId;
                // F15：电台经显式开播激活，接管武装同步终结（spec 停试条件含「用户点卡」）——
                // 否则弃用电台后再放已存批次主体（如模组存的场景歌单）会被无动作复活接管。
                state.restoreArmed = false;
                say(`正在为「${scene.label}」生成电台…`);
            }
            let stage = 'llm';
            try {
                const { history } = await data();
                // 新场景会整队替换，旧队列不占候选位；续单才需要避开仍在队里的歌。
                const queueSongs = continuation ? (readWholeQueue()?.songs ?? []) : [];
                const taken = blockedKeys(history, queueSongs);
                const candidates = await callLlm({ scene, history });
                stage = 'verify';
                const target = continuation ? Math.min(scene.batchSize || 15, candidates.length) : scene.batchSize || 15;
                const verified = await verifyBatch(candidates, taken, target);
                if (verified.length < MIN_QUEUE_SONGS) throw new Error('verify-empty');
                if (state.disposed) return 'fail';
                stage = 'queue';
                if (continuation) {
                    const result = await appendQueue(verified);
                    if (result.status !== 'replaced') throw new Error(`refused:${result.reason}`);
                    if (state.disposed) return 'fail';
                    await rememberBatch(scene.id, verified);
                    if (settings()?.savePlaylists !== false) playlistSync?.save(scene, verified);
                    // 触发时还在播、追加落地却已 stopped：可能是自然播完，也可能是用户
                    // 在生成窗口内按停。只在能证明是自然耗尽时补播（F13）——宿主队列自然
                    // 播完停在队尾、显示歌不动（stopAtQueueEnd 只置 IDLE 不清 currentSong），
                    // replaceQueue 也不碰在播侧：落地时 stopped 且显示歌仍是追加前队尾
                    // 那一首才算。按停在中间某首、换歌或歌已 null 都不算，不替他拉回。
                    if (resumePlay) {
                        try {
                            const now = playback.getState?.();
                            const tailIndex = result.length - verified.length - 1; // 追加前队尾在新队里的位置
                            const tailSong = tailIndex >= 0
                                ? playback.getQueue?.({ offset: tailIndex, limit: 1 })?.items?.[0]?.song
                                : null;
                            if (now?.state === 'stopped' && sameSong(now.song, tailSong)) {
                                const firstNew = tailIndex + 1;
                                // expectedRef 钉住新批首曲：判别到播放之间队列若被插入过，播错位置不如不播。
                                const resumed = await playback.playQueueItem(firstNew, verified[0]?.ref).then((v) => v !== false, () => false);
                                if (!resumed) log?.warn?.(`[ai-scene-radio] 续单补播被宿主拒绝 index=${firstNew}`);
                            }
                        } catch (resumeError) {
                            log?.warn?.('[ai-scene-radio] 续单补开播失败', resumeError);
                        }
                    }
                    log?.info?.(`[ai-scene-radio] continuation +${verified.length} for ${scene.id}`);
                } else {
                    const result = await sendWhole(verified);
                    if (result.status !== 'replaced') throw new Error(`refused:${result.reason}`);
                    if (state.disposed) return 'fail';
                    const started = await playback.playQueueItem(0).then((v) => v !== false, () => false);
                    if (started) applyAudioProfile(scene.id);
                    await rememberBatch(scene.id, verified, true);
                    if (settings()?.savePlaylists !== false) playlistSync?.save(scene, verified);
                    say(
                        started
                            ? `「${scene.label}」电台已开播（${verified.length} 首）`
                            : `「${scene.label}」电台已入队，点播放开始`,
                        'success',
                    );
                    log?.info?.(`[ai-scene-radio] queued ${verified.length} for ${scene.id}`);
                }
                state.contFails = 0;
                state.lastFail = null;
                await clearDiag();
                return 'ok';
            } catch (error) {
                const summary = String(error?.message || error).slice(0, 300);
                state.contFails += 1;
                state.lastFail = { scene: scene.id, stage, message: summary };
                log?.warn?.(`[ai-scene-radio] generate failed for ${scene.id} at ${stage}`, error);
                if (error?.message === 'no-api-key' && !continuation && !quiet) {
                    say('未设置 API Key：设置 → 模组 → AI 场景电台 里填写后重试', 'error');
                }
                if (continuation) {
                    await recordDiag(scene.id, stage, summary);
                    return 'fail';
                }
                const rescued = await fallback(scene, stage, sendWhole, quiet).catch((fallbackError) => {
                    log?.warn?.('[ai-scene-radio] fallback threw', fallbackError);
                    return false;
                });
                // 兜底耗尽时 stage 记 fallback、error 保留原始环节:message，根因不丢。
                await recordDiag(scene.id, rescued ? stage : 'fallback', rescued ? summary : `${stage}:${summary}`);
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

    // 停用电台：清场景、清音效、报可见错误（带最后一次失败的环节）。
    const disableRadio = (sceneId) => {
        const scene = sceneById(sceneId);
        const stage = state.lastFail?.scene === sceneId ? state.lastFail.stage : null;
        state.activeSceneId = null;
        state.contFails = 0;
        state.restoreArmed = false; // 停用是终局：下一条 queueChanged 不得再把它接管回来
        clearAudioProfile();
        say(
            `「${scene?.label ?? sceneId}」电台生成失败（${STAGE_LABELS[stage] || '生成'}环节），已停止自动续播`,
            'error',
        );
    };

    // queueChanged：队列里我们的歌全没了→停用电台；剩 ≤3 首→自动续单。
    // 续单失败升级一次整队新生成（等同手动点卡）；整队也败或连败到顶 → 停用报可见错误（F10）。
    const onQueueChanged = async () => {
        if (state.disposed) return;
        // 电台还没接管（F15）：activate 早于队列水化，restore 当时读不到批次队列；
        // 之后每条 queueChanged 重试接管，直到接管（restore 末尾接着做续单判定）、
        // 用户点了场景卡（activeSceneId 置位使 restore 短路）、或武装被解除。
        if (!state.activeSceneId) {
            if (state.restoreArmed && !state.generating) {
                try {
                    await restore();
                } catch (error) {
                    log?.warn?.('[ai-scene-radio] restore retry failed', error);
                }
            }
            return;
        }
        if (state.generating) return;
        let snapshot;
        try {
            snapshot = playback.getQueue();
        } catch {
            return;
        }
        if (!snapshot || snapshot.kind !== 'queue') {
            state.activeSceneId = null;
            clearAudioProfile();
            return;
        }
        // getQueue 一页最多 500：页不满就直接用；看不全（长队列）就按页读全再判，
        // 否则电台歌在页外会被误判「还在」或「没了」。
        let queueSongs;
        if (!Array.isArray(snapshot.items)) return;
        if (snapshot.items.length === snapshot.length) {
            queueSongs = snapshot.items.map((item) => item.song);
        } else {
            let whole = null;
            try {
                whole = readWholeQueue();
            } catch {
                return; // 读页异常：等下一条 queueChanged 再判
            }
            if (!whole) return; // 翻页间 version 变了，等下一条 queueChanged 再判
            queueSongs = whole.songs;
        }
        if (queueSongs.filter(queuedMatch).length === 0) {
            if (state.queuedKeys.size) {
                state.activeSceneId = null;
                clearAudioProfile();
            }
            return;
        }
        if (shouldContinue(snapshot)) {
            const sceneId = state.activeSceneId;
            if (state.contFails >= CONT_FAIL_LIMIT) {
                disableRadio(sceneId);
                return;
            }
            let preState = null;
            try {
                preState = playback.getState?.()?.state ?? null;
            } catch {
                preState = null;
            }
            const result = await runScene(sceneId, { continuation: true, resumePlay: preState === 'playing' });
            if (result === 'fail') {
                // 升级整队会把队列整个换掉：先复查归属。生成窗口内队列被用户接管或读不出时，
                // 与「电台歌全没了」同语义——静默停用，绝不抢队；队列已排空才允许整队补锅。
                if (!queueOpenForEscalation()) {
                    state.activeSceneId = null;
                    clearAudioProfile();
                    return;
                }
                const escalated = await runScene(sceneId, { force: true, guard: true, quiet: true });
                if (escalated === 'fail' || state.contFails >= CONT_FAIL_LIMIT) {
                    // 升级窗口内被接管（生成或兜底腿期间都算）：用户已夺回队列，
                    // 静默停用不弹错（不抢队红线，F14）。
                    if (state.lastFail?.message === 'refused:queue-taken-over' || queueTakenOverByUser()) {
                        state.activeSceneId = null;
                        clearAudioProfile();
                        return;
                    }
                    disableRadio(sceneId);
                }
            }
        }
    };

    // 当前队列的歌整队读出（页不满直接用、看不全按页读全）；读不出一致版本给 null。
    const queueSongsNow = () => {
        try {
            const snap = playback.getQueue();
            if (!snap || snap.kind !== 'queue') return null;
            if (Array.isArray(snap.items) && snap.items.length === snap.length) {
                return snap.items.map((item) => item.song);
            }
            return readWholeQueue()?.songs ?? null;
        } catch {
            return null;
        }
    };

    // 队列已被用户接管：非空、是 queue、且一首电台歌都不剩。
    const queueTakenOverByUser = () => {
        const songs = queueSongsNow();
        return !!songs?.length && !songs.some(queuedMatch);
    };

    // 升级/受检整队送队是否安全：队列已排空 → true（spec：排空被拒升级整队补锅）；
    // 仍是电台的歌且还在播 → true；是用户的队、fm/stage、已 paused/stopped
    // （用户自己停/暂停，不强插）、或读不出来 → false（盲换会抢队）。
    const queueOpenForEscalation = () => {
        const songs = queueSongsNow();
        if (!songs) return false;
        if (!songs.length) return true;
        if (!songs.some(queuedMatch)) return false;
        try {
            return playback.getState?.()?.state === 'playing';
        } catch {
            return false;
        }
    };

    // 激活恢复：停用→启用或 App 重启后内存态全丢，若当前队列主体等于某场景已存批次，
    // 恢复该场景为 activeSceneId 并重建 queuedKeys，在播批次重新获得自动续单（F10）。
    // F15：读队列走与续单相同的整队路径 queueSongsNow——激活时点 getQueue 常抛错或
    // 返回空队（host actions 未注册、水化未完成），null/空不判死，armed 保留，
    // 由 onQueueChanged 在未接管时逐条重试本函数；接管成功或解除武装后不再进。
    const restore = async () => {
        if (state.disposed || state.activeSceneId || !state.restoreArmed) return;
        const queueSongs = queueSongsNow();
        if (!queueSongs?.length) {
            if (!state.restoreMissLogged) {
                state.restoreMissLogged = true;
                log?.info?.('[ai-scene-radio] restore: queue unreadable/empty; staying armed for queueChanged retry');
            }
            return;
        }
        // 记下读队版本：await data() 期间队列若被改，手上快照过期——按旧队接管会往
        // 用户新队尾续歌。版本不一致就放弃本次，队列变化自己已派发 queueChanged 会重评。
        let versionAtRead = null;
        try {
            versionAtRead = playback.getQueue()?.version ?? null;
        } catch {
            versionAtRead = null;
        }
        const { batches } = await data();
        if (state.disposed || state.activeSceneId || !state.restoreArmed) return; // await 期间用户已自行操作
        let versionNow = null;
        try {
            versionNow = playback.getQueue()?.version ?? null;
        } catch {
            return; // 连版本都读不出：下次事件再判
        }
        if (versionNow !== versionAtRead) return;
        let best = null;
        for (const sceneId of Object.keys(batches)) {
            const entries = Array.isArray(batches[sceneId]) ? batches[sceneId] : [];
            if (!entries.length || !sceneById(sceneId)) continue;
            const keys = new Set();
            for (const entry of entries) {
                if (entry?.s && entry.i != null) keys.add(`id:${entry.s}:${entry.i}`);
                keys.add(`pair:${pairKey(entry?.t, entry?.a)}`);
            }
            const matches = queueSongs.filter(
                (song) => keys.has(songIdentity(song)) || keys.has(pairIdentity(song)),
            );
            if (!best || matches.length > best.matches.length) best = { sceneId, matches, keys };
        }
        // 「主体」判定（F12）：命中 ≥RESTORE_MIN_MATCHES、占队列 ≥2/3，且显示歌（若有）
        // 属于该批次的身份集——三条齐备才接管。用户自排 3–6 首小队列碰巧重合几首，
        // 或正在播自己的歌，都不得被接管（接管会改音效、队尾还会往里续歌）。
        if (!best
            || best.matches.length < RESTORE_MIN_MATCHES
            || best.matches.length * 3 < queueSongs.length * 2) return;
        let shown = null;
        try {
            shown = playback.getState?.()?.song ?? null;
        } catch {
            shown = null;
        }
        if (shown && !best.keys.has(songIdentity(shown)) && !best.keys.has(pairIdentity(shown))) return;
        state.activeSceneId = best.sceneId;
        state.restoreArmed = false; // 接管定案：之后 queueChanged 不再重试本函数
        for (const key of best.keys) state.queuedKeys.add(key);
        for (const song of best.matches) {
            state.queuedKeys.add(songIdentity(song));
            state.queuedKeys.add(pairIdentity(song));
        }
        log?.info?.(`[ai-scene-radio] restored scene ${best.sceneId} (${best.matches.length}/${queueSongs.length} queued)`);
        applyAudioProfile(best.sceneId); // 恢复的场景与开播场景同权，联动音效一并接上
        await onQueueChanged(); // 队尾场景立刻续单
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
        state.restoreArmed = false; // 用户手动停了续播：同样不复活接管
        clearAudioProfile();
    };

    // 模组停用后不再产生任何副作用：在途的生成读到 disposed 直接收手。
    const dispose = () => {
        state.disposed = true;
        state.activeSceneId = null;
        state.restoreArmed = false;
        playlistSync?.dispose?.();
        clearAudioProfile();
    };

    return {
        scenes: sceneList,
        runScene,
        onQueueChanged,
        onSongChanged,
        samplePosition,
        restore,
        stop,
        clearAudioProfile,
        dispose,
        _state: state,
    };
};
