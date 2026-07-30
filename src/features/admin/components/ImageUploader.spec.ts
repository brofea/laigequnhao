import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ImageUploader from "./ImageUploader.vue";

describe("ImageUploader", () => {
  it("updates the preview when existingUrl changes", async () => {
    const wrapper = mount(ImageUploader, {
      props: {
        purpose: "logo",
        existingUrl: "https://assets.example/first.webp",
      },
    });

    expect(wrapper.get("img").attributes("src")).toBe("https://assets.example/first.webp");

    await wrapper.setProps({
      existingUrl: "https://assets.example/second.webp",
    });

    expect(wrapper.get("img").attributes("src")).toBe("https://assets.example/second.webp");
  });
});
