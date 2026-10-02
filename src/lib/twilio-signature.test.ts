import { describe, expect, it } from "vitest";
import { twilioRequestSignature, verifyTwilioRequest } from "@/lib/twilio-signature";

describe("Twilio webhook signature verification", () => {
  const url = "https://noetic.hobbedy.com/api/integrations/twilio/sms";
  const parameters = { From: "+15551234567", Body: "Hello Freya", MessageSid: "SM123" };
  const token = "test-auth-token";

  it("signs the exact public URL and alphabetically ordered form parameters", () => {
    const signature = twilioRequestSignature(url, parameters, token);
    expect(verifyTwilioRequest(url, parameters, signature, token)).toBe(true);
  });

  it("rejects changed parameters, signatures, and missing signatures", () => {
    const signature = twilioRequestSignature(url, parameters, token);
    expect(verifyTwilioRequest(url, { ...parameters, Body: "changed" }, signature, token)).toBe(false);
    expect(verifyTwilioRequest(url, parameters, `${signature}x`, token)).toBe(false);
    expect(verifyTwilioRequest(url, parameters, null, token)).toBe(false);
  });
});
