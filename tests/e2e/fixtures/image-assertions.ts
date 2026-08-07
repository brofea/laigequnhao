import sharp from "sharp";
import jsQR from "jsqr";
import { expect, type Page } from "@playwright/test";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];

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
  const { contentType, base64 } = await image.evaluate(async (element) => {
    const img = element as HTMLImageElement;
    const source = img.currentSrc || img.src;
    const response = await fetch(source);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return {
      contentType: response.headers.get("content-type"),
      base64: btoa(binary),
    };
  });
  // 页面内不做 canvas 绘制/像素读取：WebKit 下 canvas 软件光栅化会间歇性
  // 阻塞页面主线程，导致其后的 CDP 操作（click/expect/waitForTimeout）超时。
  // 像素在 Node 侧用 sharp 异步解码（libuv 线程池，不阻塞测试主线程）。
  const bytes = Buffer.from(base64, "base64");
  const metadata = await sharp(bytes).metadata();
  const { data } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return {
    contentType,
    bytes: Array.from(bytes),
    width: metadata.width,
    height: metadata.height,
    pixels: Array.from(data),
  };
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

export async function assertPreviewJpeg(
  preview: PreviewImage,
  limits: { maxDimension: number; maxBytes: number },
) {
  expect(preview.contentType?.toLowerCase()).toBe("image/jpeg");
  expect(preview.bytes.length).toBeLessThanOrEqual(limits.maxBytes);
  expect(preview.bytes.slice(0, 3)).toEqual(JPEG_SIGNATURE);
  expect(preview.bytes.slice(-2)).toEqual([0xff, 0xd9]);
  const metadata = await sharp(Uint8Array.from(preview.bytes)).metadata();
  expect(metadata.format).toBe("jpeg");
  expect(Math.max(metadata.width, metadata.height)).toBeLessThanOrEqual(limits.maxDimension);
  expect(preview.width).toBe(metadata.width);
  expect(preview.height).toBe(metadata.height);
  return metadata;
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
  // 逐元素 expect 会触发海量断言开销阻塞 Node 主线程，改为一次批量断言
  expect(data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
  expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(expectedValue);
}

export async function assertQrJpeg(bytes: Uint8Array, expectedValue: string) {
  expect(Array.from(bytes.slice(0, 3))).toEqual(JPEG_SIGNATURE);
  expect(Array.from(bytes.slice(-2))).toEqual([0xff, 0xd9]);
  const { data, info } = await sharp(bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(data.every((value, index) => index % 4 !== 3 || value === 255)).toBe(true);
  expect(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data).toBe(expectedValue);
}
