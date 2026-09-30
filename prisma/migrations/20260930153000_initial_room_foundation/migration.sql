CREATE TYPE "ParticipantType" AS ENUM ('HUMAN', 'AGENT');
CREATE TYPE "AgentStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "DeliveryMode" AS ENUM ('POLLING', 'WEBHOOK');
CREATE TYPE "MessageSourceType" AS ENUM ('STATEMENT');

CREATE TABLE "users" (
  "id" UUID NOT NULL,
  "displayName" TEXT NOT NULL,
  "type" "ParticipantType" NOT NULL DEFAULT 'HUMAN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "users_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "users_type_check" CHECK ("type" = 'HUMAN')
);

CREATE TABLE "agents" (
  "id" UUID NOT NULL,
  "displayName" TEXT NOT NULL,
  "type" "ParticipantType" NOT NULL DEFAULT 'AGENT',
  "status" "AgentStatus" NOT NULL DEFAULT 'ACTIVE',
  "deliveryMode" "DeliveryMode" NOT NULL DEFAULT 'POLLING',
  "webhookUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agents_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agents_type_check" CHECK ("type" = 'AGENT')
);

CREATE TABLE "rooms" (
  "id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "nextSequence" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "room_memberships" (
  "id" UUID NOT NULL,
  "roomId" UUID NOT NULL,
  "participantType" "ParticipantType" NOT NULL,
  "userId" UUID,
  "agentId" UUID,
  "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "room_memberships_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "room_memberships_participant_check" CHECK (("participantType" = 'HUMAN' AND "userId" IS NOT NULL AND "agentId" IS NULL) OR ("participantType" = 'AGENT' AND "agentId" IS NOT NULL AND "userId" IS NULL))
);

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "roomId" UUID NOT NULL,
  "authorType" "ParticipantType" NOT NULL,
  "userId" UUID,
  "agentId" UUID,
  "content" TEXT NOT NULL,
  "sequence" INTEGER NOT NULL,
  "sourceType" "MessageSourceType" NOT NULL DEFAULT 'STATEMENT',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_author_check" CHECK (("authorType" = 'HUMAN' AND "userId" IS NOT NULL AND "agentId" IS NULL) OR ("authorType" = 'AGENT' AND "agentId" IS NOT NULL AND "userId" IS NULL)),
  CONSTRAINT "messages_sequence_positive_check" CHECK ("sequence" > 0)
);

CREATE UNIQUE INDEX "room_memberships_roomId_userId_key" ON "room_memberships"("roomId", "userId");
CREATE UNIQUE INDEX "room_memberships_roomId_agentId_key" ON "room_memberships"("roomId", "agentId");
CREATE INDEX "room_memberships_userId_idx" ON "room_memberships"("userId");
CREATE INDEX "room_memberships_agentId_idx" ON "room_memberships"("agentId");
CREATE UNIQUE INDEX "messages_roomId_sequence_key" ON "messages"("roomId", "sequence");
CREATE INDEX "messages_roomId_createdAt_idx" ON "messages"("roomId", "createdAt");
CREATE INDEX "messages_userId_idx" ON "messages"("userId");
CREATE INDEX "messages_agentId_idx" ON "messages"("agentId");

ALTER TABLE "room_memberships" ADD CONSTRAINT "room_memberships_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_memberships" ADD CONSTRAINT "room_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_memberships" ADD CONSTRAINT "room_memberships_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "messages" ADD CONSTRAINT "messages_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
