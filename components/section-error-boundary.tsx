'use client';

import { Component, type ReactNode } from 'react';
import { describeError } from '@/lib/describe-error';

// A failure inside one feature (e.g. Calls) must not take the whole page
// down with the framework's generic "This page couldn't load" screen, and
// must say what actually went wrong so it can be reported and fixed. The
// message is plain; the technical detail sits behind "Details for support".
type Props = { title: string; children: ReactNode };
type State = { error: unknown | null };

export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error('Unknown error') };
  }

  componentDidCatch(error: unknown) {
    console.error(`[${this.props.title}] crashed:`, error);
  }

  render() {
    if (this.state.error === null) return this.props.children;
    return (
      <section role="alert" className="mt-8 rounded-2xl border border-red-300 bg-red-50 p-5 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100">
        <h2 className="text-lg font-black">{this.props.title} could not be shown</h2>
        <p className="mt-2">Something went wrong on this part of the page. The rest of the portal still works.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            className="h-10 rounded-lg bg-[#f36f0a] px-4 font-bold text-white"
            onClick={() => this.setState({ error: null })}
            type="button"
          >
            Try again
          </button>
          <button
            className="h-10 rounded-lg border px-4 font-bold"
            onClick={() => window.location.reload()}
            type="button"
          >
            Reload the page
          </button>
        </div>
        <details className="mt-4">
          <summary className="cursor-pointer font-bold">Details for support</summary>
          <p className="mt-2 break-words font-mono text-xs">{describeError(this.state.error)}</p>
        </details>
      </section>
    );
  }
}
