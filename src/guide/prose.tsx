import type { ReactNode } from 'react';
import { Card } from '@/components/ui/Card';

/**
 * Shared typography for the guide's body copy. These existed as repeated
 * className strings inside the old single-file Guide; pulling them out keeps
 * the thirteen section files readable and keeps the styling in one place.
 */

/** A sub-heading within a section. Renders h3 — the page's h1 is the section
 *  title and h2 is reserved for the FAQ, so the outline stays well formed. */
export function H3({ children }: { children: ReactNode }) {
  return (
    <h3 className="font-mono-display text-base font-bold tracking-wide text-text-primary mt-6">
      {children}
    </h3>
  );
}

/** A bulleted list at the guide's standard measure. */
export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-5 space-y-1.5">{children}</ul>;
}

/** A boxed aside — caveats, gotchas, "why this takes a moment". */
export function Note({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="p-4 mt-4 max-w-4xl">
      <p className="font-mono-display text-micro font-bold tracking-widest uppercase text-text-muted mb-1.5">
        {title}
      </p>
      <div className="font-mono-display text-caption tracking-wide text-text-secondary [&>p]:m-0 [&>p+p]:mt-2">
        {children}
      </div>
    </Card>
  );
}

/** An outbound link, styled like the guide's inline links. */
export function A({ href, children }: { href: string; children: ReactNode }) {
  const external = href.startsWith('http');
  return (
    <a
      href={href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="underline text-text-secondary hover:text-accent-amber"
    >
      {children}
    </a>
  );
}
