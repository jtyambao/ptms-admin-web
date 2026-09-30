import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// P5 font fix (branch feat/admin-oic-management) — next/font/google's
// Geist/Geist_Mono loaders cached font files under .vinext/fonts at
// BUILD time and baked the build machine's own absolute filesystem path
// into production output, which the Cloudflare Workers runtime this app
// actually deploys to can never resolve (no such filesystem exists
// there). Removed entirely in favor of a system font stack — zero
// external dependency, zero build-time path baking.
const layout = readFileSync('app/layout.tsx', 'utf8');
const globals = readFileSync('app/globals.css', 'utf8');

test('layout no longer imports next/font/google (the source of the baked absolute path)', () => {
  assert.doesNotMatch(layout, /^import.*next\/font\/google/m);
  assert.doesNotMatch(layout, /geistSans\.variable|geistMono\.variable/);
});

test('the --font-geist-sans/--font-geist-mono CSS variable NAMES are kept, now as plain system font stacks', () => {
  assert.match(globals, /--font-geist-sans: ui-sans-serif/);
  assert.match(globals, /--font-geist-mono: ui-monospace/);
});
