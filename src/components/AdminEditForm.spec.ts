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

describe("AdminEditForm 加群方式多选下拉", () => {
  it("点击未勾选的加群方式时添加并保持菜单展开，再次点击移除", async () => {
    const wrapper = mount(AdminEditForm, {
      props: { group: { ...group, joinMethods: [] } },
    });

    await wrapper.get('button[aria-label="加群方式"]').trigger("click");
    const numberOption = wrapper
      .findAll(".app-select__option")
      .find((option) => option.text().includes("群号"));
    if (!numberOption) throw new Error("缺少加群方式选项。");

    await numberOption.trigger("click");
    expect(wrapper.find(".app-select__menu").exists()).toBe(true);
    expect(wrapper.findAll(".admin-edit-join-row")).toHaveLength(1);
    expect(numberOption.find(".app-select__check").exists()).toBe(true);

    await numberOption.trigger("click");
    expect(wrapper.findAll(".admin-edit-join-row")).toHaveLength(0);
    wrapper.unmount();
  });

  it("草稿已有加群方式时下拉显示勾选标记", async () => {
    const wrapper = mount(AdminEditForm, {
      props: {
        group: {
          ...group,
          joinMethods: [{ id: "number-method", type: "number", label: "群号", value: "12345" }],
        },
      },
    });

    await wrapper.get('button[aria-label="加群方式"]').trigger("click");
    const options = wrapper.findAll(".app-select__option");
    const numberOption = options.find((option) => option.text().includes("群号"));
    const linkOption = options.find((option) => option.text().includes("链接"));
    if (!numberOption || !linkOption) throw new Error("缺少加群方式选项。");
    expect(numberOption.find(".app-select__check").exists()).toBe(true);
    expect(linkOption.find(".app-select__check").exists()).toBe(false);
    wrapper.unmount();
  });

  it("移除后重新添加时 id 不复用，行内删除只删目标行", async () => {
    const wrapper = mount(AdminEditForm, {
      props: { group: { ...group, joinMethods: [] } },
    });

    const clickOption = async (text: string) => {
      const option = wrapper
        .findAll(".app-select__option")
        .find((item) => item.text().includes(text));
      if (!option) throw new Error(`缺少加群方式选项：${text}`);
      await option.trigger("click");
    };

    await wrapper.get('button[aria-label="加群方式"]').trigger("click");
    await clickOption("链接");
    await clickOption("群号");
    expect(wrapper.findAll(".admin-edit-join-row")).toHaveLength(2);

    // 移除链接（保持菜单展开），再重新添加
    await clickOption("链接");
    expect(wrapper.findAll(".admin-edit-join-row")).toHaveLength(1);
    await clickOption("链接");
    expect(wrapper.findAll(".admin-edit-join-row")).toHaveLength(2);

    // 删除第一行（群号）：若新加行的 id 复用了已删行的旧 id，会误删链接行
    const firstRowRemove = wrapper
      .findAll(".admin-edit-join-row")[0]
      ?.get('button[aria-label="移除加群方式"]');
    await firstRowRemove?.trigger("click");
    expect(wrapper.findAll(".admin-edit-join-row")).toHaveLength(1);
    wrapper.unmount();
  });
});
