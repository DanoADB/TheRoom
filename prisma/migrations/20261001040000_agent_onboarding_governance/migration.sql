CREATE TYPE "InvitationStatus" AS ENUM ('WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'CLAIMED');
CREATE TYPE "AdmissionDecision" AS ENUM ('APPROVE', 'REJECT');
CREATE TYPE "CultureProposalStatus" AS ENUM ('OPEN', 'DEBATING', 'ADOPTED', 'REJECTED');
CREATE TYPE "CultureVoteValue" AS ENUM ('YES', 'NO');

CREATE TABLE "agent_invitations" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "tokenHash" VARCHAR(64) NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'WAITING',
    "candidateName" VARCHAR(80),
    "selfDescription" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "humanDecision" "AdmissionDecision",
    "humanDecisionById" UUID,
    "humanDecisionReason" VARCHAR(500),
    "humanDecidedAt" TIMESTAMP(3),
    "islaDecision" "AdmissionDecision",
    "islaDecisionById" UUID,
    "islaDecisionReason" VARCHAR(500),
    "islaDecidedAt" TIMESTAMP(3),
    "claimedAgentId" UUID,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "claimedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdById" UUID NOT NULL,
    "source" VARCHAR(40),
    "sourceReference" VARCHAR(120),
    "provenance" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "agent_invitations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "culture_charters" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "culture_charters_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "culture_proposals" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "proposedById" UUID NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "rationale" TEXT NOT NULL,
    "proposedContent" TEXT NOT NULL,
    "status" "CultureProposalStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    CONSTRAINT "culture_proposals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "culture_votes" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "value" "CultureVoteValue" NOT NULL,
    "rationale" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "culture_votes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "culture_arguments" (
    "id" UUID NOT NULL,
    "proposalId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "culture_arguments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_invitations_tokenHash_key" ON "agent_invitations"("tokenHash");
CREATE UNIQUE INDEX "agent_invitations_claimedAgentId_key" ON "agent_invitations"("claimedAgentId");
CREATE INDEX "agent_invitations_roomId_status_idx" ON "agent_invitations"("roomId", "status");
CREATE INDEX "agent_invitations_expiresAt_idx" ON "agent_invitations"("expiresAt");
CREATE UNIQUE INDEX "agent_invitations_source_sourceReference_key" ON "agent_invitations"("source", "sourceReference");
CREATE UNIQUE INDEX "culture_charters_roomId_key" ON "culture_charters"("roomId");
CREATE INDEX "culture_proposals_roomId_status_idx" ON "culture_proposals"("roomId", "status");
CREATE UNIQUE INDEX "culture_votes_proposalId_agentId_key" ON "culture_votes"("proposalId", "agentId");
CREATE INDEX "culture_votes_agentId_idx" ON "culture_votes"("agentId");
CREATE INDEX "culture_arguments_proposalId_createdAt_idx" ON "culture_arguments"("proposalId", "createdAt");
CREATE INDEX "culture_arguments_agentId_idx" ON "culture_arguments"("agentId");

ALTER TABLE "agent_invitations" ADD CONSTRAINT "agent_invitations_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_invitations" ADD CONSTRAINT "agent_invitations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agent_invitations" ADD CONSTRAINT "agent_invitations_humanDecisionById_fkey" FOREIGN KEY ("humanDecisionById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_invitations" ADD CONSTRAINT "agent_invitations_islaDecisionById_fkey" FOREIGN KEY ("islaDecisionById") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "agent_invitations" ADD CONSTRAINT "agent_invitations_claimedAgentId_fkey" FOREIGN KEY ("claimedAgentId") REFERENCES "agents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "culture_charters" ADD CONSTRAINT "culture_charters_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "culture_proposals" ADD CONSTRAINT "culture_proposals_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "culture_proposals" ADD CONSTRAINT "culture_proposals_proposedById_fkey" FOREIGN KEY ("proposedById") REFERENCES "agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "culture_votes" ADD CONSTRAINT "culture_votes_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "culture_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "culture_votes" ADD CONSTRAINT "culture_votes_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "culture_arguments" ADD CONSTRAINT "culture_arguments_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "culture_proposals"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "culture_arguments" ADD CONSTRAINT "culture_arguments_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
