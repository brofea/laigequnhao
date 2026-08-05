import { ASSET_POLICIES, ASSET_SOURCE_MAX_BYTES } from "@shared/contracts/asset";
import { ASSET_CONTENT_TYPES } from "@shared/contracts/asset";

export type ImageCompressionPurpose = "logo" | "qr_code";

export type ImageCompressionPolicy = Readonly<{
  maxSourceBytes: number;
  maxBytes: number;
  maxDimension: number;
  preserveAlpha: boolean;
}>;

/**
 * 浏览器图片处理的唯一策略表。
 * 最终限制来自共享资源契约；preserveAlpha 决定 canvas 是否铺白底。
 */
export const imageCompressionPolicies: Readonly<
  Record<ImageCompressionPurpose, ImageCompressionPolicy>
> = Object.freeze({
  logo: Object.freeze({
    maxSourceBytes: ASSET_SOURCE_MAX_BYTES,
    maxBytes: ASSET_POLICIES.logo.maxBytes,
    maxDimension: ASSET_POLICIES.logo.maxDimension,
    preserveAlpha: ASSET_POLICIES.logo.preserveAlpha,
  }),
  qr_code: Object.freeze({
    maxSourceBytes: ASSET_SOURCE_MAX_BYTES,
    maxBytes: ASSET_POLICIES.qr_code.maxBytes,
    maxDimension: ASSET_POLICIES.qr_code.maxDimension,
    preserveAlpha: ASSET_POLICIES.qr_code.preserveAlpha,
  }),
});

const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg"]);
const SUPPORTED_EXTENSIONS = new Set(["png", "jpg", "jpeg"]);
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);
const PNG_MIME_TYPE = ASSET_CONTENT_TYPES.logo;
const JPEG_MIME_TYPE = ASSET_CONTENT_TYPES.qr_code;
const PNG_SIGNATURE = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_SIGNATURE = Uint8Array.from([0xff, 0xd8]);

export type ImageCompressionErrorCode =
  | "SOURCE_TOO_LARGE"
  | "UNSUPPORTED_FORMAT"
  | "DECODE_UNSUPPORTED"
  | "CANVAS_UNSUPPORTED"
  | "ENCODE_UNSUPPORTED"
  | "OUTPUT_TOO_LARGE";

export class ImageCompressionError extends Error {
  readonly code: ImageCompressionErrorCode;

  constructor(code: ImageCompressionErrorCode, message: string) {
    super(message);
    this.name = "ImageCompressionError";
    this.code = code;
  }
}

export type CompressedImage = Readonly<{
  blob: Blob;
  width: number;
  height: number;
  byteLength: number;
  previewUrl: string;
  purpose: ImageCompressionPurpose;
}>;

export function getImageCompressionPolicy(
  purpose: ImageCompressionPurpose,
): ImageCompressionPolicy {
  return imageCompressionPolicies[purpose];
}

export function calculateTargetDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new ImageCompressionError("DECODE_UNSUPPORTED", "图片尺寸无效，无法处理。");
  }
  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    throw new ImageCompressionError("DECODE_UNSUPPORTED", "图片压缩策略无效。");
  }
  const scale = Math.min(1, maxDimension / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function fileExtension(file: Blob): string | null {
  if (!("name" in file) || typeof file.name !== "string") return null;
  const name = file.name.trim().toLocaleLowerCase();
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1) : null;
}

export function validateImageSource(file: Blob, policy: ImageCompressionPolicy): void {
  if (!(file instanceof Blob)) {
    throw new ImageCompressionError("UNSUPPORTED_FORMAT", "请选择图片文件。");
  }
  if (file.size > policy.maxSourceBytes) {
    throw new ImageCompressionError("SOURCE_TOO_LARGE", "原图不能超过 5MB，请选择较小的图片。");
  }
  const mimeType = file.type.trim().toLocaleLowerCase();
  const extension = fileExtension(file);
  if (
    HEIC_MIME_TYPES.has(mimeType) ||
    mimeType.includes("heic") ||
    mimeType.includes("heif") ||
    (extension !== null && HEIC_EXTENSIONS.has(extension))
  ) {
    throw new ImageCompressionError(
      "UNSUPPORTED_FORMAT",
      "不支持 HEIC，请转换为 PNG/JPEG 后重试。",
    );
  }
  if (
    !SUPPORTED_MIME_TYPES.has(mimeType) &&
    !(mimeType === "" && extension !== null && SUPPORTED_EXTENSIONS.has(extension))
  ) {
    throw new ImageCompressionError("UNSUPPORTED_FORMAT", "仅支持 PNG、JPG 或 JPEG 图片。");
  }
}

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

function canCreateImageBitmap(): typeof createImageBitmap | undefined {
  return typeof globalThis.createImageBitmap === "function"
    ? globalThis.createImageBitmap
    : undefined;
}

async function decodeWithImageBitmap(file: Blob): Promise<DecodedImage> {
  const createBitmap = canCreateImageBitmap();
  if (!createBitmap) throw new Error("createImageBitmap is unavailable");
  const bitmap = await createBitmap(file);
  const close = typeof bitmap.close === "function" ? bitmap.close.bind(bitmap) : undefined;
  return {
    source: bitmap,
    width: bitmap.width,
    height: bitmap.height,
    close: () => {
      if (!close) return;
      try {
        close();
      } catch {
        // 某些 WebKit 版本的 close 可能在解码器已释放后再次调用时抛错。
      }
    },
  };
}

async function decodeWithImageElement(file: Blob): Promise<DecodedImage> {
  if (typeof Image !== "function" || typeof URL.createObjectURL !== "function") {
    throw new Error("HTMLImageElement or object URLs are unavailable");
  }
  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => {
        resolve(element);
      };
      element.onerror = () => {
        reject(new Error("image decode failed"));
      };
      element.src = sourceUrl;
    });
    return {
      source: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      close: () => {
        // HTMLImageElement 没有 close 方法；输入对象 URL 已在上方 finally 清理。
      },
    };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

async function decodeImage(file: Blob): Promise<DecodedImage> {
  const bitmapDecoder = canCreateImageBitmap();
  if (bitmapDecoder) {
    try {
      return await decodeWithImageBitmap(file);
    } catch {
      // 某些 Safari 版本暴露 createImageBitmap 但不能解码输入图片；继续使用兼容回退。
    }
  }
  try {
    return await decodeWithImageElement(file);
  } catch {
    throw new ImageCompressionError("DECODE_UNSUPPORTED", "浏览器无法解码这张图片。");
  }
}

function createCanvas(
  width: number,
  height: number,
  preserveAlpha: boolean,
): {
  canvas: HTMLCanvasElement;
  context: CanvasRenderingContext2D;
} {
  if (typeof document === "undefined") {
    throw new ImageCompressionError("CANVAS_UNSUPPORTED", "当前浏览器不支持图片画布。");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: preserveAlpha });
  if (!context) {
    throw new ImageCompressionError("CANVAS_UNSUPPORTED", "当前浏览器不支持图片画布。");
  }
  return { canvas, context };
}

function encodeUnsupported(contentType: string = PNG_MIME_TYPE): ImageCompressionError {
  const format = contentType === JPEG_MIME_TYPE ? "JPEG" : "PNG";
  return new ImageCompressionError("ENCODE_UNSUPPORTED", `当前浏览器不支持 ${format} 编码。`);
}

function hasPngSignature(bytes: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => bytes[index] === byte);
}

function hasJpegSignature(bytes: Uint8Array): boolean {
  return (
    JPEG_SIGNATURE.every((byte, index) => bytes[index] === byte) &&
    bytes.length >= 4 &&
    bytes[bytes.length - 2] === 0xff &&
    bytes[bytes.length - 1] === 0xd9
  );
}

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  if (typeof blob.arrayBuffer === "function") {
    return blob.arrayBuffer().then((buffer) => new Uint8Array(buffer));
  }
  if (typeof FileReader !== "function") return Promise.reject(new Error("Blob reader unavailable"));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Blob reader returned an invalid result"));
        return;
      }
      resolve(new Uint8Array(reader.result));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Blob read failed"));
    };
    reader.readAsArrayBuffer(blob);
  });
}

async function isActualImageBlob(blob: Blob | null, contentType: string): Promise<boolean> {
  if (!blob || blob.type.trim().toLocaleLowerCase() !== contentType) return false;
  try {
    const bytes = await readBlobBytes(blob);
    return contentType === PNG_MIME_TYPE ? hasPngSignature(bytes) : hasJpegSignature(bytes);
  } catch {
    return false;
  }
}

async function encodeCanvas(
  canvas: HTMLCanvasElement,
  contentType: string,
  quality?: number,
): Promise<Blob> {
  if (typeof canvas.toBlob !== "function") throw encodeUnsupported(contentType);
  let blob: Blob | null;
  try {
    blob = await new Promise<Blob | null>((resolve) => {
      if (quality === undefined) canvas.toBlob(resolve, contentType);
      else canvas.toBlob(resolve, contentType, quality);
    });
  } catch {
    throw encodeUnsupported(contentType);
  }
  if (!blob || !(await isActualImageBlob(blob, contentType))) {
    throw encodeUnsupported(contentType);
  }
  return blob;
}

export function revokeImagePreview(previewUrl: string | null | undefined): void {
  if (!previewUrl || typeof URL.revokeObjectURL !== "function") return;
  URL.revokeObjectURL(previewUrl);
}

type BarcodeDetection = { rawValue?: unknown };
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<BarcodeDetection[]>;
};
type BarcodeDetectorConstructor = new (options: { formats: ["qr_code"] }) => BarcodeDetectorLike;

/**
 * 使用浏览器原生 BarcodeDetector 做可选的二维码验收。
 * 老浏览器没有该能力时返回 null，不影响图片上传；管理端仍由服务端校验资源。
 */
export async function detectQrCode(blob: Blob): Promise<string | null> {
  const detectorConstructor = (
    globalThis as typeof globalThis & { BarcodeDetector?: BarcodeDetectorConstructor }
  ).BarcodeDetector;
  if (!detectorConstructor || typeof Image !== "function") return null;
  if (typeof URL.createObjectURL !== "function") return null;
  const sourceUrl = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => {
        resolve(element);
      };
      element.onerror = () => {
        reject(new Error("image decode failed"));
      };
      element.src = sourceUrl;
    });
    const detections = await new detectorConstructor({ formats: ["qr_code"] }).detect(image);
    const first = detections[0]?.rawValue;
    return typeof first === "string" && first.length > 0 ? first : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}

/**
 * 在浏览器端把用户原图转换为按用途编码的最终 Logo PNG 或二维码 JPEG。
 * 返回的 previewUrl 属于调用方，替换、取消、关闭和卸载时必须调用 revokeImagePreview。
 */
export async function compressImage(
  file: Blob,
  purpose: ImageCompressionPurpose,
): Promise<CompressedImage> {
  const policy = getImageCompressionPolicy(purpose);
  validateImageSource(file, policy);
  const decoded = await decodeImage(file);
  try {
    const dimensions = calculateTargetDimensions(
      decoded.width,
      decoded.height,
      policy.maxDimension,
    );
    const { canvas, context } = createCanvas(
      dimensions.width,
      dimensions.height,
      policy.preserveAlpha,
    );
    context.clearRect(0, 0, dimensions.width, dimensions.height);
    if (!policy.preserveAlpha) {
      context.fillStyle = "#fff";
      context.fillRect(0, 0, dimensions.width, dimensions.height);
    }
    context.drawImage(decoded.source, 0, 0, dimensions.width, dimensions.height);

    let output: Blob;
    if (purpose === "logo") {
      // 头像始终只编码一次透明 PNG。
      output = await encodeCanvas(canvas, PNG_MIME_TYPE);
      if (output.size > policy.maxBytes) {
        throw new ImageCompressionError(
          "OUTPUT_TOO_LARGE",
          "头像压缩后仍超过大小限制，请选择更简单的图片。",
        );
      }
    } else {
      // 二维码固定尝试三次 JPEG 质量：0.90 → 0.80 → 0.70。
      let lastSize = 0;
      output = await (async () => {
        for (const quality of [0.9, 0.8, 0.7]) {
          const candidate = await encodeCanvas(canvas, JPEG_MIME_TYPE, quality);
          lastSize = candidate.size;
          if (candidate.size <= policy.maxBytes) return candidate;
        }
        throw new ImageCompressionError(
          "OUTPUT_TOO_LARGE",
          `二维码压缩后仍超过大小限制（${String(lastSize)} 字节），请考虑裁剪图像。`,
        );
      })();
    }
    if (typeof URL.createObjectURL !== "function") {
      throw new ImageCompressionError("ENCODE_UNSUPPORTED", "当前浏览器不支持图片预览。");
    }
    const previewUrl = URL.createObjectURL(output);
    return {
      blob: output,
      width: dimensions.width,
      height: dimensions.height,
      byteLength: output.size,
      previewUrl,
      purpose,
    };
  } finally {
    decoded.close();
  }
}
