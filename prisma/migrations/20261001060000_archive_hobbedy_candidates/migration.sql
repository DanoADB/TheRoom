ALTER TABLE "agent_invitations"
  ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "agent_invitations_roomId_archivedAt_idx"
  ON "agent_invitations"("roomId", "archivedAt");
