import type { ApiEnvelope, LoginResult, TokenPair, User } from '../ptms-api';

export const SESSION_COOKIE_NAME = 'ptms_admin_refresh';
export const REFRESH_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

type SafeSession = { user: User; accessToken: string };
type GatewayRuntime = {
  apiBaseUrl?: string;
  fetcher?: typeof fetch;
  production?: boolean;
};

function runtime(runtime?: GatewayRuntime) {
  return {
    apiBaseUrl:
      runtime?.apiBaseUrl ??
      process.env.PTMS_API_BASE_URL ??
      process.env.NEXT_PUBLIC_PTMS_API_BASE_URL ??
      'https://ptms-api.onrender.com/api/v1',
    fetcher: runtime?.fetcher ?? fetch,
    production: runtime?.production ?? process.env.NODE_ENV === 'production',
  };
}

export function sessionCookie(refreshToken: string, production: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(refreshToken)}`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api/session',
    `Max-Age=${REFRESH_MAX_AGE_SECONDS}`,
  ];
  if (production) parts.push('Secure');
  return parts.join('; ');
}

export function clearedSessionCookie(production: boolean): string {
  const parts = [
    `${SESSION_COOKIE_NAME}=`,
    'HttpOnly',
    'SameSite=Strict',
    'Path=/api/session',
    'Max-Age=0',
  ];
  if (production) parts.push('Secure');
  return parts.join('; ');
}

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get('cookie');
  if (!header) return null;
  for (const item of header.split(';')) {
    const [name, ...value] = item.trim().split('=');
    if (name === SESSION_COOKIE_NAME) return decodeURIComponent(value.join('='));
  }
  return null;
}

export function hasValidOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

function json<T>(body: T, status: number, cookie?: string): Response {
  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json',
  });
  if (cookie) headers.set('Set-Cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function safeError(status: number, message?: string, cookie?: string): Response {
  const publicMessage =
    status === 400
      ? message || 'Please check the submitted information.'
      : status === 401
        ? 'Invalid credentials or expired session.'
        : status === 403
          ? 'This request is not allowed.'
          : status === 404
            ? 'The requested resource is unavailable.'
            : 'The authentication service is temporarily unavailable.';
  return json({ success: false, statusCode: status, message: publicMessage }, status, cookie);
}

async function backendEnvelope<T>(response: Response): Promise<ApiEnvelope<T> | null> {
  try {
    return (await response.json()) as ApiEnvelope<T>;
  } catch {
    return null;
  }
}

async function confirmUser(
  apiBaseUrl: string,
  accessToken: string,
  fetcher: typeof fetch,
): Promise<{ response: Response; envelope: ApiEnvelope<User> | null }> {
  const response = await fetcher(`${apiBaseUrl}/auth/me`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
  });
  return { response, envelope: await backendEnvelope<User>(response) };
}

async function refreshSession(request: Request, runtimeOptions?: GatewayRuntime): Promise<Response> {
  const options = runtime(runtimeOptions);
  const refreshToken = readSessionCookie(request);
  if (!refreshToken) {
    return safeError(401, undefined, clearedSessionCookie(options.production));
  }

  try {
    const refreshResponse = await options.fetcher(`${options.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    const refreshEnvelope = await backendEnvelope<TokenPair>(refreshResponse);
    if (!refreshResponse.ok || !refreshEnvelope?.data) {
      return safeError(
        refreshResponse.status === 400 ? 400 : 401,
        refreshEnvelope?.message,
        clearedSessionCookie(options.production),
      );
    }

    const { accessToken, refreshToken: rotatedRefreshToken } = refreshEnvelope.data;
    const confirmed = await confirmUser(options.apiBaseUrl, accessToken, options.fetcher);
    if (!confirmed.response.ok || !confirmed.envelope?.data) {
      return safeError(401, undefined, clearedSessionCookie(options.production));
    }

    return json(
      {
        success: true,
        statusCode: 200,
        message: 'Session restored.',
        data: { user: confirmed.envelope.data, accessToken } satisfies SafeSession,
      },
      200,
      sessionCookie(rotatedRefreshToken, options.production),
    );
  } catch {
    return safeError(503);
  }
}

export async function handleSessionLogin(
  request: Request,
  runtimeOptions?: GatewayRuntime,
): Promise<Response> {
  const options = runtime(runtimeOptions);
  if (!hasValidOrigin(request)) return safeError(403);

  let credentials: { email?: unknown; password?: unknown };
  try {
    credentials = (await request.json()) as { email?: unknown; password?: unknown };
  } catch {
    return safeError(400);
  }
  if (typeof credentials.email !== 'string' || typeof credentials.password !== 'string') {
    return safeError(400);
  }

  try {
    const loginResponse = await options.fetcher(`${options.apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(credentials),
    });
    const loginEnvelope = await backendEnvelope<LoginResult>(loginResponse);
    if (!loginResponse.ok || !loginEnvelope?.data) {
      return safeError(loginResponse.status, loginEnvelope?.message);
    }

    const { accessToken, refreshToken } = loginEnvelope.data;
    const confirmed = await confirmUser(options.apiBaseUrl, accessToken, options.fetcher);
    if (!confirmed.response.ok || !confirmed.envelope?.data) return safeError(401);

    return json(
      {
        success: true,
        statusCode: 200,
        message: 'Login successful.',
        data: { user: confirmed.envelope.data, accessToken } satisfies SafeSession,
      },
      200,
      sessionCookie(refreshToken, options.production),
    );
  } catch {
    return safeError(503);
  }
}

export async function handleSessionRefresh(
  request: Request,
  runtimeOptions?: GatewayRuntime,
): Promise<Response> {
  if (!hasValidOrigin(request)) return safeError(403);
  return refreshSession(request, runtimeOptions);
}

export async function handleSessionRestore(
  request: Request,
  runtimeOptions?: GatewayRuntime,
): Promise<Response> {
  return refreshSession(request, runtimeOptions);
}

export function handleSessionLogout(request: Request, runtimeOptions?: GatewayRuntime): Response {
  const options = runtime(runtimeOptions);
  if (!hasValidOrigin(request)) return safeError(403);
  return json(
    { success: true, statusCode: 200, message: 'Browser session cleared.', data: null },
    200,
    clearedSessionCookie(options.production),
  );
}
