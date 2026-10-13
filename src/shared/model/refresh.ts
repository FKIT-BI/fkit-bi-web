import { create } from 'zustand';

export const useRefreshStore = create<{ now: number; bump: () => void }>((set) => ({
  now: Date.now(),
  bump: () => set({ now: Date.now() }),
}));

export const useNow = () => useRefreshStore((s) => s.now);
