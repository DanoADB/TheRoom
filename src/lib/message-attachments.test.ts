import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_IMAGES, prepareMessageImages } from "@/lib/message-attachments";

const pngHeader = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("message image validation", () => {
  it("accepts an image whose bytes match its declared type", async () => {
    const [image] = await prepareMessageImages([new File([pngHeader], "example.png", { type: "image/png" })]);

    expect(image).toMatchObject({ fileName: "example.png", mimeType: "image/png", byteSize: 8 });
    expect(image.data).toEqual(pngHeader);
  });

  it("rejects disguised non-image content", async () => {
    await expect(prepareMessageImages([
      new File(["this is not a png"], "fake.png", { type: "image/png" }),
    ])).rejects.toThrow("does not match");
  });

  it("rejects more than the per-message image limit", async () => {
    const files = Array.from({ length: MAX_MESSAGE_IMAGES + 1 }, (_, index) =>
      new File([pngHeader], `${index}.png`, { type: "image/png" }),
    );
    await expect(prepareMessageImages(files)).rejects.toThrow(`no more than ${MAX_MESSAGE_IMAGES}`);
  });
});
