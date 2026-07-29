import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DraftJoinMethod } from "../composables/useAdminGroupDraft";
import AdminJoinMethodEditor from "./AdminJoinMethodEditor.vue";

function qrMethod(overrides: Partial<DraftJoinMethod> = {}): DraftJoinMethod {
  return {
    clientKey: "qr-row",
    type: "qr_code",
    value: "",
    url: "",
    assetId: "11111111-1111-4111-8111-111111111111",
    assetUrl: "https://assets.example/ready.webp",
    sortOrder: 0,
    ...overrides,
  };
}

function mountEditor(methods: DraftJoinMethod[]) {
  return mount(AdminJoinMethodEditor, {
    props: {
      methods,
      allowedTypes: ["group_number", "qr_code"],
      error: null,
      csrfToken: "csrf-token",
    },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminJoinMethodEditor QR preview", () => {
  it("shows the remote URL for an existing ready QR asset", () => {
    const wrapper = mountEditor([qrMethod()]);
    expect(wrapper.get('img[alt="二维码预览"]').attributes("src")).toBe(
      "https://assets.example/ready.webp",
    );
  });

  it("prefers a local upload preview and revokes every local Object URL on unmount", async () => {
    const createObjectUrl = vi
      .fn()
      .mockReturnValueOnce("blob:source-image")
      .mockReturnValueOnce("blob:local-preview");
    const revokeObjectUrl = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl,
    });

    class MockImage {
      naturalWidth = 20;
      naturalHeight = 20;
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;

      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal("Image", MockImage);

    vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
      if (tagName.toLowerCase() !== "canvas") {
        return document.createElementNS("http://www.w3.org/1999/xhtml", tagName);
      }
      return {
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: vi.fn() }),
        toBlob: (callback: BlobCallback) => {
          callback(new Blob(["webp"], { type: "image/webp" }));
        },
      } as unknown as HTMLCanvasElement;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            data: {
              id: "22222222-2222-4222-8222-222222222222",
              purpose: "qr_code",
              r2Key: "qr_code/22222222-2222-4222-8222-222222222222.webp",
              contentType: "image/webp",
              byteLength: 4,
              width: 20,
              height: 20,
              status: "staged",
            },
            requestId: "33333333-3333-4333-8333-333333333333",
          }),
          { status: 201, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const method = qrMethod({ assetId: null, assetUrl: "https://assets.example/old.webp" });
    const wrapper = mountEditor([method]);
    const file = new File(["image"], "qr.png", { type: "image/png" });
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      configurable: true,
      value: [file],
    });
    await input.trigger("change");
    await flushPromises();

    expect(wrapper.emitted("update:assetId")?.[0]).toEqual([
      "qr-row",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(wrapper.emitted("asset-uploaded")?.[0]).toEqual([
      null,
      "22222222-2222-4222-8222-222222222222",
    ]);

    await wrapper.setProps({
      methods: [
        {
          ...method,
          assetId: "22222222-2222-4222-8222-222222222222",
          assetUrl: "https://assets.example/remote-after-save.webp",
        },
      ],
    });
    expect(wrapper.get('img[alt="二维码预览"]').attributes("src")).toBe("blob:local-preview");

    wrapper.unmount();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:source-image");
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:local-preview");
  });

  it("cleans the asset before deleting a QR row and clears an asset on remove", async () => {
    const qr = qrMethod();
    const other: DraftJoinMethod = {
      clientKey: "number-row",
      type: "group_number",
      value: "123456",
      url: "",
      assetId: null,
      assetUrl: null,
      sortOrder: 1,
    };
    const wrapper = mountEditor([qr, other]);

    await wrapper.get('button[title="删除"]').trigger("click");
    expect(wrapper.emitted("cleanup-asset")?.[0]).toEqual([qr.assetId]);
    expect(wrapper.emitted("remove")?.[0]).toEqual([qr.clientKey]);

    const removeWrapper = mountEditor([qr]);
    const removeButton = removeWrapper
      .findAll("button")
      .find((button) => button.text().trim() === "移除");
    expect(removeButton).toBeDefined();
    await removeButton?.trigger("click");
    expect(removeWrapper.emitted("cleanup-asset")?.[0]).toEqual([qr.assetId]);
    expect(removeWrapper.emitted("update:assetId")?.[0]).toEqual([qr.clientKey, ""]);
  });
});
