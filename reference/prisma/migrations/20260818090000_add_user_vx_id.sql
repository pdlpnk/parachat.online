-- VX ID is a permanent public identifier. PostgreSQL owns allocation so
-- concurrent registrations cannot observe or reuse the same number.
CREATE SEQUENCE "User_vxId_seq"
  AS INTEGER
  MINVALUE 1
  MAXVALUE 999999
  NO CYCLE;

ALTER TABLE "User"
  ADD COLUMN "vxId" VARCHAR(8);

WITH ordered_users AS (
  SELECT
    "id",
    row_number() OVER (ORDER BY "createdAt" ASC, "id" ASC) AS sequence_number
  FROM "User"
)
UPDATE "User" AS target
SET "vxId" = 'VX' || lpad(ordered_users.sequence_number::text, 6, '0')
FROM ordered_users
WHERE target."id" = ordered_users."id";

SELECT setval(
  '"User_vxId_seq"',
  GREATEST((SELECT count(*) FROM "User"), 1),
  (SELECT count(*) FROM "User") > 0
);

ALTER SEQUENCE "User_vxId_seq" OWNED BY "User"."vxId";

ALTER TABLE "User"
  ALTER COLUMN "vxId" SET DEFAULT ('VX' || lpad(nextval('"User_vxId_seq"')::text, 6, '0')),
  ALTER COLUMN "vxId" SET NOT NULL,
  ADD CONSTRAINT "User_vxId_format_check" CHECK ("vxId" ~ '^VX[0-9]{6}$');

CREATE UNIQUE INDEX "User_vxId_key" ON "User"("vxId");

CREATE FUNCTION prevent_user_vx_id_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."vxId" IS DISTINCT FROM OLD."vxId" THEN
    RAISE EXCEPTION 'VX ID is immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "User_vxId_immutable"
BEFORE UPDATE OF "vxId" ON "User"
FOR EACH ROW
EXECUTE FUNCTION prevent_user_vx_id_change();
