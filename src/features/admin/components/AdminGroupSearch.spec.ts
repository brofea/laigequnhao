import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AdminGroupSearch from "./AdminGroupSearch.vue";

describe("AdminGroupSearch", () => {
  it("emits the current value for Enter and an empty value for clear", async () => {
    const wrapper = mount(AdminGroupSearch, {
      props: { modelValue: "" },
    });
    const input = wrapper.get('input[type="search"]');

    await input.setValue("  测试  ");
    await input.trigger("keydown", { key: "Enter" });
    expect(wrapper.emitted("search")?.at(-1)).toEqual(["  测试  "]);

    await wrapper.get('button[aria-label="清除搜索"]').trigger("click");
    expect(wrapper.emitted("clear")?.at(-1)).toEqual([""]);
    expect(wrapper.emitted("update:modelValue")?.at(-1)).toEqual([""]);
  });
});
