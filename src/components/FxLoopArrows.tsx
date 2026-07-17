import { useRef } from 'react';

interface FxLoopArrowsProps {
  /** Current SEND position (1..10). */
  send: number;
  /** Current RETURN position (1..10). */
  ret: number;
  /** Called when the user drags or keyboard-shifts SEND. New position is unclamped; parent clamps + push-constraints. */
  onSendChange: (pos: number) => void;
  onReturnChange: (pos: number) => void;
}

export function FxLoopArrows({ send, ret, onSendChange, onReturnChange }: FxLoopArrowsProps) {
  const dragKindRef = useRef<'send' | 'return' | null>(null);
  const bypass = send === ret;

  function handleArrowKey(kind: 'send' | 'return', e: React.KeyboardEvent<HTMLButtonElement>) {
    const current = kind === 'send' ? send : ret;
    let next = current;
    if (e.key === 'ArrowRight') next = Math.min(10, current + 1);
    else if (e.key === 'ArrowLeft') next = Math.max(1, current - 1);
    else return;
    e.preventDefault();
    (kind === 'send' ? onSendChange : onReturnChange)(next);
  }

  function handleDragStart(kind: 'send' | 'return', e: React.DragEvent<HTMLButtonElement>) {
    dragKindRef.current = kind;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', kind);
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(gap: number) {
    if (dragKindRef.current === 'send') onSendChange(gap);
    else if (dragKindRef.current === 'return') onReturnChange(gap);
    dragKindRef.current = null;
  }

  return (
    <div
      className="relative mb-2 font-mono-display select-none"
      style={{ background: 'rgba(0,0,0,0.03)', border: '1px solid rgba(0,0,0,0.10)', borderRadius: 8, padding: '6px 4px' }}
    >
      <div className="flex items-center justify-between gap-1 text-label uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
        {['PRE', 'WAH', 'BST', 'AMP', 'NR', 'CAB', 'EQ', 'MOD', 'DLY', 'RVB', 'VOL'].map((name, idx) => (
          <div key={name} className="flex items-center" style={{ flex: '1 1 0', minWidth: 0 }}>
            <span className="opacity-50 px-1">{name}</span>
            {idx < 10 && (
              <div
                role="presentation"
                data-gap={idx + 1}
                onDragOver={handleDragOver}
                onDrop={() => handleDrop(idx + 1)}
                className="relative flex-1 flex flex-col items-center justify-center"
                style={{ minHeight: 28 }}
              >
                {send === idx + 1 && (
                  <button
                    type="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => handleDragStart('send', e)}
                    onKeyDown={(e) => handleArrowKey('send', e)}
                    aria-label={`FX Loop Send position, currently between effects ${idx + 1} and ${idx + 2}`}
                    aria-valuemin={1}
                    aria-valuemax={10}
                    aria-valuenow={send}
                    role="slider"
                    data-bypass={bypass}
                    title={bypass ? 'FX Loop bypass (Send = Return)' : 'Send'}
                    className="leading-none cursor-grab"
                    style={{
                      color: 'var(--accent-amber)',
                      opacity: bypass ? 0.5 : 1,
                      transform: 'translateY(-2px)',
                    }}
                  >
                    ↗
                  </button>
                )}
                {ret === idx + 1 && (
                  <button
                    type="button"
                    tabIndex={0}
                    draggable
                    onDragStart={(e) => handleDragStart('return', e)}
                    onKeyDown={(e) => handleArrowKey('return', e)}
                    aria-label={`FX Loop Return position, currently between effects ${idx + 1} and ${idx + 2}`}
                    aria-valuemin={1}
                    aria-valuemax={10}
                    aria-valuenow={ret}
                    role="slider"
                    data-bypass={bypass}
                    title={bypass ? 'FX Loop bypass (Send = Return)' : 'Return'}
                    className="leading-none cursor-grab"
                    style={{
                      color: 'var(--accent-amber)',
                      opacity: bypass ? 0.5 : 1,
                      transform: 'translateY(2px)',
                    }}
                  >
                    ↘
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
