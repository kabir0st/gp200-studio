import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import {
  fetchMessages,
  postMessage,
  ForumApiError,
  type ForumMessage,
} from '@/core/forumApi';
import { loadForumName, saveForumName } from '@/core/forumNameCache';

interface ForumSheetProps {
  open: boolean;
  onClose: () => void;
}

const MAX_NAME = 40;
const MAX_TEXT = 500;

function formatTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Public message wall. Anyone can leave a name + message; the feed is shown to
 * everyone. Profanity masking and validation are authoritative on the server
 * (worker/index.js); this only prefills the cached name and renders the feed.
 */
export function ForumSheet({ open, onClose }: ForumSheetProps) {
  const [messages, setMessages] = useState<ForumMessage[]>([]);
  const [visits, setVisits] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadedOnce = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchMessages();
      setMessages(data.messages);
      setVisits(data.visits);
    } catch (err) {
      setError(err instanceof ForumApiError ? err.message : 'Could not load messages.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch each time the sheet opens; prefill the cached name once.
  useEffect(() => {
    if (!open) return;
    if (!loadedOnce.current) {
      loadedOnce.current = true;
      const cached = loadForumName();
      if (cached) setName(cached);
    }
    void load();
  }, [open, load]);

  const canSubmit =
    name.trim().length > 0 && text.trim().length > 0 && !submitting;

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!canSubmit) return;
      const trimmedName = name.trim();
      const trimmedText = text.trim();
      setSubmitting(true);
      setError(null);
      try {
        const created = await postMessage(trimmedName, trimmedText);
        saveForumName(trimmedName);
        setMessages((prev) => [created, ...prev]);
        setText('');
      } catch (err) {
        setError(err instanceof ForumApiError ? err.message : 'Could not post message.');
      } finally {
        setSubmitting(false);
      }
    },
    [canSubmit, name, text],
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Community Wall"
      placement="right"
      maxWidth="max-w-lg"
      padding="p-0"
      className="flex flex-col"
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
        style={{ borderBottom: '1px solid var(--border-active)' }}
      >
        <span className="font-mono-display font-bold" style={{ color: 'var(--text-primary)' }}>
          COMMUNITY WALL
        </span>
        {visits !== null && (
          <span
            className="font-mono-display text-caption"
            style={{ color: 'var(--text-muted)' }}
            title="Total page visits"
          >
            {visits.toLocaleString()} visits
          </span>
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto"
          aria-label="Close community wall"
          style={{ color: 'var(--text-muted)' }}
        >
          ✕
        </button>
      </div>

      {/* Compose */}
      <form onSubmit={handleSubmit} className="px-4 py-3 space-y-2 flex-shrink-0">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={MAX_NAME}
          placeholder="Your name"
          aria-label="Your name"
          className="w-full font-mono-display text-sm rounded px-2 py-1.5"
          style={{ border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
        />
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_TEXT}
          rows={3}
          placeholder="Leave a message…"
          aria-label="Your message"
          className="w-full font-mono-display text-sm rounded px-2 py-1.5 resize-y"
          style={{ border: '1px solid var(--border-active)', color: 'var(--text-primary)' }}
        />
        <div className="flex items-center gap-2">
          <span className="font-mono-display text-caption" style={{ color: 'var(--text-muted)' }}>
            {text.length}/{MAX_TEXT}
          </span>
          <Button type="submit" size="sm" disabled={!canSubmit} className="ml-auto">
            {submitting ? 'Posting…' : 'Post'}
          </Button>
        </div>
        {error && (
          <p className="font-mono-display text-caption" style={{ color: 'var(--accent-red)' }} role="alert">
            {error}
          </p>
        )}
      </form>

      {/* Feed */}
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-2 space-y-2" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        {loading && messages.length === 0 && (
          <p className="font-mono-display text-caption" style={{ color: 'var(--text-muted)' }}>
            Loading…
          </p>
        )}
        {!loading && messages.length === 0 && !error && (
          <p className="font-mono-display text-caption" style={{ color: 'var(--text-muted)' }}>
            No messages yet. Be the first to leave one.
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className="rounded px-3 py-2"
            style={{ border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}
          >
            <div className="flex items-baseline gap-2">
              <span className="font-mono-display text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {m.name}
              </span>
              <span className="font-mono-display text-micro" style={{ color: 'var(--text-muted)' }}>
                {formatTime(m.created_at)}
              </span>
            </div>
            <p className="text-sm mt-1 whitespace-pre-wrap break-words" style={{ color: 'var(--text-secondary)' }}>
              {m.text}
            </p>
          </div>
        ))}
      </div>
    </Dialog>
  );
}
