import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import Select from "./Select.vue";

const options = [
  { value: "link", label: "链接" },
  { value: "number", label: "群号" },
  { value: "qr", label: "二维码" },
];

describe("Select 单选模式", () => {
  it("点击选项 emit 字符串并收起菜单", async () => {
    const wrapper = mount(Select, {
      props: { modelValue: "link", label: "加群方式", options },
    });

    await wrapper.get('button[role="combobox"]').trigger("click");
    const numberOption = wrapper.findAll('button[role="option"]')[1];
    if (!numberOption) throw new Error("缺少第二个选项。");
    await numberOption.trigger("click");

    expect(wrapper.emitted("update:modelValue")).toEqual([["number"]]);
    expect(wrapper.find(".app-select__menu").exists()).toBe(false);
    wrapper.unmount();
  });

  it("仅选中项显示勾选标记，trigger 展示选中项文本", async () => {
    const wrapper = mount(Select, {
      props: { modelValue: "link", label: "加群方式", options },
    });

    expect(wrapper.get('button[role="combobox"]').text()).toContain("链接");

    await wrapper.get('button[role="combobox"]').trigger("click");
    const buttons = wrapper.findAll('button[role="option"]');
    expect(buttons[0]?.find(".app-select__check").exists()).toBe(true);
    expect(buttons[1]?.find(".app-select__check").exists()).toBe(false);
    expect(buttons[2]?.find(".app-select__check").exists()).toBe(false);
    wrapper.unmount();
  });
});

describe("Select 多选模式", () => {
  it("点击选项切换选中态并 emit 数组，菜单保持展开", async () => {
    const wrapper = mount(Select, {
      props: { modelValue: ["link"], label: "加群方式", options, multiple: true },
    });

    await wrapper.get('button[role="combobox"]').trigger("click");
    const numberOption = wrapper.findAll('button[role="option"]')[1];
    if (!numberOption) throw new Error("缺少第二个选项。");

    await numberOption.trigger("click");
    expect(wrapper.emitted("update:modelValue")).toEqual([[["link", "number"]]]);
    expect(wrapper.find(".app-select__menu").exists()).toBe(true);

    // 模拟父组件 v-model 回写（真实使用中由 modelValue 绑定方完成）。
    await wrapper.setProps({ modelValue: ["link", "number"] });
    const numberOptionAfter = wrapper.findAll('button[role="option"]')[1];
    if (!numberOptionAfter) throw new Error("缺少第二个选项。");
    await numberOptionAfter.trigger("click");
    expect(wrapper.emitted("update:modelValue")?.[1]).toEqual([["link"]]);
    expect(wrapper.find(".app-select__menu").exists()).toBe(true);
    wrapper.unmount();
  });

  it("多个选中项同时显示勾选标记", async () => {
    const wrapper = mount(Select, {
      props: { modelValue: ["link", "number"], label: "加群方式", options, multiple: true },
    });

    await wrapper.get('button[role="combobox"]').trigger("click");
    const buttons = wrapper.findAll('button[role="option"]');
    expect(buttons[0]?.find(".app-select__check").exists()).toBe(true);
    expect(buttons[1]?.find(".app-select__check").exists()).toBe(true);
    expect(buttons[2]?.find(".app-select__check").exists()).toBe(false);
    wrapper.unmount();
  });

  it("trigger 不渲染已选项文本", () => {
    const wrapper = mount(Select, {
      props: { modelValue: ["link", "number"], label: "加群方式", options, multiple: true },
    });

    expect(wrapper.get('button[role="combobox"]').text()).toContain("请选择");
    expect(wrapper.get('button[role="combobox"]').text()).not.toContain("链接");
    wrapper.unmount();
  });
});
