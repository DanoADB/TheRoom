CREATE TABLE "agent_room_cursors" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "lastSeenSequence" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "agent_room_cursors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "agent_room_cursors_agentId_roomId_key"
ON "agent_room_cursors"("agentId", "roomId");

CREATE INDEX "agent_room_cursors_roomId_idx" ON "agent_room_cursors"("roomId");

ALTER TABLE "agent_room_cursors"
ADD CONSTRAINT "agent_room_cursors_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_room_cursors"
ADD CONSTRAINT "agent_room_cursors_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;
