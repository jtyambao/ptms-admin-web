import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const panel = readFileSync('components/site-operations-panel.tsx', 'utf8');

// The Guard app is already designed so the guard ALWAYS takes a photo and the note is optional
// (owner, 2026-10-15), so Admin Web no longer offers those per-checkpoint switches.
test('Add checkpoint no longer asks "Guard must take a photo" / "Guard must write a note", and sends only the name', () => {
  assert.doesNotMatch(panel, /Guard must take a photo|Guard must write a note/);
  assert.doesNotMatch(panel, /requirePhoto|requireNote|require_photo|require_note/);
  assert.match(panel, /createCheckpoint\(session\.api, siteId, \{ name: checkpointName\.trim\(\) \}\)/);
  assert.match(panel, /Register its NFC tag next/); // the rest of the form is unchanged
});

// Dark mode: native date/time pickers (calendar icon), dropdown lists and scrollbars must follow the theme.
test('dark theme sets color-scheme: dark so the date field calendar icon is visible', () => {
  const css = readFileSync('app/globals.css', 'utf8');
  assert.match(css, /\.dark \{ color-scheme: dark; \}/);
  assert.match(css, /:root \{ color-scheme: light; \}/);
});
