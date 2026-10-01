CREATE TYPE "GalleryPriority" AS ENUM (
  'GALLERY_WORTHY',
  'NEEDS_IMPLEMENTATION',
  'INTERESTING_BUT_NOT_YET_WORTH_CHANGING'
);

ALTER TABLE "room_curiosities"
  ADD COLUMN "priority" "GalleryPriority" NOT NULL DEFAULT 'NEEDS_IMPLEMENTATION';

ALTER TABLE "agent_gallery_items"
  ADD COLUMN "priority" "GalleryPriority" NOT NULL DEFAULT 'GALLERY_WORTHY';

CREATE INDEX "room_curiosities_roomId_priority_idx"
  ON "room_curiosities"("roomId", "priority");

CREATE INDEX "agent_gallery_items_agentId_priority_idx"
  ON "agent_gallery_items"("agentId", "priority");
