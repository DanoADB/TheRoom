ALTER TABLE "private_messages" ADD COLUMN "channel" VARCHAR(40) NOT NULL DEFAULT 'isla';
-- Existing April/Friday messages belong only to their pair; all Dano/Freya history stays in isla.
UPDATE "private_messages" SET "channel" = 'friday'
WHERE "userId" = 'a9000000-0000-4000-8000-000000000002'::uuid
   OR "agentId" = 'f71da000-0000-4000-8000-000000000004'::uuid;
CREATE INDEX "private_messages_channel_sequence_idx" ON "private_messages"("channel", "sequence");
CREATE TABLE "private_channel_cursors" (
  "agentId" UUID NOT NULL,
  "channel" VARCHAR(40) NOT NULL,
  "lastSeenSequence" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "private_channel_cursors_pkey" PRIMARY KEY ("agentId", "channel")
);
