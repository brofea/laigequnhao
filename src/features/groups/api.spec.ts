import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitGroup } from "./api";

const requestId = "00000000-0000-4000-8000-000000000001";
const receipt = {
  ok: true,
  data: {
    id: "00000000-0000-4000-8000-000000000002",
    title: "测试群",
    status: "pending",
  },
  requestId,
};

describe("submitGroup 图片接线", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("有 logo 时用 payload + 单张 PNG 组成 multipart", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      expect(init.body).toBeInstanceOf(FormData);
      const form = init.body as FormData;
      const payload = form.get("payload");
      if (typeof payload !== "string") throw new Error("payload 必须是 JSON 字符串");
      expect(JSON.parse(payload)).toMatchObject({
        title: "测试群",
      });
      expect(form.get("filePurpose")).toBe("logo");
      const file = form.get("file");
      expect(file).toBeInstanceOf(File);
      expect((file as File).type).toBe("image/png");
      expect((file as File).name).toBe("logo.png");
      return Promise.resolve(
        new Response(JSON.stringify(receipt), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitGroup(
      {
        title: "测试群",
        kind: "interest",
        platform: "微信",
        groupNumber: "123456",
      },
      new Blob(["final png"], { type: "image/png" }),
    );

    expect(result).toMatchObject({ ok: true, data: receipt.data });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("无图片时保留原有 JSON 投稿路径", async () => {
    const fetchMock = vi.fn().mockImplementation((_url: string, init: RequestInit) => {
      expect(init.body).not.toBeInstanceOf(FormData);
      if (typeof init.body !== "string") throw new Error("JSON 投稿必须使用字符串 body");
      expect(JSON.parse(init.body)).toMatchObject({
        title: "测试群",
        platform: "微信",
      });
      return Promise.resolve(
        new Response(JSON.stringify(receipt), {
          status: 201,
          headers: { "content-type": "application/json" },
        }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await submitGroup({
      title: "测试群",
      kind: "interest",
      platform: "微信",
      groupNumber: "123456",
    });

    expect(result).toMatchObject({ ok: true, data: receipt.data });
  });
});
