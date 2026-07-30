import { afterEach, describe, it, expect, beforeEach, vi } from "vitest";
import { useImageProcessor, formatBytes } from "./useImageProcessor";

function createImageFile(size = 1024, type = "image/png"): File {
  return new File([new Uint8Array(size)], "test.png", { type });
}

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
    const result = await processor.process(file);
    expect(result).toBeNull();
    expect(processor.error.value).toBe("仅支持图片格式");
  });

  it("rejects files exceeding maxBytes", async () => {
    const file = createImageFile(5000);
    const result = await processor.process(file, 1000);
    expect(result).toBeNull();
    expect(processor.error.value).toContain("超过限制");
  });

  it("sets Chinese error messages", async () => {
    const file = new File(["x"], "bad.txt", { type: "text/plain" });
    await processor.process(file);
    expect(processor.error.value).toBe("仅支持图片格式");
  });

  it("resizes a QR image and returns a WebP no larger than the target", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = null;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      readAsDataURL() {
        this.result = "data:image/png;base64,AA==";
        queueMicrotask(() => this.onload?.());
      }
    }
    class MockImage {
      width = 2048;
      height = 1024;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);
    vi.stubGlobal("Image", MockImage);
    vi.stubGlobal("URL", {
      createObjectURL: vi.fn(() => "blob:processed"),
      revokeObjectURL: vi.fn(),
    });

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") {
        return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      }
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback, _type?: string, quality?: number) => {
          const size = (quality ?? 0.8) > 0.4 ? 400 * 1024 : 250 * 1024;
          callback(new Blob([new Uint8Array(size)], { type: "image/webp" }));
        },
      } as unknown as HTMLCanvasElement;
    });

    const result = await processor.process(createImageFile(), 5 * 1024 * 1024, 300 * 1024, 1024);

    expect(result).toMatchObject({
      width: 1024,
      height: 512,
      byteLength: 250 * 1024,
      previewUrl: "blob:processed",
    });
    expect(result?.blob.type).toBe("image/webp");
  });

  it("reports an error when even minimum-quality WebP exceeds the target", async () => {
    class MockFileReader {
      result: string | ArrayBuffer | null = "data:image/png;base64,AA==";
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onload?.());
      }
    }
    class MockImage {
      width = 100;
      height = 100;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("FileReader", MockFileReader);
    vi.stubGlobal("Image", MockImage);
    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName !== "canvas") {
        return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      }
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => {
          callback(new Blob([new Uint8Array(350 * 1024)], { type: "image/webp" }));
        },
      } as unknown as HTMLCanvasElement;
    });

    const result = await processor.process(createImageFile(), 5 * 1024 * 1024, 300 * 1024, 1024);

    expect(result).toBeNull();
    expect(processor.error.value).toContain("压缩后仍超过 300.0 KB");
  });
});
