import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequestError, createAuthenticatedApiClient } from '../lib/authenticated-api.ts';

function ok(data: unknown) {
  return new Response(JSON.stringify({ success: true, message: 'ok', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('concurrent 401 requests share one refresh and retry once', async () => {
  let token = 'old';
  let refreshes = 0;
  let requests = 0;
  const fetcher: typeof fetch = async (_input, init) => {
    requests += 1;
    const authorization = new Headers(init?.headers).get('authorization');
    if (authorization === 'Bearer old') return new Response(null, { status: 401 });
    return ok({ accepted: true });
  };
  const client = createAuthenticatedApiClient({
    apiBaseUrl: 'https://api.example',
    fetcher,
    getAccessToken: () => token,
    refreshSession: async () => {
      refreshes += 1;
      await Promise.resolve();
      token = 'new';
      return true;
    },
    onSessionExpired: () => assert.fail('session should not expire'),
  });

  await Promise.all([client.request('/one'), client.request('/two')]);
  assert.equal(refreshes, 1);
  assert.equal(requests, 4);
});

test('a request retries at most once and failed retry expires once', async () => {
  let requests = 0;
  let expired = 0;
  const client = createAuthenticatedApiClient({
    apiBaseUrl: 'https://api.example',
    fetcher: async () => {
      requests += 1;
      return new Response(null, { status: 401 });
    },
    getAccessToken: () => 'token',
    refreshSession: async () => true,
    onSessionExpired: () => { expired += 1; },
  });

  await assert.rejects(client.request('/protected'), ApiRequestError);
  assert.equal(requests, 2);
  assert.equal(expired, 1);
});

test('failed refresh creates no loop', async () => {
  let requests = 0;
  let refreshes = 0;
  const client = createAuthenticatedApiClient({
    apiBaseUrl: 'https://api.example',
    fetcher: async () => {
      requests += 1;
      return new Response(null, { status: 401 });
    },
    getAccessToken: () => 'token',
    refreshSession: async () => { refreshes += 1; return false; },
    onSessionExpired: () => undefined,
  });

  await assert.rejects(client.request('/protected'), ApiRequestError);
  assert.equal(requests, 1);
  assert.equal(refreshes, 1);
});

test('403 does not refresh or clear session', async () => {
  let refreshed = false;
  let expired = false;
  const client = createAuthenticatedApiClient({
    apiBaseUrl: 'https://api.example',
    fetcher: async () => new Response(null, { status: 403 }),
    getAccessToken: () => 'token',
    refreshSession: async () => { refreshed = true; return true; },
    onSessionExpired: () => { expired = true; },
  });

  await assert.rejects(
    client.request('/forbidden'),
    (error: unknown) => error instanceof ApiRequestError && error.kind === 'forbidden',
  );
  assert.equal(refreshed, false);
  assert.equal(expired, false);
});

test('network errors do not destroy the session', async () => {
  let expired = false;
  const client = createAuthenticatedApiClient({
    apiBaseUrl: 'https://api.example',
    fetcher: async () => { throw new Error('offline'); },
    getAccessToken: () => 'token',
    refreshSession: async () => false,
    onSessionExpired: () => { expired = true; },
  });

  await assert.rejects(
    client.request('/offline'),
    (error: unknown) => error instanceof ApiRequestError && error.kind === 'network',
  );
  assert.equal(expired, false);
});

test('409 is exposed as a conflict without returning backend internals', async () => {
  const client = createAuthenticatedApiClient({
    apiBaseUrl: 'https://api.example',
    fetcher: async () => new Response(JSON.stringify({
      message: 'backend detail must not be surfaced',
    }), { status: 409 }),
    getAccessToken: () => 'token',
    refreshSession: async () => false,
    onSessionExpired: () => undefined,
  });

  await assert.rejects(
    client.request('/conflict'),
    (error: unknown) => error instanceof ApiRequestError &&
      error.kind === 'conflict' && error.status === 409 &&
      !error.message.includes('backend detail'),
  );
});
