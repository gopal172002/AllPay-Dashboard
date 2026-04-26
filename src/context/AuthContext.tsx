import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { AuthUser, SignUpPayload } from "../types/auth";

const TOKEN_KEY = "allpay_token";
const SESSION_KEY = "allpay_session";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";

function readSession(): AuthUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

function writeSession(user: AuthUser | null, token?: string) {
  if (!user) {
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } else {
    localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    if (token) localStorage.setItem(TOKEN_KEY, token);
  }
}

interface AuthContextValue {
  user: AuthUser | null;
  isReady: boolean;
  signIn: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  signUp: (payload: SignUpPayload) => Promise<{ ok: true } | { ok: false; message: string }>;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    setUser(readSession());
    setIsReady(true);
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false as const, message: data.message || "Failed to login" };
      
      writeSession(data.user, data.token);
      setUser(data.user);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: "Network error" };
    }
  }, []);

  const signUp = useCallback(async (payload: SignUpPayload) => {
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) return { ok: false as const, message: data.message || "Failed to sign up" };
      
      writeSession(data.user, data.token);
      setUser(data.user);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, message: "Network error" };
    }
  }, []);

  const signOut = useCallback(() => {
    writeSession(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, isReady, signIn, signUp, signOut }),
    [user, isReady, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
