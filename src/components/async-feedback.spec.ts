import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DemoGroup } from "../data/fixtures";
import Button from "./Button.vue";
import BoardManagement from "./BoardManagement.vue";
import Dialog from "./Dialog.vue";
import GroupCard from "./GroupCard.vue";
import Input from "./Input.vue";
import Select from "./Select.vue";

const group: DemoGroup = {
  id: "feedback-group",
  title: "反馈测试群",
  platform: "QQ",
  kind: "兴趣",
  description: "用于测试按钮反馈。",
  tags: ["测试"],
  likes: 1,
  liked: false,
  avatarState: "missing",
  status: "published",
  inRecycleBin: false,
  joinMethods: [],
};

describe("异步操作反馈组件契约", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("Button 立即锁定但只在 150ms 后挂载 Spinner，且与业务 disabled 分离", async () => {
    vi.useFakeTimers();
    const loadingWrapper = mount(Button, {
      props: { loading: true },
      slots: { default: "保存" },
    });
    const loadingButton = loadingWrapper.get("button");

    expect(loadingButton.attributes("disabled")).toBeDefined();
    expect(loadingButton.attributes("aria-busy")).toBe("true");
    expect(loadingButton.find(".app-button__spinner").exists()).toBe(false);

    await vi.advanceTimersByTimeAsync(149);
    expect(loadingButton.find(".app-button__spinner").exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(loadingButton.find(".app-button__spinner").exists()).toBe(true);

    await loadingWrapper.setProps({ loading: false });
    expect(loadingButton.attributes("disabled")).toBeUndefined();
    expect(loadingButton.attributes("aria-busy")).toBeUndefined();
    expect(loadingButton.find(".app-button__spinner").exists()).toBe(false);

    const disabledWrapper = mount(Button, {
      props: { disabled: true },
      slots: { default: "保存" },
    });
    const disabledButton = disabledWrapper.get("button");
    expect(disabledButton.attributes("disabled")).toBeDefined();
    expect(disabledButton.attributes("aria-busy")).toBeUndefined();
    expect(disabledButton.find(".app-button__spinner").exists()).toBe(false);
    loadingWrapper.unmount();
    disabledWrapper.unmount();
  });

  it("pending Dialog 保持打开并阻止关闭，完成后允许关闭", async () => {
    const wrapper = mount(Dialog, {
      props: { title: "确认操作", busy: true },
      slots: { default: "内容" },
    });

    await wrapper.get(".app-dialog-backdrop").trigger("click");
    await wrapper.get('button[aria-label="关闭弹窗"]').trigger("click");
    expect(wrapper.emitted("close")).toBeUndefined();

    await wrapper.setProps({ busy: false });
    await wrapper.get('button[aria-label="关闭弹窗"]').trigger("click");
    expect(wrapper.emitted("close")).toHaveLength(1);
    wrapper.unmount();
  });

  it("点赞 pending 显示忙碌语义并阻止重复触发", async () => {
    vi.useFakeTimers();
    const wrapper = mount(GroupCard, {
      props: { group, likeLoading: true },
    });
    const likeButton = wrapper.get(".like-button");

    expect(likeButton.attributes("aria-busy")).toBe("true");
    expect(likeButton.attributes("disabled")).toBeDefined();
    expect(likeButton.find(".app-button__spinner").exists()).toBe(false);
    await vi.advanceTimersByTimeAsync(150);
    expect(likeButton.find(".app-button__spinner").exists()).toBe(true);
    expect(likeButton.find(".app-button__label").exists()).toBe(false);
    await likeButton.trigger("click");
    expect(wrapper.emitted("like")).toBeUndefined();
    wrapper.unmount();
  });

  it("Select loading 只表达忙碌语义，搜索 Input 不挂载读取 Spinner", () => {
    const select = mount(Select, {
      props: {
        modelValue: "published",
        label: "状态",
        loading: true,
        options: [{ value: "published", label: "已发布" }],
      },
    });
    expect(select.get('[role="combobox"]').attributes("aria-busy")).toBe("true");
    expect(select.find(".app-field__spinner").exists()).toBe(false);

    const input = mount(Input, {
      props: { modelValue: "关键词", label: "搜索群组", clearable: true },
    });
    expect(input.find(".app-field__spinner").exists()).toBe(false);
    expect(input.findAll('button[aria-label="清除搜索"]')).toHaveLength(1);
    select.unmount();
    input.unmount();
  });

  it("板块重排锁定整个板块顺序资源，并标记其他板块为忙碌", () => {
    const wrapper = mount(BoardManagement, {
      props: {
        boards: [
          {
            id: "board-1",
            title: "板块一",
            description: "",
            enabled: true,
            memberCount: 0,
            members: [],
          },
          {
            id: "board-2",
            title: "板块二",
            description: "",
            enabled: true,
            memberCount: 0,
            members: [],
          },
        ],
        groups: [],
        pendingActions: [{ boardId: "board-1", action: "reorder" }],
      },
    });

    const panels = wrapper.findAll(".board-panel");
    expect(panels).toHaveLength(2);
    expect(panels[0]?.attributes("aria-busy")).toBe("true");
    expect(panels[1]?.attributes("aria-busy")).toBe("true");
    expect(panels[1]?.get("button[aria-label='编辑 板块二']").attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });
});
