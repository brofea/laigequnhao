import { mount } from "@vue/test-utils";
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
    props: { methods, error: null, csrfToken: "csrf-token" },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AdminJoinMethodEditor", () => {
  it("shows remote URL for existing QR asset", () => {
    const w = mountEditor([qrMethod()]);
    expect(w.get('img[alt="二维码预览"]').attributes("src")).toBe(
      "https://assets.example/ready.webp",
    );
  });

  it("renders add buttons for available types", () => {
    const w = mountEditor([qrMethod()]);
    // QR already exists, so only "添加群号" and "添加链接" should be visible
    const buttons = w.findAll("button").map((b) => b.text().trim());
    expect(buttons).toContain("添加群号");
    expect(buttons).toContain("添加链接");
    // "添加二维码" should not exist since QR already present
    expect(buttons).not.toContain("添加二维码");
  });

  it("cleans asset before deleting QR row", async () => {
    const qr = qrMethod();
    const w = mountEditor([qr]);
    // Find the 移除 button
    const removeBtn = w.findAll("button").find((b) => b.text().trim() === "移除");
    expect(removeBtn).toBeDefined();
    if (removeBtn) await removeBtn.trigger("click");
    expect(w.emitted("cleanup-asset")?.[0]).toEqual([qr.assetId]);
    expect(w.emitted("update:assetId")?.[0]).toEqual([qr.clientKey, "", null]);
  });
});
