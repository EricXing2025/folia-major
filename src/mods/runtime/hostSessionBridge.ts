import type { FoliumAudioFxService, FoliumAudioProfile, FoliumLibraryService, FoliumRadioService } from '../folium/contract';
import { removeRadioEntries, setRadioEntries, setRadioStart, type RadioEntry } from '../folium/radioEntries';
import { registerFoliumSessionBridgeSource, type FoliumSessionBridgeHost } from '../folium/sessionBridge';
import { useAudioSettingsStore } from '../../stores/useAudioSettingsStore';
import { omni } from '../../services/onlineMusic/omni';
import type { MediaId, OmniCollection, OmniProviderSummary } from '../../types/onlineMusic';

// Three small activation-owned bridges; all mutations pass the same call-time permission gate.
const notSupported = (): never => { throw Object.assign(new Error('Playlist mutation not supported'), { code: 'NOT_SUPPORTED' }); };

const validateProfile = (profile: FoliumAudioProfile): FoliumAudioProfile => {
    const ranges: [number, number, number][] = [
        [profile?.lowCutHz, 20, 2000], [profile?.highCutHz, 500, 20000],
        [profile?.compressorPct, 0, 100], [profile?.widthPct, 0, 200], [profile?.reverbPct, 0, 100],
    ];
    if (!Array.isArray(profile?.bandsDb) || profile.bandsDb.length !== 10
        || Array.from({ length: 10 }, (_, index) => profile.bandsDb[index])
            .some(value => !Number.isFinite(value) || value < -12 || value > 12)
        || ranges.some(([value, min, max]) => !Number.isFinite(value) || value < min || value > max)) {
        throw new TypeError('invalid audio profile');
    }
    return { ...profile, bandsDb: [...profile.bandsDb] };
};

const audioOwners = new Map<string, symbol>();
const radioOwners = new Map<string, symbol>();

const createHostBridge = (modId: string, active: () => void): FoliumSessionBridgeHost => {
    const token = Symbol(modId);
    const account = (): OmniProviderSummary => {
        active();
        const summary = omni.getActiveProviderSummary();
        if (!summary || summary.status !== 'authenticated' || !summary.user) return notSupported();
        return summary;
    };
    const sameAccount = (summary: OmniProviderSummary) => {
        active();
        const current = account();
        if (current.providerId !== summary.providerId || String(current.user?.id) !== String(summary.user?.id)) return notSupported();
    };
    const playlists = async (): Promise<{ items: OmniCollection[]; owner: OmniProviderSummary }> => {
        const summary = account();
        const result: OmniCollection[] = [];
        for (let offset = 0; offset < 10000;) {
            sameAccount(summary);
            const page = await omni.getUserPlaylists(summary.user!.id, { offset, limit: 100 });
            result.push(...page.items.filter(item => item.type === 'playlist'));
            if (!page.hasMore || page.nextOffset <= offset) break;
            offset = page.nextOffset;
        }
        sameAccount(summary);
        return { items: result, owner: summary };
    };
    const find = async (id: string) => {
        const { items, owner } = await playlists();
        return { playlist: items.find(item => String(item.id) === id) ?? notSupported(), owner };
    };
    return {
        audioFx: Object.freeze({
            applyProfile: async (profile: FoliumAudioProfile) => {
                active();
                const normalized = validateProfile(profile);
                audioOwners.set(modId, token);
                useAudioSettingsStore.getState().setAudioProfileOverride({ modId, ...normalized });
            },
            clearProfile: async () => {
                active();
                if (audioOwners.get(modId) === token) {
                    useAudioSettingsStore.getState().clearAudioProfileOverride(modId);
                    audioOwners.delete(modId);
                }
            },
        }),
        library: Object.freeze({
            listPlaylists: async () => {
                const { items } = await playlists();
                return items.map(item => ({
                    id: String(item.id), title: item.name, trackCount: item.trackCount,
                    ...(item.coverUrl ? { coverUrl: item.coverUrl } : {}),
                }));
            },
            createPlaylist: async (title: string) => {
                active();
                if (typeof title !== 'string' || !title.trim()) throw new TypeError('invalid playlist title');
                account();
                const result = await omni.createEmptyPlaylist(title.trim());
                return { id: String(result.id), title: result.name };
            },
            replacePlaylistSongs: async (id: string, tracks: { source: string; id: string }[]) => {
                active();
                if (typeof id !== 'string' || !Array.isArray(tracks) || tracks.length > 500) throw new TypeError('invalid playlist request');
                const { playlist, owner } = await find(id);
                if (playlist.isOwned !== true || !omni.canEditCollectionTracks(playlist)) return notSupported();
                if (tracks.some(track => track?.source !== playlist.providerId || typeof track.id !== 'string')) return notSupported();
                // One grouped lookup: providers answer at most their batch at a time, one after another.
                const details = await omni.getSongDetails(playlist.providerId, tracks.map(track => track.id));
                const songs = details.map(detail => (detail.status === 'found' ? detail.song : notSupported()));
                sameAccount(owner);
                await omni.replaceCollectionTracks(playlist, songs, owner.user!.id, active);
            },
            getPlaylistTracks: async (id: string) => {
                active();
                if (typeof id !== 'string') throw new TypeError('invalid playlist id');
                const { playlist, owner } = await find(id);
                const tracks = [];
                for (let offset = 0; offset < 10000;) {
                    sameAccount(owner);
                    const page = await omni.getCollectionTracks(playlist, { offset, limit: 100 });
                    tracks.push(...page.items.map(song => ({
                        source: playlist.providerId, id: String(song.sourceRef.kind === 'online' ? song.sourceRef.mediaId : song.id),
                        title: song.name, artist: song.artists.map(artist => artist.name).join(', '),
                    })));
                    if (!page.hasMore || page.nextOffset <= offset) break;
                    offset = page.nextOffset;
                }
                return tracks;
            },
        }),
        radio: Object.freeze({
            registerEntries: (entries: { id: string; title: string; subtitle?: string; imageUrl?: string }[]) => {
                active();
                if (!Array.isArray(entries) || entries.length > 30
                    || entries.some(entry => !entry || typeof entry.id !== 'string' || !entry.id
                        || typeof entry.title !== 'string' || !entry.title
                        || (entry.subtitle !== undefined && typeof entry.subtitle !== 'string'))) throw new TypeError('invalid radio entries');
                radioOwners.set(modId, token);
                // A bad cover never fails a registration: only a sane https URL is kept.
                setRadioEntries(modId, entries.map(entry => {
                    const mapped: RadioEntry = { modId, id: entry.id, title: entry.title };
                    if (entry.subtitle !== undefined) mapped.subtitle = entry.subtitle;
                    if (typeof entry.imageUrl === 'string' && entry.imageUrl.startsWith('https://') && entry.imageUrl.length <= 2048) {
                        mapped.imageUrl = entry.imageUrl;
                    }
                    return mapped;
                }));
            },
            onStartRequest: (callback: (entryId: string) => void) => {
                active();
                if (typeof callback !== 'function') throw new TypeError('invalid radio callback');
                radioOwners.set(modId, token);
                setRadioStart(modId, id => { active(); callback(id); });
            },
        }),
        release: () => {
            if (audioOwners.get(modId) === token) {
                useAudioSettingsStore.getState().clearAudioProfileOverride(modId);
                audioOwners.delete(modId);
            }
            if (radioOwners.get(modId) === token) {
                removeRadioEntries(modId);
                radioOwners.delete(modId);
            }
        },
    };
};

export const installFoliumHostSessionBridge = () => registerFoliumSessionBridgeSource(createHostBridge);
