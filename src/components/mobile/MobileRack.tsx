import type { ReactNode } from 'react';

interface MobileRackProps {
  title: string;
  children: ReactNode;
}

/**
 * A rack unit to mount a borrowed panel in.
 *
 * The looper, the drum machine and the device readouts are the desktop's own
 * components, reused whole — the phone tree borrows entire components or none
 * of them, and never reaches inside one to restyle it. So the work happens
 * around them: rack ears, a screwed-down face plate and a name, which is what
 * turns a stack of unrelated forms into equipment in the same rig.
 */
export function MobileRack({ title, children }: MobileRackProps) {
  return (
    <section className="m-rack">
      <div className="m-rack-plate">
        <span className="m-rack-ear" aria-hidden="true" />
        <h2 className="m-rack-title">{title}</h2>
        <span className="m-rack-ear" aria-hidden="true" />
      </div>
      <div className="m-rack-body">{children}</div>
    </section>
  );
}
