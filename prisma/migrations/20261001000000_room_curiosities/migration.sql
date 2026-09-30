CREATE TABLE "room_curiosities" (
    "id" UUID NOT NULL,
    "roomId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "kind" VARCHAR(32) NOT NULL,
    "title" VARCHAR(140) NOT NULL,
    "reason" VARCHAR(280),
    "sourceMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "room_curiosities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "room_curiosities_roomId_kind_idx" ON "room_curiosities"("roomId", "kind");
CREATE INDEX "room_curiosities_agentId_idx" ON "room_curiosities"("agentId");

ALTER TABLE "room_curiosities"
ADD CONSTRAINT "room_curiosities_roomId_fkey"
FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "room_curiosities"
ADD CONSTRAINT "room_curiosities_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
