import type { ModRuntimeInfo } from '../types';
import type { FoliumAudioFxService, FoliumAudioProfile, FoliumLibraryService, FoliumRadioService } from './contract';
import type { FoliumStoppedCheck } from './api';

// The client API never imports stores or online providers; the main window installs the source.
export type FoliumSessionBridgeHost = {
    audioFx: FoliumAudioFxService;
    library: FoliumLibraryService;
    radio: FoliumRadioService;
    release(): void;
};
let source: ((modId: string, active: () => void) => FoliumSessionBridgeHost) | null = null;
export const registerFoliumSessionBridgeSource = (next: typeof source) => { source = next; };

export const createFoliumSessionBridge = (
    mod: ModRuntimeInfo,
    context: string,
    stopped: FoliumStoppedCheck,
    onRelease: (release: () => void) => void,
): { audioFx: FoliumAudioFxService; library: FoliumLibraryService; radio: FoliumRadioService } => {
    let released = false;
    const active = () => {
        if (released || stopped('sessionBridge')) throw new Error('sessionBridge-unavailable');
    };
    const host = context === 'main' ? source?.(mod.id, active) : null;
    onRelease(() => { released = true; host?.release(); });
    const gate = (permission: string, method: string): FoliumSessionBridgeHost => {
        if (!mod.permissions.includes(permission)) throw new Error(`permission-denied:${permission}`);
        active();
        if (!host) throw new Error(`${method}-unavailable-in-${context}-context`);
        return host;
    };
    const libraryCall = <T>(method: string, run: (library: FoliumLibraryService) => Promise<T>): Promise<T> => {
        try {
            return run(gate('library.playlists', method).library).catch(error => {
                if ((error as { code?: string })?.code === 'unsupported') {
                    throw Object.assign(new Error('Playlist operation is not supported'), { code: 'NOT_SUPPORTED' });
                }
                throw error;
            });
        } catch (error) { return Promise.reject(error); }
    };
    return {
        audioFx: Object.freeze({
            applyProfile: (profile: FoliumAudioProfile) => {
                try { return gate('audio.profile', 'audioFx.applyProfile').audioFx.applyProfile(profile); }
                catch (error) { return Promise.reject(error); }
            },
            clearProfile: () => {
                try { return gate('audio.profile', 'audioFx.clearProfile').audioFx.clearProfile(); }
                catch (error) { return Promise.reject(error); }
            },
        }),
        library: Object.freeze({
            listPlaylists: () => libraryCall('library.listPlaylists', library => library.listPlaylists()),
            createPlaylist: (title: string) => libraryCall('library.createPlaylist', library => library.createPlaylist(title)),
            replacePlaylistSongs: (id: string, tracks: { source: string; id: string }[]) =>
                libraryCall('library.replacePlaylistSongs', library => library.replacePlaylistSongs(id, tracks)),
            getPlaylistTracks: (id: string) => libraryCall('library.getPlaylistTracks', library => library.getPlaylistTracks(id)),
        }),
        radio: Object.freeze({
            registerEntries: (entries: { id: string; title: string; subtitle?: string }[]) => gate('ui.radio', 'radio.registerEntries').radio.registerEntries(entries),
            onStartRequest: (callback: (entryId: string) => void) => gate('ui.radio', 'radio.onStartRequest').radio.onStartRequest(callback),
        }),
    };
};
