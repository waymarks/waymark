import type { Response } from 'express';

export type EventTopic =
  | 'actions'
  | 'sessions'
  | 'approvals'
  | 'escalations'
  | 'team'
  | 'approval-routes'
  | 'escalation-rules'
  | 'config';

interface Subscriber {
  res: Response;
  closed: boolean;
}

const subscribers = new Set<Subscriber>();

export function attachSubscriber(res: Response): () => void {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();

  const sub: Subscriber = { res, closed: false };
  subscribers.add(sub);

  // Initial hello so the client opens onmessage cleanly
  res.write(`event: hello\ndata: {"ok":true}\n\n`);

  return () => {
    sub.closed = true;
    subscribers.delete(sub);
  };
}

export function emit(topic: EventTopic, payload: Record<string, unknown> = {}): void {
  const data = JSON.stringify({ topic, ...payload });
  const frame = `event: ${topic}\ndata: ${data}\n\n`;
  for (const sub of subscribers) {
    if (sub.closed) continue;
    try { sub.res.write(frame); }
    catch { /* client disconnected; cleanup happens via close handler */ }
  }
}

// Heartbeat keeps proxies / browsers from closing the stream.
const HEARTBEAT_MS = 25_000;
setInterval(() => {
  for (const sub of subscribers) {
    if (sub.closed) continue;
    try { sub.res.write(`: heartbeat\n\n`); } catch { /* noop */ }
  }
}, HEARTBEAT_MS).unref?.();
