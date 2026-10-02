import { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError, apiErrorResponse } from "@/lib/api-errors";
import { authenticateAgent, requireAgentRoomMembership } from "@/lib/agent-auth";
import { ISLA_AGENT_ID, MVP_ROOM_ID } from "@/lib/room-constants";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({ inboundMessageId: z.string().uuid(), replyMessageId: z.string().uuid() });
const e164 = /^\+[1-9]\d{7,14}$/;

export async function POST(request: Request) {
  try {
    const agent = await authenticateAgent(request);
    if (agent.id !== ISLA_AGENT_ID) throw new ApiError(403, "isla_required", "Only Freya can deliver SMS replies.");
    await requireAgentRoomMembership(agent.id, MVP_ROOM_ID);
    const input = inputSchema.parse(await request.json());
    const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
    const keySid = process.env.TWILIO_API_KEY_SID?.trim();
    const keySecret = process.env.TWILIO_API_KEY_SECRET?.trim();
    const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
    const toNumber = process.env.TWILIO_DANO_NUMBER?.trim();
    if (!accountSid || !/^AC[0-9a-fA-F]{32}$/.test(accountSid) || !keySid || !/^SK[0-9a-fA-F]{32}$/.test(keySid) || !keySecret || !fromNumber || !e164.test(fromNumber) || !toNumber || !e164.test(toNumber)) {
      throw new ApiError(503, "sms_not_configured", "Twilio SMS is not fully configured.");
    }

    const inbound = await prisma.twilioSmsInbound.findUnique({ where: { messageId: input.inboundMessageId } });
    if (!inbound) throw new ApiError(403, "sms_reply_not_allowed", "Replies can only be sent for an inbound SMS recorded by this Room.");

    const [publicReply, privateReply] = await Promise.all([
      prisma.message.findFirst({ where: { id: input.replyMessageId, agentId: agent.id, roomId: MVP_ROOM_ID }, select: { content: true, metadata: true } }),
      prisma.privateMessage.findFirst({ where: { id: input.replyMessageId, agentId: agent.id }, select: { content: true, metadata: true } }),
    ]);
    const reply = publicReply ?? privateReply;
    const metadata = reply?.metadata;
    if (!metadata || typeof metadata !== "object" || !("inReplyTo" in metadata) || metadata.inReplyTo !== input.inboundMessageId) {
      throw new ApiError(403, "sms_reply_not_allowed", "The reply must be an existing Freya message linked to this inbound SMS.");
    }
    const body = reply.content.trim();
    if (!body) throw new ApiError(403, "sms_reply_not_allowed", "The reply cannot be empty.");
    if (body.length > 1_600) throw new ApiError(422, "sms_reply_too_long", "SMS replies must be 1,600 characters or fewer.");

    try {
      await prisma.twilioSmsDelivery.create({
        data: { replyMessageId: input.replyMessageId, inboundMessageId: input.inboundMessageId, status: "PENDING" },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return Response.json({ delivered: false, duplicate: true });
      throw error;
    }

    const form = new URLSearchParams({ To: toNumber, From: fromNumber, Body: body });
    try {
      const twilioResponse = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${keySid}:${keySecret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form,
      });
      if (!twilioResponse.ok) {
        await prisma.twilioSmsDelivery.update({ where: { replyMessageId: input.replyMessageId }, data: { status: "FAILED", lastError: `TWILIO_HTTP_${twilioResponse.status}` } });
        throw new ApiError(502, "sms_delivery_failed", "Twilio did not accept the SMS reply.");
      }
      const result = await twilioResponse.json() as { sid?: string };
      await prisma.twilioSmsDelivery.update({
        where: { replyMessageId: input.replyMessageId },
        data: { status: "SENT", twilioMessageSid: result.sid ?? null, lastError: null },
      });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      await prisma.twilioSmsDelivery.update({ where: { replyMessageId: input.replyMessageId }, data: { status: "FAILED", lastError: "TWILIO_REQUEST_ERROR" } });
      throw new ApiError(502, "sms_delivery_failed", "Twilio SMS delivery could not be confirmed.");
    }

    return Response.json({ delivered: true });
  } catch (error) {
    if (error instanceof SyntaxError) return apiErrorResponse(new ApiError(400, "invalid_json", "Request body must be valid JSON."));
    if (error instanceof z.ZodError) return apiErrorResponse(new ApiError(400, "invalid_request", "The SMS reply request is invalid."));
    return apiErrorResponse(error);
  }
}
