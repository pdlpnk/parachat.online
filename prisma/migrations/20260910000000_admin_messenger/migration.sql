CREATE TABLE "AdminLoginThrottle" (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  "windowStartedAt" TIMESTAMPTZ(3) NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 20)
);
-- Global per-admin send window; existing conversation indexes cannot serve this query.
CREATE INDEX "Message_adminAuthorId_createdAt_idx" ON "Message" ("adminAuthorId", "createdAt");
