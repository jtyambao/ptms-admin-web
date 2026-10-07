import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { describeError } from '../lib/describe-error.ts';

// Live-site Calls crash (2026-10-07): a failure on /calls showed only the
// framework's generic "This page couldn't load". Now it is contained and says what failed.
const calls = readFileSync('app/calls/page.tsx', 'utf8');
const socket = readFileSync('lib/calls-socket.ts', 'utf8');
const boundary = readFileSync('components/section-error-boundary.tsx', 'utf8');
const errorPage = readFileSync('app/error.tsx', 'utf8');

test('describeError gives a short readable message for Errors and anything else', () => {
  assert.equal(describeError(new TypeError('x is not a function')), 'TypeError: x is not a function');
  assert.equal(describeError('plain'), 'plain');
  assert.ok(describeError(new Error('a'.repeat(5000))).length <= 600);
});

test('the Calls page content is wrapped so a crash there shows a message, not the generic page', () => {
  assert.match(calls, /<SectionErrorBoundary title="Calls">\s*<CallsShell \/>\s*<\/SectionErrorBoundary>/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /Details for support/);
  assert.match(boundary, /console\.error/);
});

test('there is an app-level error page that logs and shows the real error with Try again / Go to Operations', () => {
  assert.match(errorPage, /'use client'/);
  assert.match(errorPage, /console\.error\('\[page\] crashed:', error\)/);
  assert.match(errorPage, /Try again/);
  assert.match(errorPage, /Go to Operations/);
  assert.match(errorPage, /Details for support/);
});

test('the calls socket never throws while starting, and is not rebuilt on every session re-render', () => {
  assert.match(socket, /try \{\s*socket = io\(socketOrigin\(\)/);
  assert.match(socket, /status: 'error'/);
  assert.match(socket, /sessionRef\.current\.getAccessToken\(\)/);
  assert.match(socket, /\}, \[enabled, session\.status\]\);/);
  assert.doesNotMatch(socket, /\[enabled, session, session\.status\]/);
});
