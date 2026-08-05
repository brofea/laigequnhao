import sharp from "sharp";
import jsQR from "jsqr";
import { expect, type Page } from "@playwright/test";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export type PreviewImage = Readonly<{
  contentType: string | null;
  bytes: number[];
  width: number;
  height: number;
  pixels: number[];
}>;

export type PngInfo = Readonly<{
  width: number;
  height: number;
  hasIdat: boolean;
  hasIend: boolean;
}>;

export async function readImagePreview(page: Page, alt: string): Promise<PreviewImage> {
  const image = page.getByAltText(alt);
  await expect(image).toBeVisible();
  return image.evaluate(async (element) => {
    const img = element as HTMLImageElement;
    const source = img.currentSrc || img.src;
    const response = await fetch(source);
    const bytes = Array.from(new Uint8Array(await response.arrayBuffer()));
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("无法读取图片预览像素。");
    context.drawImage(img, 0, 0);
    return {
      contentType: response.headers.get("content-type"),
      bytes,
      width: img.naturalWidth,
      height: img.naturalHeight,
      pixels: Array.from(context.getImageData(0, 0, canvas.width, canvas.height).data),
    };
  });
}

export function parsePng(bytes: Uint8Array): PngInfo {
  expect(Array.from(bytes.slice(0, PNG_SIGNATURE.length))).toEqual(PNG_SIGNATURE);

  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let hasIdat = false;
  let hasIend = false;
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset, 8);
    const length = view.getUint32(0);
    const name = String.fromCharCode(...bytes.slice(offset + 4, offset + 8));
    const chunkEnd = offset + 12 + length;
    expect(chunkEnd).toBeLessThanOrEqual(bytes.length);

    if (name === "IHDR") {
      expect(length).toBe(13);
      const header = new DataView(bytes.buffer, bytes.byteOffset + offset + 8, 13);
      width = header.getUint32(0);
      height = header.getUint32(4);
    } else if (name === "IDAT") {
      hasIdat = true;
    } else if (name === "IEND") {
      hasIend = true;
      expect(length).toBe(0);
      expect(chunkEnd).toBe(bytes.length);
      break;
    }
    offset = chunkEnd;
  }

  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  expect(hasIdat).toBe(true);
  expect(hasIend).toBe(true);
  return { width, height, hasIdat, hasIend };
}

export function assertPreviewPng(
  preview: PreviewImage,
  limits: { maxDimension: number; maxBytes: number },
): PngInfo {
  expect(preview.contentType?.toLowerCase()).toBe("image/png");
  expect(preview.bytes.length).toBeLessThanOrEqual(limits.maxBytes);
  const info = parsePng(Uint8Array.from(preview.bytes));
  expect(Math.max(info.width, info.height)).toBeLessThanOrEqual(limits.maxDimension);
  expect(preview.width).toBe(info.width);
  expect(preview.height).toBe(info.height);
  return info;
}

export async function inspectPng(bytes: Uint8Array) {
  const metadata = await sharp(bytes).metadata();
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { metadata, data, info };
}

export async function assertLogoPng(bytes: Uint8Array) {
  const { metadata, data } = await inspectPng(bytes);
  expect(metadata.hasAlpha).toBe(true);
  expect(Array.from(data).some((value, index) => index % 4 === 3 && value < 255)).toBe(true);
}

export async function assertQrPng(bytes: Uint8Array, expectedValue: string) {
  const { data, info } = await inspectPng(bytes);
  for (let index = 3; index < data.length; index += 4) expect(data[index]).toBe(255);
  expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(expectedValue);
}
