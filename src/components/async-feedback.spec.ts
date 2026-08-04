import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { DemoGroup } from "../data/fixtures";
import Dialog from "./Dialog.vue";
import GroupCard from "./GroupCard.vue";

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
    const wrapper = mount(GroupCard, {
      props: { group, likeLoading: true },
    });
    const likeButton = wrapper.get(".like-button");

    expect(likeButton.attributes("aria-busy")).toBe("true");
    expect(likeButton.attributes("disabled")).toBeDefined();
    expect(likeButton.find(".app-button__spinner").exists()).toBe(true);
    await likeButton.trigger("click");
    expect(wrapper.emitted("like")).toBeUndefined();
  });
});
