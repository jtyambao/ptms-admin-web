'use client';

import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// ONE layout standard for every page (UI pass 2, 2026-10-08):
//   - PageContainer: the same max width, side padding and top/bottom spacing,
//     with a gap-6 rhythm between its direct children.
//   - PageHeader: eyebrow + title + one-line subtitle on the left, actions on
//     the right (they wrap under the title on a phone).
//   - Section: a titled block (optional subtitle and actions) - panels inside
//     a Site tab use this instead of their own one-off margins.
//   - Disclosure / ShowMore: long lists show the newest few, with the count
//     of what is hidden, instead of running on and on.
export function PageContainer({ children, narrow = false }: { children: ReactNode; narrow?: boolean }) {
  return (
    <div className={`mx-auto w-full space-y-6 px-4 py-6 sm:px-8 sm:py-8 ${narrow ? 'max-w-2xl' : 'max-w-6xl'}`}>
      {children}
    </div>
  );
}

export function PageHeader({
  eyebrow, title, subtitle, actions, icon,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">{eyebrow}</p>}
        <h1 className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight sm:text-3xl">{icon}{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({
  title, subtitle, eyebrow, actions, children, className = '',
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`space-y-4 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-bold uppercase tracking-[.14em] text-[#e86405]">{eyebrow}</p>}
            {title && <h2 className="mt-1 text-xl font-black">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** A card-style container: the same border, radius and padding everywhere. */
export function Panel({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border bg-card ${className}`}>{children}</div>;
}

/** Secondary content (a history, an archive) collapsed by default, with a count. */
export function Disclosure({
  title, count, defaultOpen = false, children,
}: {
  title: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-2xl border bg-card">
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 p-4 text-left font-black"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span>
          {title}
          {count !== undefined && <span className="ml-2 text-sm font-normal text-muted-foreground">({count})</span>}
        </span>
        <ChevronDown className={`size-4 shrink-0 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="border-t">{children}</div>}
    </div>
  );
}

/** "Show 7 more" under a list that is cut off; renders nothing when nothing is hidden. */
export function ShowMore({
  remaining, onClick, step,
}: {
  remaining: number;
  onClick: () => void;
  step?: number;
}) {
  if (remaining <= 0) return null;
  const next = step ? Math.min(step, remaining) : remaining;
  return (
    <div className="border-t p-3 text-center">
      <Button variant="ghost" size="sm" onClick={onClick}>
        Show {next} more{next < remaining ? ` (${remaining} hidden)` : ''}
      </Button>
    </div>
  );
}

/** Pagination state for a list: shows `initial` items, then `step` more per click. */
export function useShowMore<T>(items: T[], initial = 5, step = 10) {
  const [shown, setShown] = useState(initial);
  return {
    visible: items.slice(0, shown),
    remaining: Math.max(0, items.length - shown),
    showMore: () => setShown((value) => value + step),
    step,
  };
}

/** Label/value rows that stay readable on a phone. */
export function Facts({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 gap-2">
          <dt className="shrink-0 font-bold text-muted-foreground">{item.label}</dt>
          <dd className="min-w-0 break-words">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Long free text cut to a few lines, with the full text one tap away. */
export function ExpandableText({ text, lines = 2 }: { text: string; lines?: 2 | 3 }) {
  const [open, setOpen] = useState(false);
  const long = text.length > 140 || text.split('\n').length > lines;
  return (
    <div>
      <p className={`whitespace-pre-line break-words ${open || !long ? '' : lines === 2 ? 'line-clamp-2' : 'line-clamp-3'}`}>{text}</p>
      {long && (
        <button className="mt-1 text-xs font-bold text-[#e86405]" onClick={() => setOpen((value) => !value)} type="button">
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}
