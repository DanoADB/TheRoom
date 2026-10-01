import type { RoomMessage } from "@/lib/isla-agent-protocol";

const REVIEWABLE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_REVIEW_IMAGE_BYTES = 5 * 1024 * 1024;

type InputContent =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "low" };

export async function buildAgentRoomInput(
  text: string,
  attachments: NonNullable<RoomMessage["attachments"]>,
  options: { baseUrl: string; token: string; fetcher?: typeof fetch },
) {
  const content: InputContent[] = [{ type: "input_text", text }];
  const baseUrl = new URL(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;

  for (const attachment of attachments) {
    if (!REVIEWABLE_IMAGE_TYPES.has(attachment.mimeType) || attachment.byteSize > MAX_REVIEW_IMAGE_BYTES) continue;
    let url: URL;
    try {
      url = new URL(attachment.url, baseUrl);
    } catch {
      continue;
    }
    if (url.origin !== baseUrl.origin || !url.pathname.startsWith("/api/messages/")) continue;

    try {
      const response = await fetcher(url, { headers: { Authorization: `Bearer ${options.token}` } });
      if (!response.ok) {
        console.warn(`[Room agent] could not load attached image ${attachment.id}: ${response.status}`);
        continue;
      }
      const image = Buffer.from(await response.arrayBuffer()).toString("base64");
      content.push({ type: "input_image", image_url: `data:${attachment.mimeType};base64,${image}`, detail: "low" });
    } catch (error) {
      console.warn(`[Room agent] could not load attached image ${attachment.id}: ${error instanceof Error ? error.message : error}`);
    }
  }

  if (content.some((part) => part.type === "input_image")) {
    content.push({ type: "input_text", text: "Review the attached picture(s) before deciding how to respond. Be specific about what is visible and say when an interpretation is uncertain." });
  }

  return [{ role: "user" as const, content }];
}
