// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFoliumSessionBridge } from '@/mods/folium/sessionBridge';
import { installFoliumHostSessionBridge } from '@/mods/runtime/hostSessionBridge';
import { radioEntryCards, radioEntryOfCard, removeRadioEntries, startRadioEntry } from '@/mods/folium/radioEntries';
import { useAudioSettingsStore } from '@/stores/useAudioSettingsStore';
import type { ModRuntimeInfo } from '@/mods/types';
import { resolveHeardAudioEqualizerSettings } from '@/utils/audioEqualizerModCurve';
import { omni } from '@/services/onlineMusic/omni';

// The activation's permission and cleanup, plus the audio panel/graph's shared selector.
const mod = (permissions: string[]): ModRuntimeInfo => ({
    id: 'radio-test', name: 'Radio test', version: '1.0.0', author: null, description: null,
    permissions, status: 'loaded', error: null, enabled: true, trustStale: false,
    signature: { status: 'unsigned', reason: null, keyId: null, keyLabel: null, signedAt: null },
    devSource: false, experimental: [], embedOrigins: [], folia: null, hasMain: false, clientUrl: null,
});
const profile = {
    bandsDb: [0, 1, 0, 1, 3, 3, 2, 1, 1, 0],
    lowCutHz: 60, highCutHz: 20000, compressorPct: 40, widthPct: 90, reverbPct: 5,
};
installFoliumHostSessionBridge();

afterEach(() => {
    vi.restoreAllMocks();
    useAudioSettingsStore.getState().clearAudioProfileOverride('radio-test');
    removeRadioEntries('radio-test');
});

describe('permission-gated session bridges', () => {
    it('rejects all three namespaces without declaration', async () => {
        const bridge = createFoliumSessionBridge(mod([]), 'main', () => false, () => {});
        await expect(bridge.audioFx.applyProfile(profile)).rejects.toThrow('permission-denied:audio.profile');
        await expect(bridge.audioFx.clearProfile()).rejects.toThrow('permission-denied:audio.profile');
        await expect(bridge.library.listPlaylists()).rejects.toThrow('permission-denied:library.playlists');
        await expect(bridge.library.createPlaylist('test')).rejects.toThrow('permission-denied:library.playlists');
        await expect(bridge.library.replacePlaylistSongs('1', [])).rejects.toThrow('permission-denied:library.playlists');
        await expect(bridge.library.getPlaylistTracks('1')).rejects.toThrow('permission-denied:library.playlists');
        expect(() => bridge.radio.registerEntries([])).toThrow('permission-denied:ui.radio');
        expect(() => bridge.radio.onStartRequest(() => {})).toThrow('permission-denied:ui.radio');
    });

    it('keeps the listener settings and slots byte-identical on apply and clear/dispose', async () => {
        const original = useAudioSettingsStore.getState().audioEqualizerSettings;
        const serialized = JSON.stringify(original);
        let release: () => void = () => {};
        const bridge = createFoliumSessionBridge(mod(['audio.profile']), 'main', () => false, fn => { release = fn; });
        await bridge.audioFx.applyProfile(profile);
        const audio = useAudioSettingsStore.getState();
        const heard = resolveHeardAudioEqualizerSettings(original, audio.audioEqualizerModCurve, audio.audioEqualizerModCurveSuspended, audio.audioProfileOverride);
        expect(heard.gains).toEqual(profile.bandsDb);
        expect(heard.effects).toEqual({
            highpass: 60, lowpass: 20000, punch: 0.4, width: 0.9, space: 0.05,
            drive: 0, crush: 0, wow: 0, noise: 0,
        });
        expect(audio.audioEqualizerSettings).toBe(original);
        expect(JSON.stringify(audio.audioEqualizerSettings)).toBe(serialized);
        await bridge.audioFx.clearProfile();
        expect(useAudioSettingsStore.getState().audioProfileOverride).toBeNull();
        await bridge.audioFx.applyProfile(profile);
        release();
        expect(useAudioSettingsStore.getState().audioProfileOverride).toBeNull();
        expect(JSON.stringify(useAudioSettingsStore.getState().audioEqualizerSettings)).toBe(serialized);
    });

    it('replaces entries, starts only live cards and removes them on unload', () => {
        let release: () => void = () => {};
        const called: string[] = [];
        const bridge = createFoliumSessionBridge(mod(['ui.radio']), 'main', () => false, fn => { release = fn; });
        bridge.radio.onStartRequest(id => called.push(id));
        bridge.radio.registerEntries([{ id: 'morning', title: 'Morning' }]);
        const first = radioEntryCards([{ modId: 'radio-test', id: 'morning', title: 'Morning' }], 'AI scenes')[0];
        const entry = radioEntryOfCard(first);
        expect(entry).not.toBeNull();
        startRadioEntry(entry!);
        bridge.radio.registerEntries([{ id: 'evening', title: 'Evening' }]);
        startRadioEntry(entry!);
        expect(called).toEqual(['morning']);
        release();
        startRadioEntry({ modId: 'radio-test', id: 'evening', title: 'Evening' });
        expect(called).toEqual(['morning']);
    });

    it('uses Omni for owned playlists and refuses another account playlist before any write', async () => {
        const source = { providerId: 'qq', status: 'authenticated', user: { id: 'account-1', nickname: 'User' } };
        const owned = { providerId: 'qq', id: 'playlist-1', name: 'AI scene', type: 'playlist', isOwned: true };
        vi.spyOn(omni, 'getActiveProviderSummary').mockReturnValue(source as ReturnType<typeof omni.getActiveProviderSummary>);
        vi.spyOn(omni, 'getUserPlaylists').mockResolvedValue({ items: [owned], hasMore: false, nextOffset: 1 });
        vi.spyOn(omni, 'canEditCollectionTracks').mockReturnValue(true);
        const song = { id: 'song-1', name: 'Song', artists: [{ id: 1, name: 'Artist' }], sourceRef: {
            kind: 'online', providerId: 'qq', mediaId: 'song-1',
        } };
        vi.spyOn(omni, 'getSongDetails').mockResolvedValue([{ status: 'found', song } as never]);
        const replace = vi.spyOn(omni, 'replaceCollectionTracks').mockResolvedValue();
        const bridge = createFoliumSessionBridge(mod(['library.playlists']), 'main', () => false, () => {});
        expect(await bridge.library.listPlaylists()).toEqual([{ id: 'playlist-1', title: 'AI scene', trackCount: undefined }]);
        const readTracks = vi.spyOn(omni, 'getCollectionTracks')
            .mockResolvedValue({ items: [song as never], hasMore: false, nextOffset: 1 });
        expect(await bridge.library.getPlaylistTracks('playlist-1')).toEqual([
            { source: 'qq', id: 'song-1', title: 'Song', artist: 'Artist' },
        ]);
        expect(readTracks).toHaveBeenCalledWith(owned, { offset: 0, limit: 100 });
        await bridge.library.replacePlaylistSongs('playlist-1', [{ source: 'qq', id: 'song-1' }]);
        expect(omni.getSongDetails).toHaveBeenCalledWith('qq', ['song-1']);
        expect(replace).toHaveBeenCalledWith(owned, [song], 'account-1', expect.any(Function));
        await expect(bridge.library.replacePlaylistSongs('untracked', [{ source: 'qq', id: 'song-1' }]))
            .rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
        expect(replace).toHaveBeenCalledTimes(1);
        vi.spyOn(omni, 'getUserPlaylists').mockResolvedValue({ items: [{ ...owned, isOwned: false }], hasMore: false, nextOffset: 1 });
        await expect(bridge.library.replacePlaylistSongs('playlist-1', [{ source: 'qq', id: 'song-1' }]))
            .rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
        expect(replace).toHaveBeenCalledTimes(1);
    });

    it('resolves replacement songs in one grouped lookup and refuses over 500 or an unfound song', async () => {
        const source = { providerId: 'qq', status: 'authenticated', user: { id: 'account-1', nickname: 'User' } };
        const owned = { providerId: 'qq', id: 'playlist-1', name: 'AI scene', type: 'playlist', isOwned: true };
        vi.spyOn(omni, 'getActiveProviderSummary').mockReturnValue(source as ReturnType<typeof omni.getActiveProviderSummary>);
        vi.spyOn(omni, 'getUserPlaylists').mockResolvedValue({ items: [owned], hasMore: false, nextOffset: 1 });
        vi.spyOn(omni, 'canEditCollectionTracks').mockReturnValue(true);
        const song = { id: 'song-1', sourceRef: { kind: 'online', providerId: 'qq', mediaId: 'song-1' } };
        const details = vi.spyOn(omni, 'getSongDetails').mockResolvedValue([{ status: 'found', song } as never]);
        const replace = vi.spyOn(omni, 'replaceCollectionTracks').mockResolvedValue();
        const bridge = createFoliumSessionBridge(mod(['library.playlists']), 'main', () => false, () => {});
        await expect(bridge.library.replacePlaylistSongs('playlist-1',
            Array.from({ length: 501 }, (_, index) => ({ source: 'qq', id: `song-${index}` }))))
            .rejects.toThrow(TypeError);
        expect(details).not.toHaveBeenCalled();
        vi.spyOn(omni, 'getSongDetails').mockResolvedValue([{ status: 'missing' } as never]);
        await expect(bridge.library.replacePlaylistSongs('playlist-1', [{ source: 'qq', id: 'gone' }]))
            .rejects.toMatchObject({ code: 'NOT_SUPPORTED' });
        expect(replace).not.toHaveBeenCalled();
    });

    it('keeps only sane https card images and never fails a registration for them', async () => {
        const radioEntriesModule = await import('@/mods/folium/radioEntries');
        const setEntries = vi.spyOn(radioEntriesModule, 'setRadioEntries');
        const bridge = createFoliumSessionBridge(mod(['ui.radio']), 'main', () => false, () => {});
        expect(() => bridge.radio.registerEntries([
            { id: 'morning', title: 'Morning', imageUrl: 'https://y.gtimg.cn/cover.jpg' },
            { id: 'bad-scheme', title: 'Bad', imageUrl: 'http://evil.example/x.jpg' },
            { id: 'bad-type', title: 'Bad', imageUrl: 42 as unknown as string },
            { id: 'too-long', title: 'Bad', imageUrl: `https://x/${'y'.repeat(3000)}` },
        ])).not.toThrow();
        expect(setEntries).toHaveBeenCalledWith('radio-test', [
            { modId: 'radio-test', id: 'morning', title: 'Morning', imageUrl: 'https://y.gtimg.cn/cover.jpg' },
            { modId: 'radio-test', id: 'bad-scheme', title: 'Bad' },
            { modId: 'radio-test', id: 'bad-type', title: 'Bad' },
            { modId: 'radio-test', id: 'too-long', title: 'Bad' },
        ]);
        const cards = radioEntryCards([
            { modId: 'radio-test', id: 'morning', title: 'Morning', imageUrl: 'https://y.gtimg.cn/cover.jpg' },
            { modId: 'radio-test', id: 'bad-scheme', title: 'Bad' },
        ], 'AI scenes');
        expect(cards[0].coverUrl).toBe('https://y.gtimg.cn/cover.jpg');
        expect(cards[1].coverUrl).toBeUndefined();
    });
});
