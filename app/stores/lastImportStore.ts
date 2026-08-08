import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { PersistStorage, persist } from 'zustand/middleware';
import { LastImportRecord } from '../utils/importExport';

interface LastImportStore {
  lastImport: LastImportRecord | null;
  hasHydrated: boolean;
  setHasHydrated: (value: boolean) => void;
  setLastImport: (record: LastImportRecord) => void;
}

type PersistedLastImportState = { lastImport: LastImportRecord | null };

// Kept as its own tiny store/AsyncStorage key ('lastImport', matching the old TaskContext's
// separate key exactly) rather than folded into taskStore -- avoids reshaping that store's
// already-migrated-once persisted data any further. The legacy raw value under this key is a
// bare `{ exportId, importedAt }` object (from the old TaskContext's `JSON.stringify(record)`),
// not zustand persist's `{ state, version }` envelope -- detected here the same way taskStore
// detects its own legacy shape.
const lastImportStorage: PersistStorage<PersistedLastImportState> = {
  getItem: async (name) => {
    const raw = await AsyncStorage.getItem(name);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !('state' in parsed)) {
      return { state: { lastImport: parsed }, version: 0 };
    }
    return parsed;
  },
  setItem: async (name, value) => {
    await AsyncStorage.setItem(name, JSON.stringify(value));
  },
  removeItem: async (name) => {
    await AsyncStorage.removeItem(name);
  },
};

export const useLastImportStore = create<LastImportStore>()(
  persist(
    (set) => ({
      lastImport: null,
      hasHydrated: false,
      setHasHydrated: (value) => set({ hasHydrated: value }),
      setLastImport: (record) => set({ lastImport: record }),
    }),
    {
      name: 'lastImport',
      storage: lastImportStorage,
      partialize: (state) => ({ lastImport: state.lastImport }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
