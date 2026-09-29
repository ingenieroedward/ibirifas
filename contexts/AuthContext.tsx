"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { getMe, logout as apiLogout } from "@/lib/api-client";
import type { MeDTO } from "@/lib/types";

interface AuthContextValue {
  user: MeDTO | null;
  /** True only while the initial session bootstrap is in flight. */
  loading: boolean;
  /** Re-checks the session against the server (e.g. after logging in). */
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  // The public raffle pages (/p/<token>) are for people without an account:
  // don't ask the server who they are (a guaranteed 401 plus a refresh attempt).
  const isPublicPage = usePathname().startsWith("/p/");
  const [user, setUser] = useState<MeDTO | null>(null);
  const [loading, setLoading] = useState(!isPublicPage);

  const refresh = useCallback(async () => {
    const me = await getMe();
    setUser(me);
  }, []);

  useEffect(() => {
    if (isPublicPage) return;
    let cancelled = false;

    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) setUser(me);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isPublicPage]);

  const signOut = useCallback(async () => {
    try {
      await apiLogout();
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, refresh, signOut }),
    [user, loading, refresh, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
