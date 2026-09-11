BEGIN;
ALTER TABLE "AdminTag" ADD COLUMN color VARCHAR(12) NOT NULL DEFAULT 'gray';
ALTER TABLE "AdminTag" ADD CONSTRAINT "AdminTag_color_allowed" CHECK (color IN ('gray','green','blue','purple','orange','red','yellow','teal','pink'));
ALTER TABLE "Attachment" DROP CONSTRAINT "Attachment_metadata_valid";
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_metadata_valid" CHECK (
 "byteSize" BETWEEN 1 AND 10485760 AND checksum ~ '^[a-f0-9]{64}$'
 AND "mediaType" IN ('image/jpeg','image/png','image/webp','application/pdf','video/mp4')
 AND char_length(btrim("displayFilename"))>0 AND char_length(btrim("storageKey"))>0
);
ALTER TABLE "Message" DROP CONSTRAINT "Message_content_matches_type";
ALTER TABLE "Message" ADD CONSTRAINT "Message_content_matches_type" CHECK (
 ("authorType"='SYSTEM' AND body IS NULL AND "systemKey" IS NOT NULL
 AND "systemKey" ~ '^system\.[A-Za-z][A-Za-z0-9_.]*$' AND "sourceLocale" IS NOT NULL
 AND "systemParams" IS NOT NULL AND jsonb_typeof("systemParams")='object') OR
 ("authorType" IN ('USER','OPERATOR') AND body IS NOT NULL AND char_length(btrim(body)) BETWEEN 0 AND 5000
 AND "systemKey" IS NULL AND "systemParams" IS NULL AND "sourceLocale" IS NULL)
);
CREATE FUNCTION lina_message_has_content() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid;
BEGIN
 IF TG_TABLE_NAME='Message' THEN target=NEW.id; ELSE target=OLD."messageId"; END IF;
 IF EXISTS (SELECT 1 FROM "Message" m WHERE m.id=target AND m."authorType"<>'SYSTEM' AND char_length(btrim(m.body))=0
 AND NOT EXISTS (SELECT 1 FROM "Attachment" a WHERE a."messageId"=m.id)) THEN
 RAISE EXCEPTION 'Message requires text or attachment' USING ERRCODE='23514'; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER "Message_requires_content" AFTER INSERT OR UPDATE ON "Message"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lina_message_has_content();
CREATE CONSTRAINT TRIGGER "Attachment_preserves_content" AFTER DELETE OR UPDATE ON "Attachment"
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION lina_message_has_content();
COMMIT;
