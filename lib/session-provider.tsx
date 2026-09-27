'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createAuthenticatedApiClient, type AuthenticatedApiClient } from './authenticated-api';
import { API_BASE_URL, type ApiEnvelope, type LoginRequest, type User } from './ptms-api';

type SessionStatus = 'booting' | 'anonymous' | 'refreshing' | 'authenticated';
type SafeSession = { user: User; accessToken: string };
type SessionContextValue = {
  status: SessionStatus;
  user: User | null;
  api: AuthenticatedApiClient;
  login(credentials: LoginRequest): Promise<void>;
  logout(): Promise<void>;
};

const SessionContext = createContext<SessionContextValue | null>(null);

async function readSafeSession(response: Response): Promise<SafeSession> {
  const envelope = (await response.json()) as ApiEnvelope<SafeSession>;
  if (!response.ok || !envelope.data?.accessToken || !envelope.data?.user) {
    throw new Error('Session unavailable.');
  }
  return envelope.data;
}

async function confirmIdentity(accessToken: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  const envelope = (await response.json()) as ApiEnvelope<User>;
  if (!response.ok || !envelope.data) throw new Error('Identity confirmation failed.');
  return envelope.data;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<SessionStatus>('booting');
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const clearMemory = useCallback(() => {
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const acceptSession = useCallback(async (session: SafeSession) => {
    const confirmedUser = await confirmIdentity(session.accessToken);
    setAccessToken(session.accessToken);
    setUser(confirmedUser);
    setStatus('authenticated');
  }, []);

  const refreshSession = useCallback(async (): Promise<boolean> => {
    setStatus((current) => (current === 'booting' ? current : 'refreshing'));
    try {
      const response = await fetch('/api/session/refresh', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
      const session = await readSafeSession(response);
      await acceptSession(session);
      return true;
    } catch {
      clearMemory();
      return false;
    }
  }, [acceptSession, clearMemory]);

  const api = useMemo(
    () =>
      createAuthenticatedApiClient({
        getAccessToken: () => accessToken,
        refreshSession,
        onSessionExpired: clearMemory,
      }),
    [accessToken, clearMemory, refreshSession],
  );

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const response = await fetch('/api/session/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials),
      });
      await acceptSession(await readSafeSession(response));
    },
    [acceptSession],
  );

  async function logout() {
    try {
      await fetch('/api/session/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json' },
      });
    } finally {
      clearMemory();
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    async function restore() {
      try {
        const response = await fetch('/api/session/restore', {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        await acceptSession(await readSafeSession(response));
      } catch {
        if (!controller.signal.aborted) clearMemory();
      }
    }
    void restore();
    return () => controller.abort();
  }, [acceptSession, clearMemory]);

  return (
    <SessionContext.Provider value={{ status, user, api, login, logout }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession must be used inside SessionProvider.');
  return context;
}
