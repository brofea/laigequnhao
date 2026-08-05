import { mount } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DemoGroup } from "../data/fixtures";

const mocks = vi.hoisted(() => ({
  compressImage: vi.fn(),
  revokeImagePreview: vi.fn(),
}));

vi.mock("@/shared/browser/image-compression", () => mocks);

import AdminEditForm from "./AdminEditForm.vue";

const group: DemoGroup = {
  id: "compression-failure-group",
  title: "压缩失败测试群",
  platform: "QQ",
  kind: "兴趣",
  description: "测试图片压缩失败反馈。",
  tags: [],
  likes: 0,
  liked: false,
  avatarState: "missing",
  status: "pending",
  inRecycleBin: false,
  joinMethods: [{ id: "qr-method", type: "qr", label: "二维码", value: "二维码占位区域" }],
};

function fileInput(wrapper: ReturnType<typeof mount>, index: number) {
  const input = wrapper.findAll('input[type="file"]')[index];
  if (!input) throw new Error(`缺少第 ${String(index)} 个图片输入框。`);
  return input.element as HTMLInputElement;
}

async function triggerImageFailure(
  wrapper: ReturnType<typeof mount>,
  inputIndex: number,
): Promise<void> {
  const input = fileInput(wrapper, inputIndex);
  Object.defineProperty(input, "files", {
    configurable: true,
    value: [new File(["source"], "source.png", { type: "image/png" })],
  });
  const inputWrapper = wrapper.findAll('input[type="file"]')[inputIndex];
  if (!inputWrapper) throw new Error(`缺少第 ${String(inputIndex)} 个图片输入框。`);
  await inputWrapper.trigger("change");
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("AdminEditForm 图片压缩失败反馈", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.compressImage.mockRejectedValue(new Error("encode failed"));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("头像失败时提示精确 Toast，且保存不会携带 logo Blob", async () => {
    const wrapper = mount(AdminEditForm, { props: { group } });

    await triggerImageFailure(wrapper, 0);

    expect(wrapper.emitted("toast")).toEqual([["图像压缩失败"]]);
    expect(mocks.compressImage).toHaveBeenCalledWith(expect.any(File), "logo");

    await wrapper.get("form").trigger("submit");
    const save = wrapper.emitted("save")?.[0];
    expect(save?.[1]).toEqual({ logo: undefined, qr: [] });
    wrapper.unmount();
  });

  it("二维码失败时提示裁剪 Toast，且保存不会携带 QR Blob", async () => {
    const wrapper = mount(AdminEditForm, { props: { group } });

    await triggerImageFailure(wrapper, 1);

    expect(wrapper.emitted("toast")).toEqual([["图像压缩失败，请考虑裁剪图像"]]);
    expect(mocks.compressImage).toHaveBeenCalledWith(expect.any(File), "qr_code");

    await wrapper.get("form").trigger("submit");
    const save = wrapper.emitted("save")?.[0];
    expect(save?.[1]).toEqual({ logo: undefined, qr: [] });
    wrapper.unmount();
  });
});
