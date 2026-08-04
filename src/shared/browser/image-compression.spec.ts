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

const WEBP_1X1 = Uint8Array.from([
  0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  0x13, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x10, 0x07, 0x10, 0x11, 0x11, 0x88, 0x88, 0xfe,
  0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

function createTestWebpBlob(size: number): Blob {
  const bytes = new Uint8Array(Math.max(size, WEBP_1X1.byteLength));
  bytes.set(WEBP_1X1);
  return new Blob([bytes], { type: "image/webp" });
}

function createDataUrl(contentType: string, bytes = WEBP_1X1): string {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return `data:${contentType};base64,${btoa(binary)}`;
}

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
      callback(createTestWebpBlob(size));
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
    vi.unstubAllGlobals();
  });

  it.each(["image/png", "image/jpeg", "image/webp"])("接受 %s 原图", (contentType) => {
    const file = new File([new Uint8Array([1, 2, 3])], "source", { type: contentType });
    expect(() => {
      validateImageSource(file, getImageCompressionPolicy("logo"));
    }).not.toThrow();
  });

  it.each([
    { name: "photo.heic", type: "image/heic" },
    { name: "photo.HEIC", type: "" },
    { name: "photo.heif", type: "image/heif" },
    { name: "photo.heic", type: "image/png" },
  ])("明确拒绝 HEIC/HEIF 输入：$name", ({ name, type }) => {
    const file = new File([new Uint8Array([1, 2, 3])], name, { type });
    expect(() => {
      validateImageSource(file, getImageCompressionPolicy("logo"));
    }).toThrow("不支持 HEIC");
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

  it("ImageBitmap 缺少 close 时仍能完成压缩", async () => {
    const bitmap = { width: 400, height: 200 } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap)),
    );
    const { canvas } = createMockCanvas(() => 100);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    await expect(
      compressImage(new File(["png"], "logo.png", { type: "image/png" }), "logo"),
    ).resolves.toMatchObject({ byteLength: 100, previewUrl: "blob:test-1" });
  });

  it("createImageBitmap 失败时回退 HTMLImageElement，并清理输入 object URL", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("WebKit decode failed")),
    );
    class TestImage {
      naturalWidth = 400;
      naturalHeight = 200;
      width = 0;
      height = 0;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_: string) {
        this.onload?.();
      }
    }
    vi.stubGlobal("Image", TestImage);
    const { canvas, context } = createMockCanvas(() => 100);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const result = await compressImage(
      new File(["jpeg"], "logo.jpg", { type: "image/jpeg" }),
      "logo",
    );

    expect(result.width).toBe(128);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-1");
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(context.drawImage).toHaveBeenCalledWith(expect.any(TestImage), 0, 0, 128, 64);
  });

  it("HTMLImageElement 回退解码失败时清理输入 object URL", async () => {
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn().mockRejectedValue(new Error("WebKit decode failed")),
    );
    class TestImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_: string) {
        this.onerror?.();
      }
    }
    vi.stubGlobal("Image", TestImage);

    await expect(
      compressImage(new File(["jpeg"], "logo.jpg", { type: "image/jpeg" }), "logo"),
    ).rejects.toMatchObject({ code: "DECODE_UNSUPPORTED" });
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-1");
    expect(createObjectUrl).toHaveBeenCalledOnce();
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

  it.each(["空 Blob", "错误 MIME", "抛出异常"])(
    "toBlob %s 时回退到真实 WebP 的 toDataURL",
    async (failureMode) => {
      const bitmap = { width: 128, height: 128, close: vi.fn() } as unknown as ImageBitmap;
      vi.stubGlobal(
        "createImageBitmap",
        vi.fn(() => Promise.resolve(bitmap)),
      );
      const { canvas } = createMockCanvas(() => 100);
      const toDataUrl = vi.fn(() => createDataUrl("image/webp"));
      Object.defineProperty(canvas, "toDataURL", {
        configurable: true,
        value: toDataUrl,
      });
      const toBlob = vi.spyOn(canvas, "toBlob");
      if (failureMode === "空 Blob") {
        toBlob.mockImplementation((callback) => {
          callback(null);
        });
      } else if (failureMode === "错误 MIME") {
        toBlob.mockImplementation((callback) => {
          callback(new Blob([WEBP_1X1], { type: "image/png" }));
        });
      } else {
        toBlob.mockImplementation(() => {
          throw new Error("toBlob failed");
        });
      }
      vi.spyOn(document, "createElement").mockReturnValue(canvas);

      const result = await compressImage(
        new File(["png"], "logo.png", { type: "image/png" }),
        "logo",
      );

      expect(result.blob.type).toBe("image/webp");
      expect(result.byteLength).toBe(WEBP_1X1.byteLength);
      expect(toDataUrl).toHaveBeenCalledWith("image/webp", 0.85);
    },
  );

  it.each([
    { label: "PNG MIME", dataUrl: createDataUrl("image/png") },
    {
      label: "WebP MIME 但 PNG 字节",
      dataUrl: createDataUrl("image/webp", Uint8Array.from([0x89, 0x50, 0x4e, 0x47])),
    },
  ])("拒绝 toDataURL 的 $label 伪装结果", async ({ dataUrl }) => {
    const bitmap = { width: 128, height: 128, close: vi.fn() } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap)),
    );
    const { canvas } = createMockCanvas(() => 100);
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => {
      callback(null);
    });
    Object.defineProperty(canvas, "toDataURL", {
      configurable: true,
      value: vi.fn(() => dataUrl),
    });
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    await expect(
      compressImage(new File(["png"], "logo.png", { type: "image/png" }), "logo"),
    ).rejects.toMatchObject({ code: "ENCODE_UNSUPPORTED" });
    expect(createObjectUrl).not.toHaveBeenCalled();
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
