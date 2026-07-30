import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { useImageProcessor, formatBytes, type CompressOptions } from "./useImageProcessor";

function createImageFile(size = 1024, type = "image/png"): File {
  return new File([new Uint8Array(size)], "test.png", { type });
}

const TEST_LOGO_OPTS: CompressOptions = {
  maxDimension: 128, maxBytes: 80 * 1024,
  startQuality: 85, minQuality: 5, qualityStep: 20,
  preserveAlpha: true,
};

const TEST_QR_OPTS: CompressOptions = {
  maxDimension: 1024, maxBytes: 300 * 1024,
  startQuality: 95, minQuality: 15, qualityStep: 20,
  preserveAlpha: false,
};

describe("formatBytes", () => {
  it("formats bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1.0 MB");
  });
});

describe("useImageProcessor", () => {
  let processor: ReturnType<typeof useImageProcessor>;

  beforeEach(() => {
    vi.restoreAllMocks();
    processor = useImageProcessor();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns loading, error, process, revokePreview", () => {
    expect(processor.loading.value).toBe(false);
    expect(processor.error.value).toBe("");
    expect(typeof processor.process).toBe("function");
    expect(typeof processor.revokePreview).toBe("function");
  });

  it("rejects non-image files", async () => {
    const file = new File(["hello"], "test.txt", { type: "text/plain" });
    const result = await processor.process(file, TEST_LOGO_OPTS);
    expect(result).toBeNull();
    expect(processor.error.value).toBe("仅支持图片格式");
  });

  it("rejects files exceeding 10MB sanity limit", async () => {
    // 10MB + 1 byte
    const file = createImageFile(10 * 1024 * 1024 + 1);
    const result = await processor.process(file, TEST_LOGO_OPTS);
    expect(result).toBeNull();
    expect(processor.error.value).toContain("10MB");
  });

  it("accepts oversized source files (processed down to fit)", async () => {
    // 100KB source should be accepted for logo (128px resize makes it fit)
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.result = "data:image/png;base64,AA=="; queueMicrotask(() => this.onload?.()); }
    }
    class MockImage {
      width = 800; height = 600;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("FileReader", MockFileReader);
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:test"), revokeObjectURL: vi.fn() });
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      return {
        width: 0, height: 0,
        getContext: () => ({ drawImage: vi.fn(), fillStyle: "", fillRect: vi.fn() }),
        toBlob: (callback: BlobCallback, _type?: string, quality?: number) => {
          const size = quality === 0.85 ? 60 * 1024 : 80 * 1024;
          callback(new Blob([new Uint8Array(size)], { type: "image/webp" }));
        },
      } as unknown as HTMLCanvasElement;
    });

    const result = await processor.process(createImageFile(100 * 1024), TEST_LOGO_OPTS);
    expect(result).not.toBeNull();
  });

  it("resizes a QR image and returns a WebP within target", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.result = "data:image/png;base64,AA=="; queueMicrotask(() => this.onload?.()); }
    }
    class MockImage {
      width = 2048; height = 1024;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("FileReader", MockFileReader);
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("URL", { createObjectURL: vi.fn(() => "blob:processed"), revokeObjectURL: vi.fn() });
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      return {
        width: 0, height: 0,
        getContext: () => ({ drawImage: vi.fn(), fillStyle: "", fillRect: vi.fn() }),
        toBlob: (callback: BlobCallback) => {
          callback(new Blob([new Uint8Array(250 * 1024)], { type: "image/webp" }));
        },
      } as unknown as HTMLCanvasElement;
    });

    const result = await processor.process(createImageFile(), TEST_QR_OPTS);
    expect(result).toMatchObject({
      width: 1024, height: 512,
      byteLength: 250 * 1024,
      previewUrl: "blob:processed",
    });
    expect(result?.blob.type).toBe("image/webp");
  });

  it("reports error when even min-quality exceeds target", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = "data:image/png;base64,AA==";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { queueMicrotask(() => this.onload?.()); }
    }
    class MockImage {
      width = 100; height = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal("FileReader", MockFileReader);
    vi.stubGlobal("Image", MockImage);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      return {
        width: 0, height: 0,
        getContext: () => ({ drawImage: vi.fn(), fillStyle: "", fillRect: vi.fn() }),
        toBlob: (callback: BlobCallback) => {
          callback(new Blob([new Uint8Array(400 * 1024)], { type: "image/webp" }));
        },
      } as unknown as HTMLCanvasElement;
    });

    const result = await processor.process(createImageFile(), TEST_LOGO_OPTS);
    expect(result).toBeNull();
    expect(processor.error.value).toContain("压缩失败");
  });
});
