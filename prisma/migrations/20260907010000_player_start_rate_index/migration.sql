-- Supports the shared, transaction-locked new-identity creation ceiling.
-- No token material or attempt table is introduced.
CREATE INDEX "ClientCredential_createdAt_idx" ON "ClientCredential"("createdAt");
