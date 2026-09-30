CREATE TYPE "GalleryItemKind" AS ENUM ('INITIAL', 'INTERNET_IMAGE');

CREATE TABLE "agent_gallery_items" (
    "id" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "kind" "GalleryItemKind" NOT NULL DEFAULT 'INITIAL',
    "title" VARCHAR(140) NOT NULL,
    "provenance" VARCHAR(280) NOT NULL,
    "imageUrl" TEXT,
    "visualMeta" JSONB NOT NULL DEFAULT '{}',
    "steerAway" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_gallery_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "agent_gallery_items_agentId_kind_idx" ON "agent_gallery_items"("agentId", "kind");
CREATE INDEX "agent_gallery_items_agentId_steerAway_idx" ON "agent_gallery_items"("agentId", "steerAway");

ALTER TABLE "agent_gallery_items"
ADD CONSTRAINT "agent_gallery_items_agentId_fkey"
FOREIGN KEY ("agentId") REFERENCES "agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
