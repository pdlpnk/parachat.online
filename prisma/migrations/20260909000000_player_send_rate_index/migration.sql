-- Bounded per-conversation USER rate-window lookup; no new tables or stored counters.
CREATE INDEX "Message_conversationId_authorType_createdAt_idx" ON "Message" ("conversationId", "authorType", "createdAt");
