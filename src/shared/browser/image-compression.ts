import {
  LOGO_CODE_MAX_BYTES,
  LOGO_MAX_BYTES,
  LOGO_MAX_DIMENSION,
  LOGO_MIN_QUALITY,
  LOGO_QUALITY_STEP,
  LOGO_START_QUALITY,
  QR_CODE_MAX_BYTES,
  QR_CODE_MAX_DIMENSION,
  QR_CODE_TARGET_BYTES,
  QR_MIN_QUALITY,
  QR_QUALITY_STEP,
  QR_START_QUALITY,
} from "@shared/contracts/asset";

export type ImageCompressionPurpose = "logo" | "qr_code";

export type ImageCompressionPolicy = Readonly<{
  maxSourceBytes: number;
  maxBytes: number;
  maxDimension: number;
  startQuality: number;
  minQuality: number;
  qualityStep: number;
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
    maxSourceBytes: LOGO_CODE_MAX_BYTES,
    maxBytes: LOGO_MAX_BYTES,
    maxDimension: LOGO_MAX_DIMENSION,
    startQuality: LOGO_START_QUALITY,
    minQuality: LOGO_MIN_QUALITY,
    qualityStep: LOGO_QUALITY_STEP,
    preserveAlpha: true,
  }),
  qr_code: Object.freeze({
    maxSourceBytes: QR_CODE_MAX_BYTES,
    maxBytes: QR_CODE_TARGET_BYTES,
    maxDimension: QR_CODE_MAX_DIMENSION,
    startQuality: QR_START_QUALITY,
    minQuality: QR_MIN_QUALITY,
    qualityStep: QR_QUALITY_STEP,
    preserveAlpha: false,
  }),
});

const SUPPORTED_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const SUPPORTED_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);
const HEIC_MIME_TYPES = new Set(["image/heic", "image/heif"]);
const HEIC_EXTENSIONS = new Set(["heic", "heif"]);
const WEBP_MIME_TYPE = "image/webp";

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

export function getQualitySteps(policy: ImageCompressionPolicy): number[] {
  const values: number[] = [];
  for (
    let quality = policy.startQuality;
    quality >= policy.minQuality;
    quality -= policy.qualityStep
  ) {
    values.push(quality);
  }
  if (values[values.length - 1] !== policy.minQuality) values.push(policy.minQuality);
  return values;
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
      "不支持 HEIC，请转换为 PNG/JPEG/WebP 后重试。",
    );
  }
  if (
    !SUPPORTED_MIME_TYPES.has(mimeType) &&
    !(mimeType === "" && extension !== null && SUPPORTED_EXTENSIONS.has(extension))
  ) {
    throw new ImageCompressionError("UNSUPPORTED_FORMAT", "仅支持 PNG、JPG、JPEG 或 WebP 图片。");
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
      // 某些 Safari 版本暴露 createImageBitmap 但不能解码 WebP；继续使用兼容回退。
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

function encodeUnsupported(): ImageCompressionError {
  return new ImageCompressionError("ENCODE_UNSUPPORTED", "当前浏览器不支持 WebP 编码。");
}

function hasWebpSignature(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 12 &&
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

async function isActualWebpBlob(blob: Blob | null): Promise<boolean> {
  if (!blob || blob.type.trim().toLocaleLowerCase() !== WEBP_MIME_TYPE) return false;
  try {
    return hasWebpSignature(await readBlobBytes(blob));
  } catch {
    return false;
  }
}

function dataUrlToWebpBlob(dataUrl: string): Blob | null {
  const comma = dataUrl.indexOf(",");
  if (comma < 0 || dataUrl.slice(0, 5).toLocaleLowerCase() !== "data:") return null;

  const metadata = dataUrl.slice(5, comma).split(";");
  const mediaType = metadata[0]?.trim().toLocaleLowerCase();
  if (mediaType !== WEBP_MIME_TYPE) return null;

  const payload = dataUrl.slice(comma + 1);
  try {
    let bytes: Uint8Array;
    if (metadata.slice(1).some((value) => value.trim().toLocaleLowerCase() === "base64")) {
      const binary = atob(payload);
      bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } else {
      const decoded = decodeURIComponent(payload);
      bytes = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    }
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return new Blob([buffer], { type: WEBP_MIME_TYPE });
  } catch {
    return null;
  }
}

async function encodeCanvasWithDataUrl(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  if (typeof canvas.toDataURL !== "function") throw encodeUnsupported();
  try {
    const dataUrl = canvas.toDataURL(WEBP_MIME_TYPE, quality / 100);
    const blob = dataUrlToWebpBlob(dataUrl);
    if (!blob || !(await isActualWebpBlob(blob))) throw encodeUnsupported();
    return blob;
  } catch (error) {
    if (error instanceof ImageCompressionError) throw error;
    throw encodeUnsupported();
  }
}

async function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  let blob: Blob | null = null;
  if (typeof canvas.toBlob === "function") {
    try {
      blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob(resolve, WEBP_MIME_TYPE, quality / 100);
      });
    } catch {
      blob = null;
    }
  }

  if (blob && (await isActualWebpBlob(blob))) return blob;
  return encodeCanvasWithDataUrl(canvas, quality);
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
 * 在浏览器端把用户原图转换为最终 WebP。
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

    let output: Blob | null = null;
    for (const quality of getQualitySteps(policy)) {
      const candidate = await encodeCanvas(canvas, quality);
      if (candidate.size <= policy.maxBytes) {
        output = candidate;
        break;
      }
    }
    if (!output) {
      throw new ImageCompressionError(
        "OUTPUT_TOO_LARGE",
        `${purpose === "logo" ? "头像" : "二维码"}压缩后仍超过大小限制，请选择更简单的图片。`,
      );
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
