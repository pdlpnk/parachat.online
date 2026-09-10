BEGIN;
-- Deterministic Unicode casing, independent of database LC_CTYPE (including C).
-- PostgreSQL must include ICU support (Ubuntu PostgreSQL packages do).
CREATE COLLATION lina_unicode (provider = icu, locale = 'und', deterministic = true);
ALTER TABLE "AdminTag" DROP CONSTRAINT "AdminTag_normalized";
UPDATE "AdminTag" SET "normalizedName" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g') COLLATE lina_unicode);
-- Existing conflicting names fail the unique index rather than silently merge tags.
ALTER TABLE "AdminTag" ADD CONSTRAINT "AdminTag_normalized" CHECK (
  char_length(btrim("name")) > 0 AND "normalizedName" = lower(regexp_replace(btrim("name"), '\s+', ' ', 'g') COLLATE lina_unicode)
);
COMMIT;
