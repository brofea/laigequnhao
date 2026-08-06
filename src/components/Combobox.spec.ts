import { nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Combobox from "./Combobox.vue";

const options = [
  { value: "微信", label: "微信" },
  { value: "QQ", label: "QQ" },
  { value: "Telegram", label: "Telegram" },
];

describe("Combobox", () => {
  it("输入自定义值 emit 字符串，无需匹配选项", async () => {
    const wrapper = mount(Combobox, {
      props: { modelValue: "", label: "平台", options, placeholder: "选择或输入平台" },
    });

    await wrapper.get("input").setValue("OICQ");

    expect(wrapper.emitted("update:modelValue")).toEqual([["OICQ"]]);
    wrapper.unmount();
  });

  it("点选选项写入值并收起菜单", async () => {
    const wrapper = mount(Combobox, {
      props: { modelValue: "", label: "平台", options },
    });

    await wrapper.get("button.app-combobox__arrow").trigger("click");
    expect(wrapper.find(".app-select__menu").exists()).toBe(true);
    const qqOption = wrapper.findAll('button[role="option"]')[1];
    if (!qqOption) throw new Error("缺少 QQ 选项。");
    await qqOption.trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["QQ"]]);
    expect(wrapper.find(".app-select__menu").exists()).toBe(false);
    wrapper.unmount();
  });

  it("清空输入 emit 空字符串", async () => {
    const wrapper = mount(Combobox, {
      props: { modelValue: "微信", label: "平台", options },
    });

    await wrapper.get("input").setValue("");

    expect(wrapper.emitted("update:modelValue")).toEqual([[""]]);
    wrapper.unmount();
  });

  it("输入非空时菜单只显示包含输入内容的选项", async () => {
    const wrapper = mount(Combobox, {
      props: { modelValue: "", label: "平台", options },
    });

    await wrapper.get("input").trigger("focus");
    await wrapper.get("input").setValue("QQ");
    // 模拟父组件 v-model 回写
    await wrapper.setProps({ modelValue: "QQ" });

    const labels = wrapper.findAll('button[role="option"]').map((option) => option.text());
    expect(labels).toEqual(["QQ"]);
    wrapper.unmount();
  });

  it("输入不匹配任何选项时显示空提示，仍允许自定义输入", async () => {
    const wrapper = mount(Combobox, {
      props: { modelValue: "", label: "平台", options },
    });

    await wrapper.get("input").trigger("focus");
    await wrapper.get("input").setValue("OICQ");
    await wrapper.setProps({ modelValue: "OICQ" });

    expect(wrapper.find(".app-combobox__empty").exists()).toBe(true);
    expect(wrapper.findAll('button[role="option"]')).toHaveLength(0);
    wrapper.unmount();
  });

  it("Esc 收起菜单", async () => {
    const wrapper = mount(Combobox, {
      props: { modelValue: "", label: "平台", options },
    });

    await wrapper.get("input").trigger("focus");
    expect(wrapper.find(".app-select__menu").exists()).toBe(true);
    await wrapper.get("input").trigger("keydown", { key: "Escape" });

    expect(wrapper.find(".app-select__menu").exists()).toBe(false);
    wrapper.unmount();
  });

  it("Enter 选中高亮选项并收起菜单", async () => {
    const wrapper = mount(Combobox, {
      props: { modelValue: "", label: "平台", options },
    });

    await wrapper.get("input").trigger("focus");
    await wrapper.get("input").trigger("keydown", { key: "ArrowDown" });
    await wrapper.get("input").trigger("keydown", { key: "Enter" });

    expect(wrapper.emitted("update:modelValue")).toEqual([["QQ"]]);
    expect(wrapper.find(".app-select__menu").exists()).toBe(false);
    wrapper.unmount();
  });

  it("点击外部收起菜单", async () => {
    const wrapper = mount(Combobox, {
      props: { modelValue: "", label: "平台", options },
    });

    await wrapper.get("input").trigger("focus");
    expect(wrapper.find(".app-select__menu").exists()).toBe(true);

    document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    await nextTick();

    expect(wrapper.find(".app-select__menu").exists()).toBe(false);
    wrapper.unmount();
  });
});
