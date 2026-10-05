import { z } from "zod";
import { MAX_IMAGE_BYTES, MAX_MESSAGE_IMAGES, prepareMessageImages } from "./message-attachments";

export const imageReplySchema = z.object({
  action: z.enum(["reply", "wait"]),
  content: z.string().max(8000),
  images: z.array(z.object({ url: z.string().url().max(2000) }).strict()).max(MAX_MESSAGE_IMAGES),
}).strict();

// No credential is used for source downloads. Validate every redirect, not just the first URL.
export function allowedImageSource(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error("Invalid image source");
  const binary = ["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname) && url.pathname.startsWith("/wikipedia/");
  const redirect = ["en.wikipedia.org", "commons.wikimedia.org"].includes(url.hostname)
    && /^\/wiki\/Special:(FilePath|Redirect\/file)\//i.test(url.pathname);
  if (!binary && !redirect) throw new Error("Only Wikimedia image files are supported");
  return url;
}

export async function downloadReplyImage(value: string, fetcher: typeof fetch = fetch): Promise<File> {
  let url = allowedImageSource(value);
  const signal = AbortSignal.timeout(20000);
  for (let hop = 0; hop < 5; hop++) {
    const response = await fetcher(url, { redirect: "manual", signal });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new Error("Image redirect has no destination");
      url = allowedImageSource(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !["upload.wikimedia.org", "thumb.wikimedia.org"].includes(url.hostname)) {
      await response.body?.cancel();
      throw new Error("Image download failed");
    }
    const mime = response.headers.get("content-type")?.split(";")[0].trim() ?? "";
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(mime)
      || Number(response.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) {
      await response.body?.cancel();
      throw new Error("Unsupported or oversized image");
    }
    if (!response.body) throw new Error("Empty image response");
    const reader = response.body.getReader();
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > MAX_IMAGE_BYTES) throw new Error("Image exceeds 5 MB");
        chunks.push(new Uint8Array(part.value));
      }
    } finally { await reader.cancel(); }
    const file = new File(chunks, decodeURIComponent(url.pathname.split("/").at(-1) || "image"), { type: mime });
    await prepareMessageImages([file]); // Same byte signatures and size limits as the Room API.
    return file;
  }
  throw new Error("Too many image redirects");
}

export async function buildImageReplyForm(
  reply: z.infer<typeof imageReplySchema>, metadata: Record<string, unknown>, privately: boolean,
  fetcher: typeof fetch = fetch,
): Promise<FormData> {
  imageReplySchema.parse(reply);
  if (privately || reply.action !== "reply" || !reply.images.length) throw new Error("Images require a public reply");
  const form = new FormData();
  form.set("content", reply.content.trim());
  form.set("metadata", JSON.stringify(metadata));
  for (const image of reply.images) form.append("images", await downloadReplyImage(image.url, fetcher));
  return form;
}
