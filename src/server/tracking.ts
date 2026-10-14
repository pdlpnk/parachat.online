import { randomUUID } from "node:crypto";
import type { Locale } from "../lib/preferences";
import type { Conversion } from "../lib/tracking";

// Only returned after the owning transaction commits. Never replayed from history/retries.
// A future CAPI sender must persist/reuse THIS eventId, not a Client/LI ID or a second UUID.
export function conversionReceipt(event: Conversion["event"], locale: Locale): Conversion {
  return { event, eventId: randomUUID(), locale: locale.toLowerCase() as Conversion["locale"] };
}
