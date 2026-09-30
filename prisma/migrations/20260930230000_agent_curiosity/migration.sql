CREATE TABLE "agent_curiosity" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "interests" JSONB NOT NULL DEFAULT '[]',
    "lastExploredAt" TIMESTAMP(3),
    "researchDay" TEXT,
    "researchCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_curiosity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_curiosity_agentId_key" ON "agent_curiosity"("agentId");

ALTER TABLE "agent_curiosity"
ADD CONSTRAINT "agent_curiosity_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
