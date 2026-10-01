CREATE TABLE "private_messages" (
  "id" UUID NOT NULL,
  "authorType" "ParticipantType" NOT NULL,
  "userId" UUID,
  "agentId" UUID,
  "content" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "sequence" SERIAL NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "private_messages_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "private_messages_sequence_key" ON "private_messages"("sequence");
CREATE INDEX "private_messages_userId_createdAt_idx" ON "private_messages"("userId", "createdAt");
CREATE INDEX "private_messages_agentId_createdAt_idx" ON "private_messages"("agentId", "createdAt");
ALTER TABLE "private_messages" ADD CONSTRAINT "private_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "private_messages" ADD CONSTRAINT "private_messages_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
