ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Existing approved accounts predate verification and are trusted as established users.
UPDATE "User" SET "emailVerifiedAt" = CURRENT_TIMESTAMP WHERE "role" <> 'PENDING';

CREATE TABLE "AccountActionToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountActionToken_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "AccountActionToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AccountActionToken_tokenHash_key" ON "AccountActionToken"("tokenHash");
CREATE INDEX "AccountActionToken_userId_purpose_expiresAt_idx" ON "AccountActionToken"("userId", "purpose", "expiresAt");
CREATE INDEX "AccountActionToken_expiresAt_idx" ON "AccountActionToken"("expiresAt");
