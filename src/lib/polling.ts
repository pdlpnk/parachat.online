import type { MessageDTO } from "./messages";
export type MessageBatch = { messages: MessageDTO[]; hasMore: boolean; readSequence: number; unreadCount: number };
/** One request at a time. Cursor advances only through fetched batches, never send responses. */
export function createPoller(initialCursor: number, fetchBatch: (cursor: number, signal: AbortSignal) => Promise<MessageBatch>, onBatch: (batch: MessageBatch, cursor: number) => void, onError: (error: unknown) => void, interval = 5000) {
  let cursor = initialCursor, active = false, running = false, again = false;
  let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
  async function cycle() {
    if (!active || running) return;
    running = true; again = false; let delay = interval;
    controller = new AbortController(); const signal = controller.signal;
    try {
      for (let page = 0; page < 10 && active; page++) {
        const batch = await fetchBatch(cursor, signal);
        if (signal.aborted || !active) break;
        const next = batch.messages.at(-1)?.sequence ?? cursor;
        if (batch.hasMore && next <= cursor) throw new Error("Polling cursor did not advance");
        cursor = Math.max(cursor, next); onBatch(batch, cursor);
        if (!batch.hasMore) break;
        if (page === 9) delay = 250;
      }
    } catch (error) { if (!signal.aborted && active) onError(error); }
    finally { running = false; if (active) timer = setTimeout(() => void cycle(), again ? 0 : delay); }
  }
  return {
    resume() { active = true; clearTimeout(timer); if (running) again = true; else void cycle(); },
    pause() { active = false; clearTimeout(timer); controller?.abort(); },
  };
}
