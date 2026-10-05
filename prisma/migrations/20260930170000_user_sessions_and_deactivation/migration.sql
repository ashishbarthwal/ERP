ALTER TABLE "User"
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "User"
ADD CONSTRAINT "User_tokenVersion_nonnegative_check"
CHECK ("tokenVersion" >= 0);
