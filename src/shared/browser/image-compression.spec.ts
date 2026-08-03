import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import jsQR from "jsqr";
import sharp from "sharp";
import {
  calculateTargetDimensions,
  detectQrCode,
  compressImage,
  getImageCompressionPolicy,
  getQualitySteps,
  revokeImagePreview,
  validateImageSource,
} from "./image-compression";

const REAL_QR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACAAQMAAAD58POIAAAABlBMVEX///8AAABVwtN+AAAACXBI" +
  "WXMAAA7EAAAOxAGVKw4bAAABEUlEQVRIia2Vsa3DMAxEL3ChMiNok3gxITbgxaxNNIJKF4H4j3TwE6T1sbCF5+KM45ECfmsxs46cBkrmcUhAAW69ZMz2ytR4akC22oFUXcq6ECyWzFYxmBoePOmA+7E0q1T5GHQRROcoUPt3Ky+CqMkOtu8raBcBVapZOx6Y+LivIuAvDy4BRCBceEVwwU9DAmiFu5Aq6eGdU4CSj7lPHtzNSIcEMF773RqFCk6TBaD4X2/NfMRsuEESQBVacSOyPcZDAnzDcCQ8bR0SEOUjxjikAQ045xaxtc/OCUBsGO7W3e0+TRaAWLCN02Bvg3SA8do8vUMJqLIC8//dcBG8b8JY3QMaEJ1zFQ7vZ42rwW/9AcnxGospmPkqAAAAAElFTkSuQmCC";

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function createMockCanvas(sizeForQuality: (quality: number) => number) {
  const context = {
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "",
  } as unknown as CanvasRenderingContext2D;
  const canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
    toBlob: vi.fn((callback: BlobCallback, _type?: string, quality?: number) => {
      const size = sizeForQuality(quality ?? 0);
      callback(new Blob([new Uint8Array(size)], { type: "image/webp" }));
    }),
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
}

describe("image compression browser adapter", () => {
  let createObjectUrl: ReturnType<typeof vi.fn>;
  let revokeObjectUrl: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    createObjectUrl = vi.fn((_: Blob) => `blob:test-${String(createObjectUrl.mock.calls.length)}`);
    revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(["image/png", "image/jpeg", "image/webp"])("接受 %s 原图", (contentType) => {
    const file = new File([new Uint8Array([1, 2, 3])], "source", { type: contentType });
    expect(() => {
      validateImageSource(file, getImageCompressionPolicy("logo"));
    }).not.toThrow();
  });

  it("允许 5MB 原图边界，但拒绝超过限制的图片", () => {
    const policy = getImageCompressionPolicy("logo");
    const exact = new Blob([new Uint8Array(policy.maxSourceBytes)], { type: "image/png" });
    expect(() => {
      validateImageSource(exact, policy);
    }).not.toThrow();

    const tooLarge = new Blob([new Uint8Array(policy.maxSourceBytes + 1)], {
      type: "image/png",
    });
    expect(() => {
      validateImageSource(tooLarge, policy);
    }).toThrow("原图不能超过 5MB");
  });

  it("按最长边等比缩放，并补齐质量递减的最低质量", () => {
    expect(calculateTargetDimensions(4000, 2000, 128)).toEqual({ width: 128, height: 64 });
    expect(calculateTargetDimensions(80, 40, 128)).toEqual({ width: 80, height: 40 });
    expect(getQualitySteps(getImageCompressionPolicy("logo"))).toEqual([85, 65, 45]);
    expect(getQualitySteps(getImageCompressionPolicy("qr_code"))).toEqual([95, 85, 75, 65, 55]);
  });

  it("logo 使用透明 canvas，结果为有限大小的 WebP 并生成可清理预览", async () => {
    const bitmap = { width: 400, height: 200, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap)),
    );
    const { canvas, context } = createMockCanvas(() => 100);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const result = await compressImage(
      new File(["png"], "logo.png", { type: "image/png" }),
      "logo",
    );

    expect(result).toMatchObject({
      width: 128,
      height: 64,
      byteLength: 100,
      purpose: "logo",
      previewUrl: "blob:test-1",
    });
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(64);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(context.fillRect).not.toHaveBeenCalled();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 128, 64);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(bitmap.close).toHaveBeenCalledOnce();

    revokeImagePreview(result.previewUrl);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-1");
  });

  it("二维码先铺纯白底，并在质量递减后通过目标大小", async () => {
    const bitmap = { width: 2000, height: 1000, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap)),
    );
    const qualities: number[] = [];
    const { canvas, context } = createMockCanvas((quality) => {
      qualities.push(quality);
      return quality > 0.9 ? 500 * 1024 : 100;
    });
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const result = await compressImage(
      new File([decodeBase64(REAL_QR_PNG_BASE64)], "group-qr.png", { type: "image/png" }),
      "qr_code",
    );

    expect(result.width).toBe(1024);
    expect(result.height).toBe(512);
    expect(qualities).toEqual([0.95, 0.85]);
    expect(context.fillStyle).toBe("#fff");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1024, 512);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 512);
  });

  it("压缩后的真实 WebP 仍可被扫码器识别", async () => {
    const sourcePng = Buffer.from(decodeBase64(REAL_QR_PNG_BASE64));
    const bitmap = { width: 128, height: 128, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap)),
    );

    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    let encodedWebp: Buffer | undefined;
    const canvas = {
      width: 128,
      height: 128,
      getContext: vi.fn(() => context),
      toBlob: vi.fn(async (callback: BlobCallback, _type?: string, quality?: number) => {
        const encoded = await sharp(sourcePng)
          .flatten({ background: "#fff" })
          .webp({ quality: Math.round((quality ?? 1) * 100) })
          .toBuffer();
        encodedWebp = encoded;
        callback(new Blob([encoded], { type: "image/webp" }));
      }),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const result = await compressImage(
      new File([sourcePng], "group-qr.png", { type: "image/png" }),
      "qr_code",
    );
    expect(result.byteLength).toBeLessThanOrEqual(getImageCompressionPolicy("qr_code").maxBytes);
    const webp = encodedWebp;
    expect(webp).toBeDefined();
    if (!webp) throw new Error("测试未产生 WebP 编码结果。");
    const { data, info } = await sharp(webp)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height);

    expect(decoded?.data).toBe("https://example.com/group");
    expect(info.channels).toBe(4);
    for (let offset = 3; offset < data.length; offset += 4) {
      expect(data[offset]).toBe(255);
    }
  });

  it("压缩后的最低质量仍超限时给出可见错误且不生成预览", async () => {
    const bitmap = { width: 200, height: 200, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap)),
    );
    const { canvas } = createMockCanvas(() => 500 * 1024);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const promise = compressImage(new File(["x"], "logo.jpg", { type: "image/jpeg" }), "logo");
    await expect(promise).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
    expect(createObjectUrl).not.toHaveBeenCalled();
  });

  it("把真实二维码样本交给 BarcodeDetector，并在无原生扫码器时安全降级", async () => {
    const sample = new Blob([decodeBase64(REAL_QR_PNG_BASE64)], { type: "image/png" });
    const originalImage = globalThis.Image;
    class TestImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", TestImage);
    const detector = vi.fn().mockResolvedValue([{ rawValue: "https://example.com/group" }]);
    vi.stubGlobal(
      "BarcodeDetector",
      class {
        detect = detector;
      },
    );

    await expect(detectQrCode(sample)).resolves.toBe("https://example.com/group");
    expect(detector).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-1");

    vi.stubGlobal("Image", originalImage);
    vi.stubGlobal("BarcodeDetector", undefined);
    await expect(detectQrCode(sample)).resolves.toBeNull();
  });
});
