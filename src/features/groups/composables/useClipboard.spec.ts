import { describe, it, expect, vi, beforeEach } from "vitest";
import { useClipboard } from "./useClipboard";

describe("useClipboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("copies text successfully", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const { copy, toastMessage, toastType } = useClipboard();
    const result = await copy("123456");

    expect(result).toBe(true);
    expect(writeText).toHaveBeenCalledWith("123456");
    expect(toastMessage.value).toBe("已复制群号");
    expect(toastType.value).toBe("success");
  });

  it("sets error state on clipboard failure", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });

    const { copy, toastMessage, toastType } = useClipboard();
    const result = await copy("123456");

    expect(result).toBe(false);
    expect(toastMessage.value).toBe("复制失败，请手动复制");
    expect(toastType.value).toBe("error");
  });
});
