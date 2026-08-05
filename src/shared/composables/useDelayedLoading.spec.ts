import { defineComponent, h, nextTick, ref } from "vue";
import { mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_LOADING_DELAY_MS, useDelayedLoading } from "./useDelayedLoading";

const Harness = defineComponent({
  props: { loading: { type: Boolean, default: false } },
  setup(props) {
    const { visualLoading } = useDelayedLoading(() => props.loading);
    return () => h("output", { "data-visual-loading": String(visualLoading.value) });
  },
});

describe("useDelayedLoading", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not turn on visual loading before the 150ms boundary", async () => {
    vi.useFakeTimers();
    const wrapper = mount(Harness, { props: { loading: true } });

    await vi.advanceTimersByTimeAsync(DEFAULT_LOADING_DELAY_MS - 1);
    expect(wrapper.get("output").attributes("data-visual-loading")).toBe("false");

    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.get("output").attributes("data-visual-loading")).toBe("true");
  });

  it("clears a pending visual state when loading finishes early", async () => {
    vi.useFakeTimers();
    const loading = ref(true);
    const wrapper = mount(
      defineComponent({
        setup() {
          const { visualLoading } = useDelayedLoading(loading);
          return () => h("output", { "data-visual-loading": String(visualLoading.value) });
        },
      }),
    );

    loading.value = false;
    await nextTick();
    await vi.advanceTimersByTimeAsync(DEFAULT_LOADING_DELAY_MS);

    expect(wrapper.get("output").attributes("data-visual-loading")).toBe("false");
  });

  it("starts a fresh delay for every loading cycle", async () => {
    vi.useFakeTimers();
    const wrapper = mount(Harness, { props: { loading: true } });

    await vi.advanceTimersByTimeAsync(DEFAULT_LOADING_DELAY_MS);
    expect(wrapper.get("output").attributes("data-visual-loading")).toBe("true");

    await wrapper.setProps({ loading: false });
    await wrapper.setProps({ loading: true });
    expect(wrapper.get("output").attributes("data-visual-loading")).toBe("false");
    await vi.advanceTimersByTimeAsync(DEFAULT_LOADING_DELAY_MS - 1);
    expect(wrapper.get("output").attributes("data-visual-loading")).toBe("false");
    await vi.advanceTimersByTimeAsync(1);
    expect(wrapper.get("output").attributes("data-visual-loading")).toBe("true");
  });
});
