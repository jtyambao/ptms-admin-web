// Site page navigation (UI pass, 2026-10-07). The Site page used to show ten
// tabs in one strip, which is a lot to scan for a non-technical admin and does
// not fit a phone. They are grouped into five by task; each group with more
// than one part shows a small switcher inside it. The old section ids are kept
// as the page's real state and as /sites/4?tab=<id> deep links, so every
// existing link and bookmark keeps working.

export type SiteSection =
  | 'overview'
  | 'people'
  | 'devices'
  | 'checkpoints'
  | 'rounds'
  | 'briefing'
  | 'emergency-contacts'
  | 'reports'
  | 'requests'
  | 'attendance';

export type SiteGroupId = 'overview' | 'people' | 'patrols' | 'handover' | 'requests';

export type SiteGroup = {
  id: SiteGroupId;
  label: string;
  items: { section: SiteSection; label: string }[];
};

export const SITE_GROUPS: SiteGroup[] = [
  { id: 'overview', label: 'Overview', items: [{ section: 'overview', label: 'Overview' }] },
  {
    id: 'people',
    label: 'People & Phones',
    items: [
      { section: 'people', label: 'People' },
      { section: 'devices', label: 'Phones' },
    ],
  },
  {
    id: 'patrols',
    label: 'Patrols',
    items: [
      { section: 'checkpoints', label: 'Checkpoints' },
      { section: 'rounds', label: 'Rounds' },
    ],
  },
  {
    id: 'handover',
    label: 'Handover & Contacts',
    items: [
      { section: 'briefing', label: 'Pre-Shift Briefing' },
      { section: 'emergency-contacts', label: 'Emergency Contacts' },
    ],
  },
  {
    id: 'requests',
    label: 'Requests & Reports',
    items: [
      { section: 'requests', label: 'Requests' },
      { section: 'reports', label: 'Reports' },
      { section: 'attendance', label: 'Attendance' },
    ],
  },
];

export function groupOf(section: SiteSection): SiteGroup {
  return SITE_GROUPS.find((group) => group.items.some((item) => item.section === section)) ?? SITE_GROUPS[0];
}

/** Resolves a ?tab= value: an old section id, or a group id (opens its first part). */
export function sectionFromTab(value: string | null | undefined): SiteSection | null {
  if (!value) return null;
  for (const group of SITE_GROUPS) {
    for (const item of group.items) if (item.section === value) return item.section;
  }
  const group = SITE_GROUPS.find((candidate) => candidate.id === value);
  return group ? group.items[0].section : null;
}
