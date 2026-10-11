import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Role = 'admin' | 'master' | 'viewer';

export const useUiStore = create<{
  sidebarCollapsed: boolean;
  role: Role;
  toggleSidebar: () => void;
  setRole: (r: Role) => void;
}>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      role: 'master',
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setRole: (role) => set({ role }),
    }),
    { name: 'fkit-bi:ui' },
  ),
);

export const canEditIncidents = (r: Role) => r !== 'viewer';
export const USER_BY_ROLE: Record<Role, string> = {
  admin: 'Администратор',
  master: 'Мастер смены',
  viewer: 'Наблюдатель',
};
