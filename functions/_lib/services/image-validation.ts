import { PhotonImage } from "@cf-wasm/photon/workerd";
import {
  ASSET_UPLOAD_REQUEST_MAX_BYTES,
  getAssetPolicy,
  type AssetPurpose,
} from "@shared/contracts/asset";

const RIFF_HEADER_BYTES = 12;
const CHUNK_HEADER_BYTES = 8;
const VP8X_DIMENSION_BYTES = 10;
const VP8L_HEADER_BYTES = 5;
const VP8_FRAME_HEADER_BYTES = 10;

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

export interface ParsedWebp {
  width: number;
  height: number;
  hasAlpha: boolean;
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

function readUint32LittleEndian(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset]! |
      (bytes[offset + 1]! << 8) |
      (bytes[offset + 2]! << 16) |
      (bytes[offset + 3]! << 24)) >>>
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

function isRiffWebp(bytes: Uint8Array): boolean {
  return (
    bytes.length >= RIFF_HEADER_BYTES &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  );
}

/**
 * Parse the RIFF chunk table and the dimensions encoded by the image chunk.
 * This deliberately does not decode pixels; callers apply policy limits first.
 */
export function parseWebpStructure(bytes: Uint8Array): ParsedWebp {
  if (!isRiffWebp(bytes)) {
    unsupported("文件不是有效的 RIFF WebP。");
  }

  if (bytes.length < RIFF_HEADER_BYTES + CHUNK_HEADER_BYTES) {
    unsupported("WebP 文件缺少图像 chunk。");
  }

  const riffPayloadLength = readUint32LittleEndian(bytes, 4);
  if (riffPayloadLength !== bytes.length - 8) {
    unsupported("WebP RIFF 长度与实际文件长度不一致。");
  }

  const riffEnd = bytes.length;
  let offset = RIFF_HEADER_BYTES;
  let imageChunk: "VP8 " | "VP8L" | null = null;
  let canvasDimensions: { width: number; height: number } | null = null;
  let imageDimensions: { width: number; height: number } | null = null;
  let hasAlpha = false;

  while (offset < riffEnd) {
    if (offset + CHUNK_HEADER_BYTES > riffEnd) {
      unsupported("WebP chunk header 被截断。");
    }

    const name = chunkName(bytes, offset);
    const chunkLength = readUint32LittleEndian(bytes, offset + 4);
    const dataOffset = offset + CHUNK_HEADER_BYTES;
    const dataEnd = dataOffset + chunkLength;
    if (dataEnd < dataOffset || dataEnd > riffEnd) {
      unsupported("WebP chunk 长度无效或超出文件范围。");
    }

    if (name === "VP8X") {
      if (chunkLength < VP8X_DIMENSION_BYTES || canvasDimensions || imageDimensions) {
        unsupported("WebP VP8X chunk 无效。");
      }

      const width =
        1 +
        (bytes[dataOffset + 4]! | (bytes[dataOffset + 5]! << 8) | (bytes[dataOffset + 6]! << 16));
      const height =
        1 +
        (bytes[dataOffset + 7]! | (bytes[dataOffset + 8]! << 8) | (bytes[dataOffset + 9]! << 16));
      canvasDimensions = { width, height };
      hasAlpha = (bytes[dataOffset]! & 0x10) !== 0;
    } else if (name === "VP8L") {
      if (chunkLength < VP8L_HEADER_BYTES || imageChunk) {
        unsupported("WebP VP8L chunk 无效。");
      }
      if (bytes[dataOffset] !== 0x2f) {
        unsupported("WebP VP8L 签名无效。");
      }

      const bits = readUint32LittleEndian(bytes, dataOffset + 1);
      imageDimensions = {
        width: (bits & 0x3fff) + 1,
        height: ((bits >>> 14) & 0x3fff) + 1,
      };
      hasAlpha ||= (bits & 0x10000000) !== 0;
      imageChunk = "VP8L";
    } else if (name === "VP8 ") {
      if (chunkLength < VP8_FRAME_HEADER_BYTES || imageChunk) {
        unsupported("WebP VP8 chunk 无效。");
      }

      // A valid lossy WebP key frame contains the VP8 start code 0x9d012a.
      if (
        bytes[dataOffset + 3] !== 0x9d ||
        bytes[dataOffset + 4] !== 0x01 ||
        bytes[dataOffset + 5] !== 0x2a
      ) {
        unsupported("WebP VP8 帧签名无效。");
      }

      const width = (bytes[dataOffset + 6]! | (bytes[dataOffset + 7]! << 8)) & 0x3fff;
      const height = (bytes[dataOffset + 8]! | (bytes[dataOffset + 9]! << 8)) & 0x3fff;
      imageDimensions = { width, height };
      imageChunk = "VP8 ";
    }

    const paddedEnd = dataEnd + (chunkLength & 1);
    if (paddedEnd > riffEnd) {
      unsupported("WebP chunk padding 被截断。");
    }
    offset = paddedEnd;
  }

  if (offset !== riffEnd || !imageChunk || !imageDimensions) {
    unsupported("WebP 缺少可识别的图像 chunk。");
  }
  const dimensions = canvasDimensions ?? imageDimensions;
  if (
    canvasDimensions &&
    (canvasDimensions.width !== imageDimensions.width ||
      canvasDimensions.height !== imageDimensions.height)
  ) {
    unsupported("WebP VP8X 画布尺寸与图像尺寸不一致。");
  }
  if (
    !Number.isSafeInteger(dimensions.width) ||
    !Number.isSafeInteger(dimensions.height) ||
    dimensions.width < 1 ||
    dimensions.height < 1
  ) {
    invalid("WebP 图像尺寸无效。");
  }

  return { ...dimensions, hasAlpha };
}

function assertPolicyLimits(purpose: AssetPurpose, parsed: ParsedWebp) {
  const policy = getAssetPolicy(purpose);
  if (parsed.width > policy.maxDimension || parsed.height > policy.maxDimension) {
    invalid(`图片最长边不得超过 ${policy.maxDimension} 像素。`);
  }

  const pixelCount = parsed.width * parsed.height;
  if (!Number.isSafeInteger(pixelCount) || pixelCount > policy.maxPixels) {
    invalid(`图片总像素不得超过 ${policy.maxPixels}。`);
  }
}

function decodeAndVerify(bytes: Uint8Array, parsed: ParsedWebp) {
  let image: PhotonImage | undefined;
  try {
    image = PhotonImage.new_from_byteslice(bytes);
    const width = image.get_width();
    const height = image.get_height();
    if (width !== parsed.width || height !== parsed.height) {
      unsupported("WebP 声明尺寸与解码尺寸不一致。");
    }

    const pixels = image.get_raw_pixels();
    const expectedPixelBytes = width * height * 4;
    if (pixels.byteLength !== expectedPixelBytes) {
      unsupported("WebP 解码结果不完整。");
    }

    // QR flattening is performed by the browser adapter. The server still
    // decodes the bytes before storing them, but accepts legacy WebP assets
    // whose encoder metadata reports alpha inconsistently.
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    unsupported("WebP 完整解码失败。");
  } finally {
    image?.free();
  }
}

/**
 * Validate an actual final WebP file. The order is intentional:
 * request/file bytes -> RIFF/chunk/dimensions -> purpose limits -> full decode.
 */
export function validateWebpUpload(bytes: Uint8Array, purpose: AssetPurpose): ValidatedImageUpload {
  if (bytes.byteLength === 0) {
    invalid("文件不能为空。");
  }

  const policy = getAssetPolicy(purpose);
  if (bytes.byteLength > policy.maxBytes) {
    tooLarge(`文件大小超过 ${policy.maxBytes} 字节限制。`);
  }

  const parsed = parseWebpStructure(bytes);
  assertPolicyLimits(purpose, parsed);
  decodeAndVerify(bytes, parsed);

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
