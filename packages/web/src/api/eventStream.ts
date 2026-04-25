import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

type Topic =
  | 'actions'
  | 'sessions'
  | 'approvals'
  | 'escalations'
  | 'team'
  | 'approval-routes'
  | 'escalation-rules'
  | 'config';

const INVALIDATE_KEYS: Record<Topic, Array<readonly string[]>> = {
  actions:            [['actions'], ['stats']],
  sessions:           [['sessions'], ['actions']],
  approvals:          [['approvals'], ['actions']],
  escalations:        [['escalations'], ['approvals']],
  team:               [['team']],
  'approval-routes':  [['approval-routes']],
  'escalation-rules': [['escalation-rules']],
  config:             [['config']],
};

/**
 * Subscribes to /api/events and invalidates the relevant React Query keys
 * whenever the server emits. Falls back silently if the stream cannot be
 * established (e.g. server restart) — the existing polling intervals remain
 * the safety net.
 */
export function useEventStream() {
  const qc = useQueryClient();
  useEffect(() => {
    if (typeof EventSource === 'undefined') return;

    let es: EventSource | null = null;
    let retry: number | null = null;
    let cancelled = false;

    const open = () => {
      es = new EventSource('/api/events');
      const handler = (topic: Topic) => () => {
        for (const key of INVALIDATE_KEYS[topic]) {
          qc.invalidateQueries({ queryKey: [...key] });
        }
      };
      (Object.keys(INVALIDATE_KEYS) as Topic[]).forEach((t) => es?.addEventListener(t, handler(t)));
      es.onerror = () => {
        es?.close();
        es = null;
        if (cancelled) return;
        // Reconnect with a small backoff so we don't hammer the server.
        retry = window.setTimeout(open, 3000);
      };
    };

    open();

    return () => {
      cancelled = true;
      if (retry !== null) window.clearTimeout(retry);
      es?.close();
    };
  }, [qc]);
}
