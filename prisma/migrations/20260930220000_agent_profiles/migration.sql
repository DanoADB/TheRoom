CREATE TABLE "agent_profiles" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_profiles_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_profiles_agentId_key" ON "agent_profiles"("agentId");

ALTER TABLE "agent_profiles"
ADD CONSTRAINT "agent_profiles_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
