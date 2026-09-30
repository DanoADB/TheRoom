ALTER TABLE "users" ADD COLUMN "accessCodeHash" TEXT;

CREATE TABLE "human_sessions" (
  "id" UUID NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "human_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_accessCodeHash_key" ON "users"("accessCodeHash");
CREATE UNIQUE INDEX "human_sessions_tokenHash_key" ON "human_sessions"("tokenHash");
CREATE INDEX "human_sessions_userId_idx" ON "human_sessions"("userId");
CREATE INDEX "human_sessions_expiresAt_idx" ON "human_sessions"("expiresAt");

ALTER TABLE "human_sessions" ADD CONSTRAINT "human_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
