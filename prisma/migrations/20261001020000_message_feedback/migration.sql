CREATE TYPE "FeedbackValue" AS ENUM ('UP', 'DOWN');

CREATE TABLE "message_feedback" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "value" "FeedbackValue" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "message_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "message_feedback_messageId_userId_key" ON "message_feedback"("messageId", "userId");
CREATE INDEX "message_feedback_userId_createdAt_idx" ON "message_feedback"("userId", "createdAt");

ALTER TABLE "message_feedback"
ADD CONSTRAINT "message_feedback_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "message_feedback"
ADD CONSTRAINT "message_feedback_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
