import { describe, it, expect, afterEach } from "vitest";
import { mount } from "@vue/test-utils";
import SubmissionDialog from "./SubmissionDialog.vue";

describe("SubmissionDialog", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders when open", () => {
    mount(SubmissionDialog, {
      props: { open: true, "onUpdate:open": () => {} },
      attachTo: document.body,
    });
    expect(document.body.textContent).toContain("提交新的群聊");
  });

  it("does not render dialog content when closed", () => {
    mount(SubmissionDialog, {
      props: { open: false, "onUpdate:open": () => {} },
      attachTo: document.body,
    });
    const dialog = document.body.querySelector("dialog");
    expect(dialog).toBeNull();
  });

  it("shows required fields when open", () => {
    mount(SubmissionDialog, {
      props: { open: true, "onUpdate:open": () => {} },
      attachTo: document.body,
    });
    expect(document.body.textContent).toContain("标题 *");
    expect(document.body.textContent).toContain("群聊性质 *");
    expect(document.body.textContent).toContain("平台 *");
  });

  it("has a platform select dropdown when open", () => {
    mount(SubmissionDialog, {
      props: { open: true, "onUpdate:open": () => {} },
      attachTo: document.body,
    });
    const selects = document.body.querySelectorAll("select");
    expect(selects.length).toBeGreaterThan(0);
  });

  it("has a submit button when open", () => {
    mount(SubmissionDialog, {
      props: { open: true, "onUpdate:open": () => {} },
      attachTo: document.body,
    });
    const btn = document.body.querySelector("button[type='submit']");
    expect(btn).toBeTruthy();
    expect(btn?.textContent).toBe("提交");
  });

  it("emits update:open=false when close button is clicked", () => {
    const wrapper = mount(SubmissionDialog, {
      props: { open: true, "onUpdate:open": () => {} },
      attachTo: document.body,
    });
    const closeBtn = document.body.querySelector("button[aria-label='关闭']") as HTMLElement;
    expect(closeBtn).toBeTruthy();
    closeBtn.click();
    expect(wrapper.emitted("update:open")).toBeTruthy();
    expect(wrapper.emitted("update:open")?.[0]).toEqual([false]);
  });
});
