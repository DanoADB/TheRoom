import { describe, expect, it, vi } from "vitest";
import { allowedImageSource, buildImageReplyForm, downloadReplyImage, imageReplySchema } from "./isla-image-reply";
const url = "https://upload.wikimedia.org/wikipedia/commons/a/ab/example.jpg";
const jpeg = () => new Response(new Uint8Array([255, 216, 255, 1]), { headers: { "content-type": "image/jpeg" } });
describe("Isla image replies", () => {
  it("requires explicit bounded image output", () => {
    expect(imageReplySchema.safeParse({ action: "reply", content: "hi" }).success).toBe(false);
    expect(imageReplySchema.safeParse({ action: "reply", content: "", images: Array(5).fill({ url }) }).success).toBe(false);
    expect(imageReplySchema.safeParse({ action: "wait", content: "", images: [] }).success).toBe(true);
  });
  it("rejects private/local/arbitrary sources and description pages", () => {
    for (const source of ["http://upload.wikimedia.org/wikipedia/a.jpg", "https://localhost/x", "https://upload.wikimedia.org.evil.test/wikipedia/x", "https://user:pass@upload.wikimedia.org/wikipedia/x", "https://en.wikipedia.org/wiki/File:Example.jpg", "https://upload.wikimedia.org:444/wikipedia/x"]) expect(() => allowedImageSource(source)).toThrow();
  });
  it("uploads binary files, content and metadata, without source authentication", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jpeg());
    const form = await buildImageReplyForm({ action: "reply", content: " Source ", images: [{ url }] }, { inReplyTo: "human" }, false, fetcher);
    expect(form.get("content")).toBe("Source");
    expect(JSON.parse(form.get("metadata") as string)).toEqual({ inReplyTo: "human" });
    const file = form.get("images") as File;
    expect(file.type).toBe("image/jpeg"); expect(file.size).toBe(4);
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("headers");
    expect(fetcher.mock.calls[0][1]?.redirect).toBe("manual");
  });
  it("validates redirects before fetching destinations", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } }));
    await expect(downloadReplyImage(url, fetcher)).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
    const good = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: url } })).mockResolvedValueOnce(jpeg());
    expect((await downloadReplyImage("https://en.wikipedia.org/wiki/Special:FilePath/Example.jpg", good)).size).toBe(4);
  });
  it("rejects HTML, bad signatures, large declared and streamed bodies", async () => {
    for (const response of [new Response("html", { headers: { "content-type": "text/html" } }), new Response("fake", { headers: { "content-type": "image/jpeg" } }), new Response("", { headers: { "content-type": "image/jpeg", "content-length": "6000000" } }), new Response(new Uint8Array(5 * 1024 * 1024 + 1), { headers: { "content-type": "image/jpeg" } })]) await expect(downloadReplyImage(url, vi.fn<typeof fetch>().mockResolvedValue(response))).rejects.toThrow();
  });
  it("does not fetch images for private or wait replies", async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(buildImageReplyForm({ action: "reply", content: "", images: [{ url }] }, {}, true, fetcher)).rejects.toThrow();
    await expect(buildImageReplyForm({ action: "wait", content: "", images: [{ url }] }, {}, false, fetcher)).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
});
