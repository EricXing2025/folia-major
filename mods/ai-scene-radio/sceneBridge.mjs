// Optional v2 Folium bridge: profiles and QQ playlist writes stay independent of playback.

export const PLAYLIST_IDS_KEY = 'aiSceneRadio.playlistIds.v1';
const CREATION_PENDING = 'pending';
export const SCENE_PROFILES = Object.freeze({
    work: { bandsDb: [0, 1, 0, 1, 3, 3, 2, 1, 1, 0], lowCutHz: 60, highCutHz: 20000, compressorPct: 40, widthPct: 90, reverbPct: 5 },
    reading: { bandsDb: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0], lowCutHz: 30, highCutHz: 16000, compressorPct: 15, widthPct: 80, reverbPct: 0 },
    free: { bandsDb: [1, 3, 2, 1, 2, 2, 1, 1, 0, 0], lowCutHz: 40, highCutHz: 20000, compressorPct: 30, widthPct: 100, reverbPct: 0 },
});

export const playlistTitle = (scene) => `AI 电台 · ${scene.label}`;

export const createScenePlaylistSync = ({ library, storage, log, activeSource, accountKey, onSaved }) => {
    let pending = Promise.resolve();
    let disposed = false;
    const read = async () => {
        const value = await storage.get(PLAYLIST_IDS_KEY);
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    };
    const owned = async (scene) => {
        const key = accountKey?.();
        if (disposed || !library || activeSource?.() !== 'qq' || !key) return null;
        const ids = (await read())[key] ?? {};
        const id = ids[scene.id];
        if (typeof id !== 'string' || !id || id === CREATION_PENDING) return null;
        const found = (await library.listPlaylists()).find(item => item.id === id && item.title === playlistTitle(scene));
        return accountKey?.() === key && activeSource?.() === 'qq' && !disposed ? found ?? null : null;
    };
    const save = (scene, songs) => {
        try {
            if (disposed || !library || activeSource?.() !== 'qq' || !accountKey?.()
                || !songs.length || songs.some(song => song.source !== 'qq')) return;
        } catch (error) {
            // Export contexts and a stopped host can throw before the first promise is made.
            log?.warn?.('[ai-scene-radio] playlist write skipped', error);
            return;
        }
        // Serialize per mod: overlapping batches cannot create two playlists or overwrite newer storage.
        pending = pending.catch(() => {}).then(async () => {
            const key = accountKey?.();
            if (!key || disposed || activeSource?.() !== 'qq') return;
            const saved = await read();
            const ids = saved[key] ?? {};
            let playlist = await owned(scene);
            if (!playlist) {
                // A vanished/mismatched stored ID is never treated as permission to claim a same-named user playlist.
                if (ids[scene.id] || key !== accountKey?.() || activeSource?.() !== 'qq' || disposed) return;
                // A timed-out QQ create may already have succeeded. Reserve before sending it, never blindly retry.
                await storage.set(PLAYLIST_IDS_KEY, {
                    ...saved, [key]: { ...ids, [scene.id]: CREATION_PENDING },
                });
                try {
                    playlist = await library.createPlaylist(playlistTitle(scene));
                } catch (error) {
                    if (error?.code === 'NOT_SUPPORTED' && !disposed) {
                        // The core refused before it could send a create request. Take back only
                        // this run's reservation, on the ledger as it stands now — a newer mod
                        // instance may have written it while the request was in flight.
                        const latest = await read();
                        const current = latest[key] ?? {};
                        if (current[scene.id] === CREATION_PENDING) {
                            const nextIds = { ...current };
                            delete nextIds[scene.id];
                            await storage.set(PLAYLIST_IDS_KEY, { ...latest, [key]: nextIds });
                        }
                    }
                    throw error;
                }
                if (disposed || activeSource?.() !== 'qq' || key !== accountKey?.()) return;
                if (!/^\d+$/.test(playlist?.id) || playlist.title !== playlistTitle(scene)) {
                    throw new Error('QQ playlist creation returned an unexpected identity');
                }
                await storage.set(PLAYLIST_IDS_KEY, {
                    ...saved, [key]: { ...ids, [scene.id]: playlist.id },
                });
            }
            if (disposed || activeSource?.() !== 'qq' || key !== accountKey?.()) return;
            await library.replacePlaylistSongs(playlist.id, songs.map(song => ({ source: song.source, id: String(song.id) })));
            if (!disposed) onSaved?.(scene);
        }).catch(error => { log?.warn?.('[ai-scene-radio] playlist write skipped', error); });
    };
    const tracks = async (scene) => {
        try {
            const playlist = await owned(scene);
            return playlist ? await library.getPlaylistTracks(playlist.id) : [];
        } catch (error) {
            log?.warn?.('[ai-scene-radio] playlist read skipped', error);
            return [];
        }
    };
    // Covers of the tracked playlists, { sceneId: url }: one listPlaylists read, matched by the
    // same ledger id + title rule as `owned`. Scenes without a tracked, covered playlist are absent.
    const covers = async (scenes) => {
        const key = accountKey?.();
        if (disposed || !library || activeSource?.() !== 'qq' || !key) return {};
        const ids = (await read())[key] ?? {};
        const tracked = (scenes ?? []).filter(scene => (
            typeof ids[scene.id] === 'string' && ids[scene.id] && ids[scene.id] !== CREATION_PENDING
        ));
        if (!tracked.length) return {};
        const items = await library.listPlaylists();
        // 与 owned 同一套在途复查：读期间换号、切源或停用，台账匹配的结论已过期。
        if (disposed || accountKey?.() !== key || activeSource?.() !== 'qq') return {};
        const result = {};
        for (const scene of tracked) {
            const found = items.find(item => item.id === ids[scene.id] && item.title === playlistTitle(scene));
            if (found?.coverUrl) result[scene.id] = found.coverUrl;
        }
        return result;
    };
    return { save, tracks, covers, settled: () => pending, dispose: () => { disposed = true; } };
};
