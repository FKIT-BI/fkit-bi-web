import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
  canCreateUsers: boolean;
}

export const TOKEN_KEY = 'fkit-bi-access-token';

export const useAuth = create<{
  token: string | null;
  user: AuthUser | null;
  expiresAt: number | null;
  signIn: (token: string, user: AuthUser, expiresInSec: number) => void;
  signOut: () => void;
}>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      expiresAt: null,
      signIn: (token, user, expiresInSec) => set({ token, user, expiresAt: Date.now() + expiresInSec * 1000 }),
      signOut: () => set({ token: null, user: null, expiresAt: null }),
    }),
    { name: TOKEN_KEY, storage: createJSONStorage(() => sessionStorage) },
  ),
);

export const isAuthenticated = () => {
  const { token, expiresAt } = useAuth.getState();
  return !!token && (!expiresAt || expiresAt > Date.now());
};
