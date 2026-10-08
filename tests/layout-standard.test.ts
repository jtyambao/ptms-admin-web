import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

// UI pass 2 (2026-10-08): one layout standard, and no endless lists.
const pages = ['app/account/page.tsx', 'app/accounts/page.tsx', 'app/calls/page.tsx', 'app/dashboard/page.tsx', 'app/settings/page.tsx', 'app/sites/page.tsx', 'app/sites/[siteId]/page.tsx', 'app/sos/page.tsx'];
const read = (p: string) => readFileSync(p, 'utf8');

test('every portal page uses the shared PageContainer, and no page keeps its own padding/width wrapper', () => {
  for (const page of pages) {
    const source = read(page);
    assert.match(source, /<PageContainer/, page);
    assert.doesNotMatch(source, /mx-auto max-w-(6xl|2xl)[^"]* p-5 sm:p-8/, page);
  }
});

test('pages with a title use the shared PageHeader (title, one-line subtitle, actions on the right)', () => {
  for (const page of pages.filter((p) => !p.includes('[siteId]'))) {
    assert.match(read(page), /<PageHeader/, page);
  }
});

test('Site panels have no one-off top margins on their root (the container spaces them)', () => {
  for (const file of readdirSync('components').filter((f) => f.startsWith('site-') && f.endsWith('.tsx'))) {
    assert.doesNotMatch(read(`components/${file}`), /<section className="mt-8/, file);
  }
});

test('long lists are limited with Show more instead of rendering everything', () => {
  const expectations: [string, RegExp][] = [
    ['app/sos/page.tsx', /useShowMore\(history, 5, 10\)/],
    ['components/site-special-check-requests-panel.tsx', /useShowMore\(requests, 5, 10\)/],
    ['components/site-reports-panel.tsx', /useShowMore\(items, 5, 10\)/],
    ['components/site-shift-briefing-panel.tsx', /useShowMore\(older, 5, 10\)/],
    ['components/site-attendance-panel.tsx', /useShowMore\(newestFirst, 7, 14\)/],
    ['components/site-hierarchy-panel.tsx', /useShowMore\(items, 5, 10\)/],
    ['components/site-operations-panel.tsx', /checkpointMore = useShowMore/],
    ['components/site-personnel-panel.tsx', /personnelMore = useShowMore/],
    ['components/site-rounds-panel.tsx', /roundsMore = useShowMore\(shownRounds, 5, 10\)/],
    ['app/calls/page.tsx', /missedMore = useShowMore\(missedCalls, 5, 10\)/],
    ['app/accounts/page.tsx', /usersMore = useShowMore/],
    ['app/sites/page.tsx', /sitesMore = useShowMore/],
  ];
  for (const [file, pattern] of expectations) assert.match(read(file), pattern, file);
});

test('histories are collapsed behind a disclosure with a count', () => {
  assert.match(read('app/sos/page.tsx'), /<Disclosure title="History" count=\{history\.length\}>/);
  assert.match(read('components/site-shift-briefing-panel.tsx'), /<Disclosure title="History" count=\{older\.length\}>/);
});

test('ShowMore says how many are hidden and the shared components exist', () => {
  const layout = read('components/page-layout.tsx');
  assert.match(layout, /Show \{next\} more/);
  assert.match(layout, /export function ExpandableText/);
  assert.match(layout, /export function Disclosure/);
});
