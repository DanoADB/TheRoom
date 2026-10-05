CREATE TABLE "activity_priorities" (
  "roomId" UUID NOT NULL,
  "entryId" VARCHAR(64) NOT NULL,
  "raisedBy" UUID NOT NULL,
  "raisedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "activity_priorities_pkey" PRIMARY KEY ("roomId", "entryId"),
  CONSTRAINT "activity_priorities_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
