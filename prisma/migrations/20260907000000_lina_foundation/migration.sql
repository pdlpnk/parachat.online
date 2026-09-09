-- LINA only. Apply to an independent PostgreSQL database.
BEGIN;

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Locale" AS ENUM ('RU', 'EN', 'TR', 'AZ');

-- CreateEnum
CREATE TYPE "MessageAuthorType" AS ENUM ('USER', 'OPERATOR', 'SYSTEM');

-- CreateTable
CREATE TABLE "Client" (
    "id" UUID NOT NULL,
    "liNumber" INTEGER GENERATED ALWAYS AS IDENTITY (START WITH 1 INCREMENT BY 1 MINVALUE 1 MAXVALUE 999999 NO CYCLE),
    "liId" VARCHAR(8) GENERATED ALWAYS AS ('LI' || lpad("liNumber"::text, 6, '0')) STORED NOT NULL,
    "displayName" VARCHAR(80) NOT NULL,
    "locale" "Locale" NOT NULL DEFAULT 'EN',
    "avatarEmoji" VARCHAR(32) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientCredential" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "credentialHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" UUID NOT NULL,
    "clientId" UUID NOT NULL,
    "firstUserMessageAt" TIMESTAMPTZ(3),
    "lastMessageAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "lastSequence" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "authorType" "MessageAuthorType" NOT NULL,
    "clientAuthorId" UUID,
    "adminAuthorId" UUID,
    "body" VARCHAR(5000),
    "systemKey" VARCHAR(160),
    "systemParams" JSONB,
    "sourceLocale" "Locale",
    "idempotencyKey" VARCHAR(160) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "storageKey" VARCHAR(255) NOT NULL,
    "displayFilename" VARCHAR(240) NOT NULL,
    "mediaType" VARCHAR(120) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "displayName" VARCHAR(120) NOT NULL,
    "passwordHash" VARCHAR(255) NOT NULL,
    "disabledAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminSession" (
    "id" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "tokenHash" CHAR(64) NOT NULL,
    "idleExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminTag" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "normalizedName" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "AdminTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTag" (
    "clientId" UUID NOT NULL,
    "tagId" UUID NOT NULL,

    CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("clientId","tagId")
);

-- CreateTable
CREATE TABLE "ClientConversationRead" (
    "conversationId" UUID NOT NULL,
    "lastReadSequence" INTEGER,
    "lastReadAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientConversationRead_pkey" PRIMARY KEY ("conversationId")
);

-- CreateTable
CREATE TABLE "AdminConversationRead" (
    "conversationId" UUID NOT NULL,
    "adminId" UUID NOT NULL,
    "lastReadSequence" INTEGER,
    "lastReadAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminConversationRead_pkey" PRIMARY KEY ("conversationId","adminId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Client_liNumber_key" ON "Client"("liNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Client_liId_key" ON "Client"("liId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_avatarEmoji_key" ON "Client"("avatarEmoji");

-- CreateIndex
CREATE UNIQUE INDEX "ClientCredential_credentialHash_key" ON "ClientCredential"("credentialHash");

-- CreateIndex
CREATE INDEX "ClientCredential_clientId_idx" ON "ClientCredential"("clientId");

-- CreateIndex
CREATE INDEX "ClientCredential_expiresAt_idx" ON "ClientCredential"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_clientId_key" ON "Conversation"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_id_clientId_key" ON "Conversation"("id", "clientId");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_idempotencyKey_key" ON "Message"("conversationId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "Message_conversationId_sequence_key" ON "Message"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Message_id_conversationId_key" ON "Message"("id", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_storageKey_key" ON "Attachment"("storageKey");

-- CreateIndex
CREATE INDEX "Attachment_messageId_conversationId_idx" ON "Attachment"("messageId", "conversationId");

-- CreateIndex
CREATE INDEX "Attachment_conversationId_idx" ON "Attachment"("conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_email_key" ON "Admin"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminSession_tokenHash_key" ON "AdminSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AdminSession_adminId_idx" ON "AdminSession"("adminId");

-- CreateIndex
CREATE INDEX "AdminSession_idleExpiresAt_idx" ON "AdminSession"("idleExpiresAt");

-- CreateIndex
CREATE INDEX "AdminSession_absoluteExpiresAt_idx" ON "AdminSession"("absoluteExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "AdminTag_normalizedName_key" ON "AdminTag"("normalizedName");

-- CreateIndex
CREATE INDEX "ClientTag_tagId_clientId_idx" ON "ClientTag"("tagId", "clientId");

-- CreateIndex
CREATE INDEX "AdminConversationRead_adminId_idx" ON "AdminConversationRead"("adminId");

-- AddForeignKey
ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_clientAuthorId_fkey" FOREIGN KEY ("clientAuthorId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_adminAuthorId_fkey" FOREIGN KEY ("adminAuthorId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_messageId_conversationId_fkey" FOREIGN KEY ("messageId", "conversationId") REFERENCES "Message"("id", "conversationId") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "AdminTag"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientConversationRead" ADD CONSTRAINT "ClientConversationRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "ClientConversationRead" ADD CONSTRAINT "ClientConversationRead_conversationId_lastReadSequence_fkey" FOREIGN KEY ("conversationId", "lastReadSequence") REFERENCES "Message"("conversationId", "sequence") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdminConversationRead" ADD CONSTRAINT "AdminConversationRead_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdminConversationRead" ADD CONSTRAINT "AdminConversationRead_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "AdminConversationRead" ADD CONSTRAINT "AdminConversationRead_conversationId_lastReadSequence_fkey" FOREIGN KEY ("conversationId", "lastReadSequence") REFERENCES "Message"("conversationId", "sequence") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Public LI identity is allocated by PostgreSQL and cannot be changed.
ALTER TABLE "Client" ADD CONSTRAINT "Client_liNumber_range" CHECK ("liNumber" BETWEEN 1 AND 999999);
ALTER TABLE "Client" ADD CONSTRAINT "Client_liId_format" CHECK ("liId" ~ '^LI[0-9]{6}$');
ALTER TABLE "Client" ADD CONSTRAINT "Client_name_nonempty" CHECK (char_length(btrim("displayName")) > 0);
ALTER TABLE "Client" ADD CONSTRAINT "Client_emoji_nonempty" CHECK (char_length("avatarEmoji") > 0);

CREATE FUNCTION lina_immutable_client_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."liNumber" IS DISTINCT FROM OLD."liNumber" THEN
    RAISE EXCEPTION 'Client identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Client_identity_immutable" BEFORE UPDATE ON "Client"
FOR EACH ROW EXECUTE FUNCTION lina_immutable_client_identity();

-- At most one: UNIQUE clientId. At least one: checked at transaction commit.
-- Creation must insert Client + Conversation in ONE transaction.
CREATE FUNCTION lina_require_client_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'Client' THEN target_id := NEW."id";
  ELSE target_id := OLD."clientId";
  END IF;
  IF EXISTS (SELECT 1 FROM "Client" WHERE "id" = target_id)
    AND NOT EXISTS (SELECT 1 FROM "Conversation" WHERE "clientId" = target_id) THEN
    RAISE EXCEPTION 'Client requires one permanent conversation' USING ERRCODE = '23514';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER "Client_requires_conversation" AFTER INSERT ON "Client"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lina_require_client_conversation();
CREATE CONSTRAINT TRIGGER "Conversation_required_by_client" AFTER DELETE ON "Conversation"
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lina_require_client_conversation();

CREATE FUNCTION lina_immutable_conversation_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id" OR NEW."clientId" IS DISTINCT FROM OLD."clientId" THEN
    RAISE EXCEPTION 'Conversation identity is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Conversation_identity_immutable" BEFORE UPDATE ON "Conversation"
FOR EACH ROW EXECUTE FUNCTION lina_immutable_conversation_identity();

-- One row lock per conversation serializes allocation AND transaction completion.
-- It changes only the counter: actual send/activation policy belongs to the next stage.
CREATE FUNCTION lina_assign_message_sequence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."sequence" IS NOT NULL THEN
    RAISE EXCEPTION 'Message sequence is database generated' USING ERRCODE = '23514';
  END IF;
  UPDATE "Conversation" SET "lastSequence" = "lastSequence" + 1
    WHERE "id" = NEW."conversationId" RETURNING "lastSequence" INTO NEW."sequence";
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversation does not exist' USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Message_allocate_sequence" BEFORE INSERT ON "Message"
FOR EACH ROW EXECUTE FUNCTION lina_assign_message_sequence();

CREATE FUNCTION lina_immutable_message_position() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW."id", NEW."conversationId", NEW."sequence", NEW."idempotencyKey")
    IS DISTINCT FROM (OLD."id", OLD."conversationId", OLD."sequence", OLD."idempotencyKey") THEN
    RAISE EXCEPTION 'Message identity and position are immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "Message_position_immutable" BEFORE UPDATE ON "Message"
FOR EACH ROW EXECUTE FUNCTION lina_immutable_message_position();

ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_sequence_nonnegative" CHECK ("lastSequence" >= 0);
ALTER TABLE "Message" ADD CONSTRAINT "Message_sequence_positive" CHECK ("sequence" > 0);
ALTER TABLE "Message" ADD CONSTRAINT "Message_idempotency_nonempty" CHECK (char_length(btrim("idempotencyKey")) > 0);
ALTER TABLE "Message" ADD CONSTRAINT "Message_author_matches_type" CHECK (
  ("authorType" = 'USER' AND "clientAuthorId" IS NOT NULL AND "adminAuthorId" IS NULL) OR
  ("authorType" = 'OPERATOR' AND "clientAuthorId" IS NULL AND "adminAuthorId" IS NOT NULL) OR
  ("authorType" = 'SYSTEM' AND "clientAuthorId" IS NULL AND "adminAuthorId" IS NULL)
);
ALTER TABLE "Message" ADD CONSTRAINT "Message_content_matches_type" CHECK (
  ("authorType" = 'SYSTEM' AND "body" IS NULL AND "systemKey" IS NOT NULL
    AND "systemKey" ~ '^system\.[A-Za-z][A-Za-z0-9_.]*$'
    AND "sourceLocale" IS NOT NULL AND "systemParams" IS NOT NULL
    AND jsonb_typeof("systemParams") = 'object') OR
  ("authorType" IN ('USER', 'OPERATOR') AND "body" IS NOT NULL
    AND char_length(btrim("body")) BETWEEN 1 AND 5000
    AND "systemKey" IS NULL AND "systemParams" IS NULL AND "sourceLocale" IS NULL)
);
ALTER TABLE "Message" ADD CONSTRAINT "Message_client_owns_conversation"
FOREIGN KEY ("conversationId", "clientAuthorId") REFERENCES "Conversation" ("id", "clientId")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_hash_hex" CHECK ("credentialHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "ClientCredential" ADD CONSTRAINT "ClientCredential_expiry" CHECK ("expiresAt" > "createdAt");
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_hash_hex" CHECK ("tokenHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "AdminSession" ADD CONSTRAINT "AdminSession_expiry" CHECK (
  "idleExpiresAt" > "createdAt" AND "absoluteExpiresAt" >= "idleExpiresAt"
);
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_email_normalized" CHECK (
  "email" = lower(btrim("email")) AND char_length("email") > 0
);
ALTER TABLE "AdminTag" ADD CONSTRAINT "AdminTag_normalized" CHECK (
  char_length(btrim("name")) > 0 AND "normalizedName" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g'))
);
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_metadata_valid" CHECK (
  "byteSize" BETWEEN 1 AND 10485760 AND "checksum" ~ '^[a-f0-9]{64}$'
  AND "mediaType" IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  AND char_length(btrim("displayFilename")) > 0
  AND char_length(btrim("storageKey")) > 0
);

CREATE FUNCTION lina_read_cursor_forward_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF COALESCE(NEW."lastReadSequence", 0) < COALESCE(OLD."lastReadSequence", 0) THEN
    RAISE EXCEPTION 'Read cursor cannot move backwards' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "ClientRead_forward_only" BEFORE UPDATE ON "ClientConversationRead"
FOR EACH ROW EXECUTE FUNCTION lina_read_cursor_forward_only();
CREATE TRIGGER "AdminRead_forward_only" BEFORE UPDATE ON "AdminConversationRead"
FOR EACH ROW EXECUTE FUNCTION lina_read_cursor_forward_only();

-- Scope and ordering are applied in SQL before pagination.
CREATE INDEX "Conversation_active_order" ON "Conversation" ("lastMessageAt" DESC NULLS LAST, "id")
WHERE "firstUserMessageAt" IS NOT NULL AND "closedAt" IS NULL;
CREATE INDEX "Conversation_archive_order" ON "Conversation" ("lastMessageAt" DESC NULLS LAST, "id")
WHERE "firstUserMessageAt" IS NULL OR "closedAt" IS NOT NULL;

COMMIT;
