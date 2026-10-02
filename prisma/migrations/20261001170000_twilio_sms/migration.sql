CREATE TABLE "twilio_sms_inbound" (
    "messageSid" TEXT NOT NULL,
    "messageId" UUID NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "twilio_sms_inbound_pkey" PRIMARY KEY ("messageSid")
);

CREATE UNIQUE INDEX "twilio_sms_inbound_messageId_key" ON "twilio_sms_inbound"("messageId");

CREATE TABLE "twilio_sms_deliveries" (
    "replyMessageId" UUID NOT NULL,
    "inboundMessageId" UUID NOT NULL,
    "twilioMessageSid" TEXT,
    "status" VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    "lastError" VARCHAR(80),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "twilio_sms_deliveries_pkey" PRIMARY KEY ("replyMessageId")
);

CREATE UNIQUE INDEX "twilio_sms_deliveries_twilioMessageSid_key" ON "twilio_sms_deliveries"("twilioMessageSid");
CREATE INDEX "twilio_sms_deliveries_inboundMessageId_idx" ON "twilio_sms_deliveries"("inboundMessageId");
