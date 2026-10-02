import { Prisma } from "@prisma/client";
import { DANO_USER_ID, MVP_ROOM_ID } from "@/lib/room-constants";
import { prisma } from "@/lib/prisma";
import { verifyTwilioRequest } from "@/lib/twilio-signature";

const MAX_BODY_BYTES = 16_384;
const e164 = /^\+[1-9]\d{7,14}$/;
const twiml = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

function response(status = 200) {
  return new Response(twiml, { status, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) return response(413);
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/x-www-form-urlencoded")) return response(415);

  const webhookUrl = process.env.TWILIO_WEBHOOK_URL?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const danoNumber = process.env.TWILIO_DANO_NUMBER?.trim();
  const roomNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (!webhookUrl || !authToken || !danoNumber || !roomNumber || !e164.test(danoNumber) || !e164.test(roomNumber)) return response(503);

  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return response(413);
  const form = new URLSearchParams(rawBody);
  const parameters = Object.fromEntries(form.entries());
  if (!verifyTwilioRequest(webhookUrl, parameters, request.headers.get("x-twilio-signature"), authToken)) return response(403);

  const from = parameters.From;
  const to = parameters.To;
  const messageSid = parameters.MessageSid;
  const content = parameters.Body?.trim();
  if (from !== danoNumber || to !== roomNumber || !messageSid || !content || content.length > 1_600) return response();

  try {
    await prisma.$transaction(async (tx) => {
      const room = await tx.room.update({ where: { id: MVP_ROOM_ID }, data: { nextSequence: { increment: 1 } }, select: { nextSequence: true } });
      const message = await tx.message.create({
        data: {
          roomId: MVP_ROOM_ID,
          authorType: "HUMAN",
          userId: DANO_USER_ID,
          content,
          sequence: room.nextSequence,
          metadata: { smsInbound: true },
        },
        select: { id: true },
      });
      await tx.twilioSmsInbound.create({ data: { messageSid, messageId: message.id } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return response();
    console.error("[Twilio SMS] Could not record an inbound message.", error);
    return response(500);
  }

  return response();
}
