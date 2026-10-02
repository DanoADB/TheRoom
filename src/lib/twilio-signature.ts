import { createHmac, timingSafeEqual } from "node:crypto";

export function twilioRequestSignature(url: string, parameters: Record<string, string>, authToken: string) {
  const payload = Object.keys(parameters).sort().reduce((result, key) => result + key + parameters[key], url);
  return createHmac("sha1", authToken).update(payload, "utf8").digest("base64");
}

export function verifyTwilioRequest(url: string, parameters: Record<string, string>, signature: string | null, authToken: string) {
  if (!signature || !authToken) return false;
  const expected = Buffer.from(twilioRequestSignature(url, parameters, authToken));
  const supplied = Buffer.from(signature);
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}
