import { ApiError } from "@/lib/api-errors";

export const MAX_MESSAGE_IMAGES = 4;
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_REQUEST_BYTES = MAX_MESSAGE_IMAGES * MAX_IMAGE_BYTES + 64_000;

const IMAGE_SIGNATURES: Record<string, (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) => bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value),
  "image/gif": (bytes) => bytes.length >= 6 && ["GIF89a", "GIF87a"].includes(String.fromCharCode(...bytes.slice(0, 6))),
  "image/webp": (bytes) => bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP",
};

export type PreparedImage = {
  fileName: string;
  mimeType: string;
  byteSize: number;
  data: Uint8Array<ArrayBuffer>;
};

export async function prepareMessageImages(files: File[]): Promise<PreparedImage[]> {
  if (files.length > MAX_MESSAGE_IMAGES) {
    throw new ApiError(400, "too_many_images", `Attach no more than ${MAX_MESSAGE_IMAGES} images to one message.`);
  }

  return Promise.all(files.map(async (file) => {
    if (!(file.type in IMAGE_SIGNATURES)) {
      throw new ApiError(400, "unsupported_image", "Images must be JPEG, PNG, WebP, or GIF files.");
    }
    if (file.size === 0 || file.size > MAX_IMAGE_BYTES) {
      throw new ApiError(413, "image_too_large", "Each image must be no larger than 5 MB.");
    }

    const data = new Uint8Array(await file.arrayBuffer());
    if (!IMAGE_SIGNATURES[file.type](data)) {
      throw new ApiError(400, "invalid_image", "An attached file does not match its declared image type.");
    }

    return {
      fileName: cleanFileName(file.name),
      mimeType: file.type,
      byteSize: data.byteLength,
      data,
    };
  }));
}

function cleanFileName(value: string) {
  const cleaned = value.replace(/[\\/\u0000-\u001f\u007f]/g, "_").trim();
  return (cleaned || "image").slice(0, 255);
}
