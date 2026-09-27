import type { ApiEnvelope } from './ptms-api';

const DEFAULT_API_BASE_URL =
  process.env.NEXT_PUBLIC_PTMS_API_BASE_URL ?? 'https://ptms-api.onrender.com/api/v1';

export type ApiErrorKind =
  | 'validation'
  | 'session-expired'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'network'
  | 'service';

export class ApiRequestError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, status?: number) {
    super(
      kind === 'validation'
        ? 'Please check the submitted information.'
        : kind === 'session-expired'
          ? 'Your session has expired. Please sign in again.'
          : kind === 'forbidden'
            ? 'You do not have permission to perform this action.'
            : kind === 'not-found'
              ? 'The requested resource is unavailable.'
              : kind === 'conflict'
                ? 'This action conflicts with the current operational state.'
              : kind === 'network'
                ? 'The service is unreachable. Check your connection and try again.'
                : 'The service is temporarily unavailable.',
    );
    this.name = 'ApiRequestError';
    this.kind = kind;
    this.status = status;
  }
}

type ClientOptions = {
  getAccessToken: () => string | null;
  refreshSession: () => Promise<boolean>;
  onSessionExpired: () => void;
  fetcher?: typeof fetch;
  apiBaseUrl?: string;
};

export type AuthenticatedApiClient = {
  request<T>(path: string, init?: RequestInit): Promise<T>;
};

export function createAuthenticatedApiClient(options: ClientOptions): AuthenticatedApiClient {
  const fetcher = options.fetcher ?? fetch;
  const apiBaseUrl = options.apiBaseUrl ?? DEFAULT_API_BASE_URL;
  let refreshPromise: Promise<boolean> | null = null;
  let expiryHandled = false;

  async function refreshOnce(): Promise<boolean> {
    if (!refreshPromise) {
      refreshPromise = options
        .refreshSession()
        .then((ok) => {
          if (ok) expiryHandled = false;
          return ok;
        })
        .finally(() => {
          refreshPromise = null;
        });
    }
    return refreshPromise;
  }

  async function request<T>(path: string, init: RequestInit = {}, retried = false): Promise<T> {
    const token = options.getAccessToken();
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetcher(`${apiBaseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiRequestError('network');
    }

    if (response.status === 401 && !retried) {
      if (await refreshOnce()) return request<T>(path, init, true);
      if (!expiryHandled) {
        expiryHandled = true;
        options.onSessionExpired();
      }
      throw new ApiRequestError('session-expired', 401);
    }

    if (!response.ok) {
      if (response.status === 400) throw new ApiRequestError('validation', 400);
      if (response.status === 401) {
        if (!expiryHandled) {
          expiryHandled = true;
          options.onSessionExpired();
        }
        throw new ApiRequestError('session-expired', 401);
      }
      if (response.status === 403) throw new ApiRequestError('forbidden', 403);
      if (response.status === 404) throw new ApiRequestError('not-found', 404);
      if (response.status === 409) throw new ApiRequestError('conflict', 409);
      throw new ApiRequestError('service', response.status);
    }

    const envelope = (await response.json()) as ApiEnvelope<T>;
    return envelope.data;
  }

  return { request };
}
