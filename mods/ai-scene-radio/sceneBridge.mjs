// Optional v2 Folium bridge: profiles and QQ playlist writes stay independent of playback.

export const PLAYLIST_IDS_KEY = 'aiSceneRadio.playlistIds.v1';
export const SCENE_PROFILES = Object.freeze({
    'work-morning': { bandsDb: [0, 1, 0, 1, 3, 3, 2, 1, 1, 0], lowCutHz: 60, highCutHz: 20000, compressorPct: 40, widthPct: 90, reverbPct: 5 },
    'work-afternoon': { bandsDb: [0, 1, 0, 1, 3, 3, 2, 1, 1, 0], lowCutHz: 60, highCutHz: 20000, compressorPct: 40, widthPct: 90, reverbPct: 5 },
    'work-evening': { bandsDb: [0, 1, 0, 1, 3, 3, 2, 0, 0, -1], lowCutHz: 60, highCutHz: 20000, compressorPct: 40, widthPct: 90, reverbPct: 8 },
    driving: { bandsDb: [1, 3, 2, 1, 2, 2, 1, 1, 0, 0], lowCutHz: 40, highCutHz: 20000, compressorPct: 30, widthPct: 100, reverbPct: 0 },
    reading: { bandsDb: [0, 0, 0, 0, 1, 1, 0, 0, 0, 0], lowCutHz: 30, highCutHz: 16000, compressorPct: 15, widthPct: 80, reverbPct: 0 },
});

export const playlistTitle = (scene) => `AI 电台 · ${scene.label}`;

export const createScenePlaylistSync = ({ library, storage, log, activeSource, accountKey }) => {
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
        if (typeof id !== 'string' || !id) return null;
        const found = (await library.listPlaylists()).find(item => item.id === id && item.title === playlistTitle(scene));
        return accountKey?.() === key && activeSource?.() === 'qq' && !disposed ? found ?? null : null;
    };
    const save = (scene, songs) => {
        if (disposed || !library || activeSource?.() !== 'qq' || !accountKey?.()
            || !songs.length || songs.some(song => song.source !== 'qq')) return;
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
                playlist = await library.createPlaylist(playlistTitle(scene));
                ids[scene.id] = playlist.id;
                saved[key] = ids;
                await storage.set(PLAYLIST_IDS_KEY, saved);
            }
            if (disposed || activeSource?.() !== 'qq' || key !== accountKey?.()) return;
            await library.replacePlaylistSongs(playlist.id, songs.map(song => ({ source: song.source, id: String(song.id) })));
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
    return { save, tracks, settled: () => pending, dispose: () => { disposed = true; } };
};
