CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "fileName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(32) NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_attachments_messageId_sortOrder_key"
ON "message_attachments"("messageId", "sortOrder");

CREATE INDEX "message_attachments_messageId_idx"
ON "message_attachments"("messageId");

ALTER TABLE "message_attachments"
ADD CONSTRAINT "message_attachments_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
