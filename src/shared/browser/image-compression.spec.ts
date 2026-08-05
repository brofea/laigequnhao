import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
/* eslint-disable @typescript-eslint/unbound-method */
import jsQR from "jsqr";
import sharp from "sharp";
import {
  calculateTargetDimensions,
  detectQrCode,
  compressImage,
  getImageCompressionPolicy,
  revokeImagePreview,
  validateImageSource,
} from "./image-compression";

const REAL_QR_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAIAAAACAAQMAAAD58POIAAAABlBMVEX///8AAABVwtN+AAAACXBI" +
  "WXMAAA7EAAAOxAGVKw4bAAABEUlEQVRIia2Vsa3DMAxEL3ChMiNok3gxITbgxaxNNIJKF4H4j3TwE6T1sbCF5+KM45ECfmsxs46cBkrmcUhAAW69ZMz2ytR4akC22oFUXcq6ECyWzFYxmBoePOmA+7E0q1T5GHQRROcoUPt3Ky+CqMkOtu8raBcBVapZOx6Y+LivIuAvDy4BRCBceEVwwU9DAmiFu5Aq6eGdU4CSj7lPHtzNSIcEMF773RqFCk6TBaD4X2/NfMRsuEESQBVacSOyPcZDAnzDcCQ8bR0SEOUjxjikAQ045xaxtc/OCUBsGO7W3e0+TRaAWLCN02Bvg3SA8do8vUMJqLIC8//dcBG8b8JY3QMaEJ1zFQ7vZ42rwW/9AcnxGospmPkqAAAAAElFTkSuQmCC";
const VALID_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function decodeBase64(value: string): ArrayBuffer {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function createValidPngBytes(size?: number): Uint8Array {
  const source = new Uint8Array(decodeBase64(VALID_PNG_BASE64));
  const bytes = new Uint8Array(Math.max(size ?? 0, source.byteLength));
  bytes.set(source);
  return bytes;
}

function createPngBlob(size?: number, type = "image/png"): Blob {
  const bytes = createValidPngBytes(size);
  const blobBytes = new Uint8Array(bytes.byteLength);
  blobBytes.set(bytes);
  return new Blob([blobBytes.buffer], { type });
}

function readBlobBytes(blob: Blob): Promise<Uint8Array> {
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

function createMockCanvas(output: Blob | null | (() => Blob | null)) {
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
    toBlob: vi.fn((callback: BlobCallback, _type?: string) => {
      callback(typeof output === "function" ? output() : output);
    }),
  } as unknown as HTMLCanvasElement;
  return { canvas, context };
}

function stubBitmap(width = 128, height = 128) {
  const bitmap = { width, height, close: vi.fn() } as unknown as ImageBitmap;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(() => Promise.resolve(bitmap)),
  );
  return bitmap;
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

  it("按最长边等比缩放，不再暴露质量阶梯", () => {
    expect(calculateTargetDimensions(4000, 2000, 128)).toEqual({ width: 128, height: 64 });
    expect(calculateTargetDimensions(80, 40, 128)).toEqual({ width: 80, height: 40 });
    expect(getImageCompressionPolicy("logo")).not.toHaveProperty("startQuality");
    expect(getImageCompressionPolicy("qr_code")).not.toHaveProperty("qualityStep");
  });

  it("logo 使用 alpha canvas，单次编码为带 PNG 签名的结果并生成可清理预览", async () => {
    const bitmap = stubBitmap(400, 200);
    const output = createPngBlob(100);
    const { canvas, context } = createMockCanvas(output);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const result = await compressImage(
      new File(["png"], "logo.png", { type: "image/png" }),
      "logo",
    );
    const bytes = await readBlobBytes(result.blob);

    expect(result).toMatchObject({
      width: 128,
      height: 64,
      byteLength: output.size,
      purpose: "logo",
      previewUrl: "blob:test-1",
      blob: { type: "image/png" },
    });
    expect(Array.from(bytes.slice(0, 8))).toEqual(PNG_SIGNATURE);
    expect(canvas.width).toBe(128);
    expect(canvas.height).toBe(64);
    expect(canvas.toBlob).toHaveBeenCalledOnce();
    expect(canvas.toBlob).toHaveBeenCalledWith(expect.any(Function), "image/png");
    expect(canvas.getContext).toHaveBeenCalledWith("2d", { alpha: true });
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 128, 64);
    expect(bitmap.close).toHaveBeenCalledOnce();

    revokeImagePreview(result.previewUrl);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-1");
  });

  it("ImageBitmap 缺少 close 时仍能完成 PNG 压缩", async () => {
    const bitmap = { width: 400, height: 200 } as unknown as ImageBitmap;
    vi.stubGlobal(
      "createImageBitmap",
      vi.fn(() => Promise.resolve(bitmap)),
    );
    const output = createPngBlob(100);
    const { canvas } = createMockCanvas(output);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    await expect(
      compressImage(new File(["png"], "logo.png", { type: "image/png" }), "logo"),
    ).resolves.toMatchObject({ byteLength: output.size, previewUrl: "blob:test-1" });
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
    const output = createPngBlob(100);
    const { canvas, context } = createMockCanvas(output);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const result = await compressImage(
      new File(["jpeg"], "logo.jpg", { type: "image/jpeg" }),
      "logo",
    );

    expect(result.width).toBe(128);
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:test-1");
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

  it("二维码使用不透明 canvas 铺纯白底，并且只编码一次", async () => {
    const bitmap = stubBitmap(2000, 1000);
    const policy = getImageCompressionPolicy("qr_code");
    const output = createPngBlob(policy.maxBytes);
    const { canvas, context } = createMockCanvas(output);
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const result = await compressImage(
      new File([decodeBase64(REAL_QR_PNG_BASE64)], "group-qr.png", { type: "image/png" }),
      "qr_code",
    );

    expect(result.width).toBe(1024);
    expect(result.height).toBe(512);
    expect(result.blob.type).toBe("image/png");
    expect(result.byteLength).toBe(policy.maxBytes);
    expect(canvas.toBlob).toHaveBeenCalledOnce();
    expect(canvas.getContext).toHaveBeenCalledWith("2d", { alpha: false });
    expect(context.fillStyle).toBe("#fff");
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1024, 512);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1024, 512);
  });

  it("真实 PNG 二维码经过白底编码后仍可被扫码器识别且没有透明像素", async () => {
    const sourcePng = Buffer.from(decodeBase64(REAL_QR_PNG_BASE64));
    stubBitmap();
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillStyle: "",
    } as unknown as CanvasRenderingContext2D;
    let encodedPng: Buffer | undefined;
    const canvas = {
      width: 128,
      height: 128,
      getContext: vi.fn(() => context),
      toBlob: vi.fn(async (callback: BlobCallback, type?: string) => {
        expect(type).toBe("image/png");
        encodedPng = await sharp(sourcePng).flatten({ background: "#fff" }).png().toBuffer();
        const blobBytes = new Uint8Array(encodedPng.byteLength);
        blobBytes.set(encodedPng);
        callback(new Blob([blobBytes.buffer], { type: "image/png" }));
      }),
    } as unknown as HTMLCanvasElement;
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    const result = await compressImage(
      new File([sourcePng], "group-qr.png", { type: "image/png" }),
      "qr_code",
    );
    expect(result.byteLength).toBeLessThanOrEqual(getImageCompressionPolicy("qr_code").maxBytes);
    expect(encodedPng).toBeDefined();
    if (!encodedPng) throw new Error("测试未产生 PNG 编码结果。");

    const { data, info } = await sharp(encodedPng)
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

  it.each(["空 Blob", "错误 MIME", "错误签名"])(
    "toBlob %s 时失败且不调用 data URL fallback",
    async (failureMode) => {
      const bitmap = stubBitmap();
      const blob =
        failureMode === "空 Blob"
          ? null
          : failureMode === "错误 MIME"
            ? createPngBlob(undefined, "image/jpeg")
            : new Blob([new Uint8Array(16)], { type: "image/png" });
      const { canvas } = createMockCanvas(blob);
      const toDataUrl = vi.fn();
      Object.defineProperty(canvas, "toDataURL", {
        configurable: true,
        value: toDataUrl,
      });
      vi.spyOn(document, "createElement").mockReturnValue(canvas);

      await expect(
        compressImage(new File(["png"], "logo.png", { type: "image/png" }), "logo"),
      ).rejects.toMatchObject({ code: "ENCODE_UNSUPPORTED" });
      expect(canvas.toBlob).toHaveBeenCalledOnce();
      expect(toDataUrl).not.toHaveBeenCalled();
      expect(createObjectUrl).not.toHaveBeenCalled();
      expect(bitmap.close).toHaveBeenCalledOnce();
    },
  );

  it("PNG 单次编码超过头像上限时失败且不生成预览", async () => {
    const bitmap = stubBitmap(200, 200);
    const policy = getImageCompressionPolicy("logo");
    const { canvas } = createMockCanvas(createPngBlob(policy.maxBytes + 1));
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    await expect(
      compressImage(new File(["x"], "logo.jpg", { type: "image/jpeg" }), "logo"),
    ).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
    expect(canvas.toBlob).toHaveBeenCalledOnce();
    expect(createObjectUrl).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("PNG 单次编码超过二维码上限时失败且不生成预览", async () => {
    stubBitmap(2000, 1000);
    const policy = getImageCompressionPolicy("qr_code");
    const { canvas } = createMockCanvas(createPngBlob(policy.maxBytes + 1));
    vi.spyOn(document, "createElement").mockReturnValue(canvas);

    await expect(
      compressImage(new File(["x"], "qr.png", { type: "image/png" }), "qr_code"),
    ).rejects.toMatchObject({ code: "OUTPUT_TOO_LARGE" });
    expect(canvas.toBlob).toHaveBeenCalledOnce();
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
