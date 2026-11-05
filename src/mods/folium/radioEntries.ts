import { useSyncExternalStore } from 'react';
import type { LibraryHomeCard } from '../../library/core/home/homeModel.contract';

// Session-only native radio entries; no mod survives teardown or persists a card.
export type RadioEntry = { modId: string; id: string; title: string; subtitle?: string };
const registrations = new Map<string, { entries: RadioEntry[]; start: ((id: string) => void) | null }>();
const listeners = new Set<() => void>();
let snapshot: RadioEntry[] = [];

const publish = () => {
    snapshot = [...registrations.values()].flatMap(value => value.entries);
    listeners.forEach(listener => listener());
};

export const setRadioEntries = (modId: string, entries: RadioEntry[]) => {
    const current = registrations.get(modId);
    registrations.set(modId, { entries, start: current?.start ?? null });
    publish();
};

export const setRadioStart = (modId: string, start: (id: string) => void) => {
    const current = registrations.get(modId);
    registrations.set(modId, { entries: current?.entries ?? [], start });
};

export const removeRadioEntries = (modId: string) => {
    registrations.delete(modId);
    publish();
};

export const startRadioEntry = (entry: RadioEntry) => {
    const current = registrations.get(entry.modId);
    if (current?.entries.some(item => item.id === entry.id)) {
        try { current.start?.(entry.id); }
        catch (error) { console.warn('[FoliumRadio] start request failed', error); }
    }
};

export const radioEntryCards = (entries: readonly RadioEntry[], heading: string): LibraryHomeCard[] => entries.map(entry => ({
    id: `folium-radio:${entry.modId}:${entry.id}`,
    name: entry.title,
    type: 'scene-radio',
    description: heading,
    summary: entry.subtitle ?? '',
    raw: entry,
}));

export const radioEntryOfCard = (card: LibraryHomeCard): RadioEntry | null => (
    typeof card.id === 'string' && card.id.startsWith('folium-radio:')
        ? card.raw as RadioEntry : null
);

export const useRadioEntries = () => useSyncExternalStore(
    listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    () => snapshot,
    () => snapshot,
);
