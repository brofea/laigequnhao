import { PhotonImage } from "@cf-wasm/photon/workerd";
import {
  ASSET_UPLOAD_REQUEST_MAX_BYTES,
  getAssetPolicy,
  type AssetPurpose,
} from "@shared/contracts/asset";

const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_SIGNATURE_BYTES = PNG_SIGNATURE.byteLength;
const PNG_CHUNK_HEADER_BYTES = 8;
const PNG_CHUNK_TRAILER_BYTES = 4;
const PNG_IHDR_BYTES = 13;
const JPEG_SIGNATURE = Uint8Array.from([0xff, 0xd8]);
const JPEG_END_SIGNATURE = Uint8Array.from([0xff, 0xd9]);

type ImageValidationErrorCode =
  "VALIDATION_FAILED" | "PAYLOAD_TOO_LARGE" | "UNSUPPORTED_MEDIA_TYPE";

export class ImageValidationError extends Error {
  constructor(
    public readonly code: ImageValidationErrorCode,
    public readonly status: 400 | 413 | 415,
    message: string,
  ) {
    super(message);
    this.name = "ImageValidationError";
  }
}

export interface ParsedPng {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  /** PNG 颜色类型或 tRNS 表明文件可能包含 alpha。 */
  hasAlpha: boolean;
}

export interface ParsedJpeg {
  width: number;
  height: number;
}

/** 已通过最终文件校验的内部资源输入；路由之外不应从客户端字段构造它。 */
export interface ValidatedImageUpload {
  readonly bytes: Uint8Array;
  readonly purpose: AssetPurpose;
  readonly width: number;
  readonly height: number;
  readonly byteLength: number;
}

function unsupported(message: string): never {
  throw new ImageValidationError("UNSUPPORTED_MEDIA_TYPE", 415, message);
}

function tooLarge(message: string): never {
  throw new ImageValidationError("PAYLOAD_TOO_LARGE", 413, message);
}

function invalid(message: string): never {
  throw new ImageValidationError("VALIDATION_FAILED", 400, message);
}

function readUint32BigEndian(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset]! << 24) |
      (bytes[offset + 1]! << 16) |
      (bytes[offset + 2]! << 8) |
      bytes[offset + 3]!) >>>
    0
  );
}

function chunkName(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

function isPng(bytes: Uint8Array): boolean {
  if (bytes.byteLength < PNG_SIGNATURE_BYTES) return false;
  for (let index = 0; index < PNG_SIGNATURE_BYTES; index++) {
    if (bytes[index] !== PNG_SIGNATURE[index]) return false;
  }
  return true;
}

function isCriticalChunk(name: string): boolean {
  const first = name.charCodeAt(0);
  return first >= 0x41 && first <= 0x5a;
}

function isSupportedBitDepth(colorType: number, bitDepth: number): boolean {
  switch (colorType) {
    case 0:
      return [1, 2, 4, 8, 16].includes(bitDepth);
    case 2:
      return bitDepth === 8 || bitDepth === 16;
    case 3:
      return [1, 2, 4, 8].includes(bitDepth);
    case 4:
      return bitDepth === 8 || bitDepth === 16;
    case 6:
      return bitDepth === 8 || bitDepth === 16;
    default:
      return false;
  }
}

/**
 * Parse PNG signature, chunk boundaries, IHDR and the required image chunks.
 * Pixel bytes are intentionally not trusted until Photon has decoded them.
 */
export function parsePngStructure(bytes: Uint8Array): ParsedPng {
  if (!isPng(bytes)) {
    unsupported("文件不是有效的 PNG。");
  }

  let offset = PNG_SIGNATURE_BYTES;
  let sawIhdr = false;
  let sawIdat = false;
  let sawIend = false;
  let sawPlte = false;
  let sawTrns = false;
  let parsed: ParsedPng | undefined;

  while (offset < bytes.byteLength) {
    if (offset + PNG_CHUNK_HEADER_BYTES > bytes.byteLength) {
      unsupported("PNG chunk header 被截断。");
    }

    const chunkLength = readUint32BigEndian(bytes, offset);
    const name = chunkName(bytes, offset + 4);
    const dataOffset = offset + PNG_CHUNK_HEADER_BYTES;
    const dataEnd = dataOffset + chunkLength;
    const chunkEnd = dataEnd + PNG_CHUNK_TRAILER_BYTES;
    if (
      !Number.isSafeInteger(dataEnd) ||
      !Number.isSafeInteger(chunkEnd) ||
      dataEnd < dataOffset ||
      chunkEnd < dataEnd ||
      chunkEnd > bytes.byteLength
    ) {
      unsupported("PNG chunk 长度无效或超出文件范围。");
    }

    if (sawIend) {
      unsupported("PNG IEND 后存在多余数据。");
    }

    if (!sawIhdr && name !== "IHDR") {
      unsupported("PNG 必须以 IHDR chunk 开始。");
    }

    if (name === "IHDR") {
      if (sawIhdr || chunkLength !== PNG_IHDR_BYTES) {
        unsupported("PNG IHDR chunk 无效。");
      }

      const width = readUint32BigEndian(bytes, dataOffset);
      const height = readUint32BigEndian(bytes, dataOffset + 4);
      const bitDepth = bytes[dataOffset + 8]!;
      const colorType = bytes[dataOffset + 9]!;
      const compressionMethod = bytes[dataOffset + 10]!;
      const filterMethod = bytes[dataOffset + 11]!;
      const interlaceMethod = bytes[dataOffset + 12]!;

      if (width < 1 || height < 1) {
        invalid("PNG 图像尺寸无效。");
      }
      if (!isSupportedBitDepth(colorType, bitDepth)) {
        unsupported("PNG bit depth 或 color type 无效。");
      }
      if (compressionMethod !== 0 || filterMethod !== 0 || ![0, 1].includes(interlaceMethod)) {
        unsupported("PNG IHDR 压缩、过滤或交错方式无效。");
      }

      parsed = {
        width,
        height,
        bitDepth,
        colorType,
        hasAlpha: colorType === 4 || colorType === 6,
      };
      sawIhdr = true;
    } else if (name === "PLTE") {
      if (sawPlte || sawIdat || chunkLength === 0 || chunkLength % 3 !== 0 || chunkLength > 768) {
        unsupported("PNG PLTE chunk 无效。");
      }
      sawPlte = true;
    } else if (name === "tRNS") {
      if (sawTrns || sawIdat || parsed?.colorType === 4 || parsed?.colorType === 6) {
        unsupported("PNG tRNS chunk 无效。");
      }
      sawTrns = true;
    } else if (name === "IDAT") {
      if (!parsed || chunkLength === 0) {
        unsupported("PNG IDAT chunk 无效。");
      }
      sawIdat = true;
    } else if (name === "IEND") {
      if (chunkLength !== 0 || !parsed || !sawIdat) {
        unsupported("PNG IEND chunk 无效或图像数据缺失。");
      }
      sawIend = true;
    } else if (isCriticalChunk(name)) {
      unsupported("PNG 包含不支持的关键 chunk。");
    }

    offset = chunkEnd;
  }

  if (!parsed || !sawIdat || !sawIend || offset !== bytes.byteLength) {
    unsupported("PNG 缺少完整的 IHDR、IDAT 或 IEND chunk。");
  }
  if (parsed.colorType === 3 && !sawPlte) {
    unsupported("索引色 PNG 缺少 PLTE chunk。");
  }

  return { ...parsed, hasAlpha: parsed.hasAlpha || sawTrns };
}

function assertPolicyLimits(purpose: AssetPurpose, parsed: { width: number; height: number }) {
  const policy = getAssetPolicy(purpose);
  if (parsed.width > policy.maxDimension || parsed.height > policy.maxDimension) {
    invalid(`图片最长边不得超过 ${policy.maxDimension} 像素。`);
  }

  if (parsed.width > policy.maxPixels / parsed.height) {
    invalid(`图片总像素不得超过 ${policy.maxPixels}。`);
  }
}

function decodeAndVerify(
  bytes: Uint8Array,
  parsed: { width: number; height: number },
  purpose: AssetPurpose,
  format: "PNG" | "JPEG",
) {
  let image: PhotonImage | undefined;
  try {
    image = PhotonImage.new_from_byteslice(bytes);
    const width = image.get_width();
    const height = image.get_height();
    if (width !== parsed.width || height !== parsed.height) {
      unsupported(`${format} 声明尺寸与解码尺寸不一致。`);
    }

    const pixels = image.get_raw_pixels();
    const expectedPixelBytes = width * height * 4;
    if (pixels.byteLength !== expectedPixelBytes) {
      unsupported(`${format} 解码结果不完整。`);
    }

    if (purpose === "qr_code") {
      for (let offset = 3; offset < pixels.byteLength; offset += 4) {
        if (pixels[offset] !== 0xff) {
          invalid("二维码 JPEG 必须是不透明的。");
        }
      }
    }
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    unsupported(`${format} 完整解码失败。`);
  } finally {
    image?.free();
  }
}

/**
 * Validate an actual final PNG file. The order is intentional:
 * request/file bytes -> PNG structure/dimensions -> purpose limits -> full decode.
 */
export function validatePngUpload(bytes: Uint8Array, purpose: AssetPurpose): ValidatedImageUpload {
  if (purpose !== "logo") unsupported("头像资源必须是 PNG。");
  if (bytes.byteLength === 0) {
    invalid("文件不能为空。");
  }

  const policy = getAssetPolicy(purpose);
  if (bytes.byteLength > policy.maxBytes) {
    tooLarge(`文件大小超过 ${policy.maxBytes} 字节限制。`);
  }

  const parsed = parsePngStructure(bytes);
  assertPolicyLimits(purpose, parsed);
  decodeAndVerify(bytes, parsed, purpose, "PNG");

  return {
    bytes,
    purpose,
    width: parsed.width,
    height: parsed.height,
    byteLength: bytes.byteLength,
  };
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    JPEG_SIGNATURE.every((byte, index) => bytes[index] === byte) &&
    JPEG_END_SIGNATURE.every(
      (byte, index) => bytes[bytes.length - JPEG_END_SIGNATURE.length + index] === byte,
    )
  );
}

function readJpegDimensions(bytes: Uint8Array): ParsedJpeg {
  if (!isJpeg(bytes)) unsupported("文件不是有效的 JPEG。");
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset++;
      continue;
    }
    while (offset < bytes.length && bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === undefined || marker === 0xd8 || marker === 0xd9) continue;
    if (marker === 0xda) break;
    if (offset + 2 > bytes.length) unsupported("JPEG marker 被截断。");
    const segmentLength = (bytes[offset]! << 8) | bytes[offset + 1]!;
    if (segmentLength < 2 || offset + segmentLength > bytes.length) {
      unsupported("JPEG marker 长度无效。");
    }
    const isStartOfFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isStartOfFrame) {
      if (segmentLength < 7) unsupported("JPEG 尺寸段无效。");
      const height = (bytes[offset + 3]! << 8) | bytes[offset + 4]!;
      const width = (bytes[offset + 5]! << 8) | bytes[offset + 6]!;
      if (width < 1 || height < 1) invalid("JPEG 图像尺寸无效。");
      return { width, height };
    }
    offset += segmentLength;
  }
  unsupported("JPEG 缺少图像尺寸段。");
}

/** 按用途校验最终资源：logo 仅 PNG，qr_code 仅 JPEG。 */
export function validateImageUpload(
  bytes: Uint8Array,
  purpose: AssetPurpose,
): ValidatedImageUpload {
  if (purpose === "logo") return validatePngUpload(bytes, purpose);
  if (bytes.byteLength === 0) invalid("文件不能为空。");
  const policy = getAssetPolicy(purpose);
  if (bytes.byteLength > policy.maxBytes) {
    tooLarge(`文件大小超过 ${policy.maxBytes} 字节限制。`);
  }
  const parsed = readJpegDimensions(bytes);
  assertPolicyLimits(purpose, parsed);
  // Photon 的 workerd 构建只提供 PNG 输入解码；JPEG 的 SOI/marker/SOF/SOS/EOI
  // 结构、尺寸和完整字节边界已在 readJpegDimensions 中校验。JPEG 输出本身不携带
  // alpha 通道，因此 qr_code 的不透明约束由格式契约保证。
  return {
    bytes,
    purpose,
    width: parsed.width,
    height: parsed.height,
    byteLength: bytes.byteLength,
  };
}

export function isUploadRequestTooLarge(contentLength: string | null): boolean {
  if (!contentLength) return false;
  const normalized = contentLength.trim();
  if (!/^\d+$/.test(normalized)) return true;
  const parsed = Number(normalized);
  return !Number.isSafeInteger(parsed) || parsed > ASSET_UPLOAD_REQUEST_MAX_BYTES;
}

export function isUploadBodyTooLarge(byteLength: number): boolean {
  return byteLength > ASSET_UPLOAD_REQUEST_MAX_BYTES;
}
