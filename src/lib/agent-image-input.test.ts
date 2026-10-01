import { describe, expect, it, vi } from "vitest";
import { buildAgentRoomInput } from "@/lib/agent-image-input";
import type { RoomMessage } from "@/lib/isla-agent-protocol";

const attachment = (overrides: Partial<NonNullable<RoomMessage["attachments"]>[number]> = {}) => ({
  id: "image-1",
  fileName: "photo.png",
  mimeType: "image/png",
  byteSize: 8,
  url: "/api/messages/message-1/attachments/image-1",
  ...overrides,
});

describe("agent Room image input", () => {
  it("passes attached images and the membership token to a vision model", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])));

    const [message] = await buildAgentRoomInput("What is in this picture?", [attachment()], {
      baseUrl: "https://room.example",
      token: "agent-secret",
      fetcher,
    });

    expect(fetcher).toHaveBeenCalledWith(
      new URL("https://room.example/api/messages/message-1/attachments/image-1"),
      { headers: { Authorization: "Bearer agent-secret" } },
    );
    expect(message.content).toEqual([
      { type: "input_text", text: "What is in this picture?" },
      { type: "input_image", image_url: "data:image/png;base64,AQID", detail: "low" },
      { type: "input_text", text: "Review the attached picture(s) before deciding how to respond. Be specific about what is visible and say when an interpretation is uncertain." },
    ]);
  });

  it("supports GIFs, but never sends another host's URL or oversized files", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(new Uint8Array([1])));
    const [message] = await buildAgentRoomInput("Review these", [
      attachment({ mimeType: "image/gif", fileName: "motion.gif" }),
      attachment({ id: "external", url: "https://attacker.example/image.png" }),
      attachment({ id: "large", byteSize: 5 * 1024 * 1024 + 1 }),
    ], { baseUrl: "https://room.example", token: "agent-secret", fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(message.content).toHaveLength(3);
    expect(message.content[1]).toMatchObject({ type: "input_image", image_url: "data:image/gif;base64,AQ==" });
  });

  it("keeps text available if an image cannot be fetched", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 404 }));
    const [message] = await buildAgentRoomInput("Please inspect", [attachment()], {
      baseUrl: "https://room.example",
      token: "agent-secret",
      fetcher,
    });

    expect(message.content).toEqual([{ type: "input_text", text: "Please inspect" }]);
  });
});
