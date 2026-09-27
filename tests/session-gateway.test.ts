import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  SESSION_COOKIE_NAME,
  handleSessionLogin,
  handleSessionLogout,
  handleSessionRestore,
  sessionCookie,
} from '../lib/server/session-gateway.ts';

const user = {
  id: 7,
  organization_id: 2,
  email: 'manager@example.com',
  full_name: 'Test Manager',
  role: 'manager',
  status: 'active',
  last_login_at: null,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

function envelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, statusCode: 200, message: 'ok', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('login hides refresh token and writes an HttpOnly production cookie', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/login')) {
      return envelope({ user, accessToken: 'access-token', refreshToken: 'refresh-secret' }, 201);
    }
    return envelope(user);
  };
  const request = new Request('https://admin.example/api/session/login', {
    method: 'POST',
    headers: { Origin: 'https://admin.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'manager@example.com', password: 'not-logged' }),
  });
  const response = await handleSessionLogin(request, {
    apiBaseUrl: 'https://api.example',
    fetcher,
    production: true,
  });
  const body = await response.text();
  const cookie = response.headers.get('set-cookie') ?? '';

  assert.equal(response.status, 200);
  assert.doesNotMatch(body, /refresh-secret|refreshToken/);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Strict/);
});

test('local development cookie is HttpOnly without forcing Secure over HTTP', () => {
  const cookie = sessionCookie('opaque', false);
  assert.match(cookie, /HttpOnly/);
  assert.doesNotMatch(cookie, /; Secure/);
});

test('restore rotates the cookie and returns only safe session data', async () => {
  const fetcher: typeof fetch = async (input) => {
    const url = String(input);
    if (url.endsWith('/auth/refresh')) {
      return envelope({ accessToken: 'new-access', refreshToken: 'new-refresh' }, 201);
    }
    return envelope(user);
  };
  const request = new Request('https://admin.example/api/session/restore', {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=old-refresh` },
  });
  const response = await handleSessionRestore(request, {
    apiBaseUrl: 'https://api.example',
    fetcher,
    production: true,
  });
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') ?? '', /new-refresh/);
  assert.doesNotMatch(body, /new-refresh|refreshToken/);
  assert.match(body, /new-access/);
});

test('invalid refresh returns anonymous response and clears cookie', async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ success: false, message: 'invalid' }), { status: 401 });
  const request = new Request('https://admin.example/api/session/restore', {
    headers: { Cookie: `${SESSION_COOKIE_NAME}=invalid` },
  });
  const response = await handleSessionRestore(request, { fetcher, production: true });

  assert.equal(response.status, 401);
  assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/);
});

test('logout requires same origin and clears only the browser cookie', () => {
  const request = new Request('https://admin.example/api/session/logout', {
    method: 'POST',
    headers: { Origin: 'https://admin.example' },
  });
  const response = handleSessionLogout(request, { production: true });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie') ?? '', /Max-Age=0/);
});

test('session client source never persists tokens in browser storage', async () => {
  const source = await readFile(new URL('../lib/session-provider.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB/i);
});
