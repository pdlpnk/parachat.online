CREATE TABLE "AdminTag" (
    "id" UUID NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminTag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AdminTagAssignment" (
    "userId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminTagAssignment_pkey" PRIMARY KEY ("userId", "tagId")
);

CREATE UNIQUE INDEX "AdminTag_name_key" ON "AdminTag"("name");
CREATE UNIQUE INDEX "AdminTag_name_ci_key" ON "AdminTag"(LOWER("name"));
CREATE INDEX "AdminTag_name_idx" ON "AdminTag"("name");
CREATE INDEX "AdminTagAssignment_tagId_assignedAt_idx" ON "AdminTagAssignment"("tagId", "assignedAt");

ALTER TABLE "AdminTagAssignment"
ADD CONSTRAINT "AdminTagAssignment_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminTagAssignment"
ADD CONSTRAINT "AdminTagAssignment_tagId_fkey"
FOREIGN KEY ("tagId") REFERENCES "AdminTag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
