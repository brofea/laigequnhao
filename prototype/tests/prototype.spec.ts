import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import App from "../App.vue";
import { adminHiddenColumnOrder, adminVisibleColumns } from "../data/responsive";

const prototypeStyles = readFileSync(resolve(process.cwd(), "prototype/styles/index.css"), "utf8");
const uiDesignSpec = readFileSync(
  resolve(process.cwd(), ".trellis/spec/frontend/ui-design.md"),
  "utf8",
);

describe("T02 visual prototype", () => {
  beforeEach(() => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it("renders the public sample and switches the three theme preferences", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    expect(wrapper.text()).toContain("发现新群");
    expect(wrapper.find(".prototype-app").attributes("data-theme")).toBe("light");

    await wrapper.get("button[aria-label='切换主题偏好']").trigger("click");
    await wrapper.get("button[aria-label='切换主题偏好']").trigger("click");
    expect(wrapper.find(".prototype-app").attributes("data-theme")).toBe("dark");
    await wrapper.get("button[aria-label='切换主题偏好']").trigger("click");
    await wrapper.get("button[aria-label='切换主题偏好']").trigger("click");
    expect(wrapper.find(".prototype-app").attributes("data-theme")).toBe("light");
    wrapper.unmount();
  });

  it("opens and closes a group dialog without opening it from the like control", async () => {
    const wrapper = mount(App, { attachTo: document.body });
    const firstCard = wrapper.find(".group-card");
    await firstCard.find(".like-button").trigger("click");
    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
    await firstCard.find(".group-card__body").trigger("click");
    expect(wrapper.find("[role='dialog']").exists()).toBe(true);
    await wrapper.get("[role='dialog'] button[aria-label='关闭弹窗']").trigger("click");
    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("uses a tag as the local search query", async () => {
    const wrapper = mount(App);
    const tag = wrapper.find(".tag-card");
    await tag.trigger("click");
    expect((wrapper.get("input[type='search']").element as HTMLInputElement).value).toBe("UI 设计");
    expect(wrapper.text()).toContain("搜索“UI 设计”");
    wrapper.unmount();
  });

  it("keeps the admin column contract ordered from least to most important", () => {
    expect(adminHiddenColumnOrder).toEqual(["tags", "kind", "likes", "platform"]);
    expect(adminVisibleColumns(390)).toEqual(["title", "status", "actions"]);
    expect(adminVisibleColumns(768)).toEqual([
      "title",
      "status",
      "kind",
      "likes",
      "platform",
      "actions",
    ]);
  });

  it("uses carousel boards and cycles sortable table headings", async () => {
    const wrapper = mount(App);
    expect(wrapper.findAll(".board-carousel").length).toBe(2);
    await wrapper.get(".proto-nav button:nth-child(2)").trigger("click");
    const recycleToggle = wrapper.get(".admin-toolbar button[aria-pressed]");
    expect(recycleToggle.attributes("aria-pressed")).toBe("false");
    expect(wrapper.findAll(".admin-table tbody tr")).toHaveLength(16);
    const statusSelect = wrapper.get(".admin-toolbar [role='combobox']");
    await statusSelect.trigger("click");
    await wrapper.get("[role='option'][aria-selected='false']").trigger("click");
    expect(statusSelect.text()).toContain("已发布");
    expect(wrapper.findAll(".admin-table tbody tr")).toHaveLength(12);
    await statusSelect.trigger("click");
    await wrapper
      .findAll("[role='option']")
      .find((option) => option.text() === "待审核")
      ?.trigger("click");
    expect(wrapper.findAll(".admin-table tbody tr")).toHaveLength(1);
    await statusSelect.trigger("click");
    await wrapper
      .findAll("[role='option']")
      .find((option) => option.text() === "全部状态")
      ?.trigger("click");
    await recycleToggle.trigger("click");
    expect(recycleToggle.attributes("aria-pressed")).toBe("true");
    expect(wrapper.findAll(".admin-table tbody tr")).toHaveLength(18);
    expect(wrapper.text()).toContain("回收站：旧活动群");
    const titleSort = wrapper.find(".admin-table__title .admin-table__sort-button");
    await titleSort.trigger("click");
    expect(titleSort.element.parentElement?.getAttribute("aria-sort")).toBe("ascending");
    await titleSort.trigger("click");
    expect(titleSort.element.parentElement?.getAttribute("aria-sort")).toBe("descending");
    await titleSort.trigger("click");
    expect(titleSort.element.parentElement?.getAttribute("aria-sort")).toBe("none");
    wrapper.unmount();
  });

  it("uses gradient carousel boundaries and keeps the dense desktop column contract", () => {
    const wrapper = mount(App);
    expect(wrapper.findAll(".carousel-edge-hint")).toHaveLength(0);
    expect(prototypeStyles).toContain(".carousel-shell::before");
    expect(prototypeStyles).toContain(".carousel-shell::after");
    expect(prototypeStyles).toContain("@keyframes proto-dialog-backdrop-in");
    expect(prototypeStyles).toContain("@keyframes proto-dialog-drawer-in");
    expect(prototypeStyles).toContain("animation-name: proto-dialog-drawer-in;");
    expect(prototypeStyles).toContain("top: 18px;");
    expect(prototypeStyles).not.toContain(".carousel-edge-hint");
    expect(prototypeStyles).toContain(
      ".group-grid {\n  display: grid;\n  grid-template-columns: repeat(5,",
    );
    expect(prototypeStyles).toContain(
      ".tag-grid {\n  display: grid;\n  grid-template-columns: repeat(7,",
    );
    expect(wrapper.find(".carousel-controls").findAll(".proto-button--normal")).toHaveLength(2);
    expect(prototypeStyles).toContain("@media (max-width: 1240px)");
    expect(prototypeStyles).toContain("grid-template-columns: repeat(4");
    expect(prototypeStyles).toContain("--carousel-inline-padding");
    expect(prototypeStyles).toContain("-webkit-line-clamp: 4");
    expect(prototypeStyles).toContain(".group-avatar {");
    expect(prototypeStyles).toContain("box-shadow: none;");
    wrapper.unmount();
  });

  it("documents the two button surfaces and one-layer input focus contract", async () => {
    const wrapper = mount(App);
    await wrapper.get(".proto-nav button:nth-child(3)").trigger("click");
    expect(wrapper.text()).toContain("正常");
    expect(wrapper.text()).toContain("低强调");
    expect(wrapper.text()).toContain("Pressed");
    expect(wrapper.text()).not.toContain("中间凸起");
    expect(wrapper.text()).not.toContain("中间平");
    expect(prototypeStyles).toContain(".proto-field__control:focus-within");
    expect(prototypeStyles).toContain("outline: 0;");
    expect(prototypeStyles).toContain(".proto-field input:focus-visible");
    wrapper.unmount();
  });

  it("keeps the reviewed header and admin surface contracts", async () => {
    const wrapper = mount(App);
    expect(wrapper.find(".proto-brand").text()).toContain("找一个值得加入的群");
    expect(wrapper.find(".proto-brand small").exists()).toBe(false);
    expect(wrapper.text()).toContain("系统");

    await wrapper.get(".proto-nav button:nth-child(2)").trigger("click");
    const sortIcon = wrapper.find(".admin-table__sort-button svg path");
    expect(sortIcon.attributes("d")).toBe("M5 12h14");
    await wrapper.get(".admin-sidebar button:nth-child(2)").trigger("click");
    expect(wrapper.findAll(".board-panel__actions .proto-button--normal").length).toBeGreaterThan(
      0,
    );
    expect(
      wrapper.findAll(".board-member-order-actions .table-icon-button").length,
    ).toBeGreaterThan(0);
    await wrapper.get(".admin-sidebar button:nth-child(3)").trigger("click");
    expect(prototypeStyles).toContain(".stats-kpi,");
    expect(prototypeStyles).toContain("box-shadow: var(--shadow-raised);");
    wrapper.unmount();
  });

  it("keeps card metadata left-aligned, with the badge and platform together", () => {
    const wrapper = mount(App);
    const meta = wrapper.get(".group-card__meta");
    expect(
      meta
        .find(".proto-badge")
        .element.compareDocumentPosition(meta.find(".group-card__platform").element),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(prototypeStyles).toContain("justify-content: flex-start;");
    expect(prototypeStyles).toContain(".group-card__platform {\n  margin-left: 0;");
    expect(prototypeStyles).toContain("grid-template-columns: repeat(7, minmax(0, 1fr));");
    expect(prototypeStyles).toContain("top: -51px;");
    expect(prototypeStyles).toContain("top: -54px;");
    expect(prototypeStyles).toContain(".hero-copy h1 {\n  font-size: clamp(2.25rem, 4vw, 3rem);");
    expect(wrapper.get(".hero-copy h1").text()).toBe("找一个值得加入的群");
    wrapper.unmount();
  });

  it("documents seven-character tags and one-layer admin input focus", () => {
    const wrapper = mount(App);
    expect(uiDesignSpec).toContain("标签最多七个字");
    expect(prototypeStyles).toContain(".admin-edit-field__control:focus-within");
    expect(prototypeStyles).toContain(".admin-edit-add-row__control:focus-within");
    expect(prototypeStyles).toContain("box-shadow: 0 0 0 1px var(--focus-ring);");
    expect(prototypeStyles).toContain("outline: 0 !important;");
    expect(prototypeStyles).toContain("min-width: 64px;");
    expect(prototypeStyles).toContain(".proto-dialog--submit");
    expect(prototypeStyles).toContain(".proto-dialog--form");
    expect(prototypeStyles).toContain("width: min(100%, 720px);");
    wrapper.unmount();
  });

  it("routes the two add-group buttons to separate dialogs and protects public fields", async () => {
    const wrapper = mount(App);
    await wrapper.get(".proto-header__actions .proto-button").trigger("click");
    expect(wrapper.find("[data-dialog='public-submit-dialog']").exists()).toBe(true);
    expect(wrapper.find("[data-dialog='admin-create-dialog']").exists()).toBe(false);
    expect(wrapper.find("[data-dialog='public-submit-dialog']").text()).toContain("待审核");
    expect(wrapper.find("[data-dialog='public-submit-dialog']").text()).not.toContain("审核备注");
    await wrapper
      .get("[data-dialog='public-submit-dialog'] button[aria-label='关闭弹窗']")
      .trigger("click");

    await wrapper.get(".proto-nav button:nth-child(2)").trigger("click");
    await wrapper.get(".admin-toolbar .proto-button:last-child").trigger("click");
    const adminDialog = wrapper.get("[data-dialog='admin-create-dialog']");
    expect(adminDialog.find("[aria-label='状态']").exists()).toBe(true);
    expect(adminDialog.text()).toContain("审核备注");
    expect(adminDialog.find("input[aria-label='添加标签']").exists()).toBe(true);
    expect(adminDialog.findAll("button").some((button) => button.text() === "添加")).toBe(true);
    expect(wrapper.find("[data-dialog='public-submit-dialog']").exists()).toBe(false);
    wrapper.unmount();
  });

  it("uses a custom join-method selector and keeps method labels immutable", async () => {
    const wrapper = mount(App);
    await wrapper.get(".proto-nav button:nth-child(2)").trigger("click");
    await wrapper.get(".admin-toolbar .proto-button:last-child").trigger("click");
    const dialog = wrapper.get("[data-dialog='admin-create-dialog']");
    expect(dialog.find("[role='combobox'][aria-label='加群方式']").exists()).toBe(true);
    expect(dialog.find("input[aria-label='群号']").exists()).toBe(true);
    expect(dialog.find("input[aria-label='二维码']").exists()).toBe(false);
    expect(dialog.find("input[aria-label='加群方式名称']").exists()).toBe(false);
    await dialog.get("[role='combobox'][aria-label='加群方式']").trigger("click");
    expect(dialog.findAll("[role='option']").map((option) => option.text())).toContain("二维码");
    wrapper.unmount();
  });

  it("reuses the complete edit form for public submission and exposes upload affordances", async () => {
    const wrapper = mount(App);
    await wrapper.get(".proto-header__actions .proto-button").trigger("click");
    const dialog = wrapper.get("[data-dialog='public-submit-dialog']");
    expect(dialog.find(".admin-edit-form").exists()).toBe(true);
    expect(dialog.find("input[type='file'][aria-label='上传群组头像']").exists()).toBe(true);
    expect(dialog.find("[role='combobox'][aria-label='状态']").exists()).toBe(false);
    expect(dialog.text()).not.toContain("审核备注");
    expect(dialog.text()).toContain("添加加群方式");
    expect(dialog.find(".proto-select__trigger-icon").exists()).toBe(true);
    expect(dialog.text()).toContain("提交群组");
    wrapper.unmount();
  });

  it("uses a tall QR upload row in existing group editing and removes board drag handles", async () => {
    const wrapper = mount(App);
    await wrapper.get(".proto-nav button:nth-child(2)").trigger("click");
    const rows = wrapper.findAll(".admin-table tbody tr");
    await rows[1]?.find(".admin-table__actions .table-link-button").trigger("click");
    const dialog = wrapper.get("[data-dialog='admin-edit-dialog']");
    expect(dialog.find(".admin-edit-join-row--qr").exists()).toBe(true);
    expect(dialog.find("input[type='file'][aria-label='上传二维码']").exists()).toBe(true);
    expect(dialog.find(".admin-edit-qr-preview").exists()).toBe(true);
    await wrapper.get(".admin-sidebar button:nth-child(2)").trigger("click");
    expect(wrapper.findAll(".board-drag-handle")).toHaveLength(0);
    wrapper.unmount();
  });

  it("clears public search state when the brand returns home", async () => {
    const wrapper = mount(App);
    await wrapper.get("input[type='search']").setValue("设计");
    expect((wrapper.get("input[type='search']").element as HTMLInputElement).value).toBe("设计");
    await wrapper.get(".proto-brand").trigger("click");
    expect((wrapper.get("input[type='search']").element as HTMLInputElement).value).toBe("");
    expect(wrapper.text()).toContain("所有群组");
    wrapper.unmount();
  });

  it("opens board details and exposes destructive group editing", async () => {
    const wrapper = mount(App);
    await wrapper.get(".proto-nav button:nth-child(2)").trigger("click");
    await wrapper.get(".admin-sidebar button:nth-child(2)").trigger("click");
    await wrapper.get(".board-panel__actions .proto-button[aria-label^='编辑']").trigger("click");
    expect(wrapper.find("[data-dialog='board-edit-dialog']").exists()).toBe(true);
    expect(wrapper.text()).toContain("编辑板块详细信息");
    await wrapper
      .get("[data-dialog='board-edit-dialog'] .board-edit-form .proto-button--quiet")
      .trigger("click");

    await wrapper.get(".board-member-actions .table-link-button").trigger("click");
    expect(wrapper.find("[data-dialog='admin-edit-dialog']").exists()).toBe(true);
    expect(wrapper.find("[data-dialog='admin-edit-dialog']").text()).toContain("移除群组");
    expect(wrapper.find("[data-dialog='admin-edit-dialog']").text()).not.toContain("删除群组");
    expect(
      wrapper
        .find("[data-dialog='admin-edit-dialog'] .admin-edit-form__footer .proto-icon path")
        .attributes("d"),
    ).toBe("m9 18 6-6-6-6");
    await wrapper
      .get("[data-dialog='admin-edit-dialog'] button[aria-label='关闭弹窗']")
      .trigger("click");

    await wrapper.get(".board-member-more").trigger("click");
    expect(wrapper.find("[data-dialog='admin-edit-dialog']").exists()).toBe(true);
    await wrapper
      .get("[data-dialog='admin-edit-dialog'] button[aria-label='关闭弹窗']")
      .trigger("click");

    await wrapper.get(".admin-sidebar button:nth-child(1)").trigger("click");
    await wrapper.get(".admin-table__actions .table-link-button").trigger("click");
    const dialog = wrapper.get("[data-dialog='admin-edit-dialog']");
    expect(dialog.text()).toContain("删除群组");
    wrapper.unmount();
  });

  it("opens the board create and add-group dialogs with empty search protection", async () => {
    const wrapper = mount(App);
    await wrapper.get(".proto-nav button:nth-child(2)").trigger("click");
    await wrapper.get(".admin-sidebar button:nth-child(2)").trigger("click");

    await wrapper.get(".board-manager__toolbar .proto-button").trigger("click");
    const createDialog = wrapper.get("[data-dialog='board-create-dialog']");
    expect(createDialog.text()).toContain("创建板块");
    await createDialog.get("input[required]").setValue("新板块样例");
    await createDialog.get(".board-edit-form").trigger("submit");
    expect(wrapper.text()).toContain("新板块样例");

    await wrapper.get(".board-members-toolbar .proto-button").trigger("click");
    const picker = wrapper.get("[data-dialog='board-add-group-dialog']");
    expect(picker.find(".board-add-group-form input[type='search']").exists()).toBe(true);
    expect(picker.find(".board-group-search-results").exists()).toBe(false);
    await picker.get(".board-add-group-form input[type='search']").setValue("语言");
    expect(picker.find(".board-group-search-result").text()).toContain("语言交换角");
    wrapper.unmount();
  });

  it("closes the public submit dialog and shows the reviewed local receipt", async () => {
    const wrapper = mount(App);
    await wrapper.get(".proto-header__actions .proto-button").trigger("click");
    await wrapper
      .get("[data-dialog='public-submit-dialog'] input[required]")
      .setValue("本地提交样例");
    await wrapper.get("[data-dialog='public-submit-dialog'] form").trigger("submit");
    expect(wrapper.find("[data-dialog='public-submit-dialog']").exists()).toBe(false);
    expect(wrapper.text()).toContain("提交成功，等待审核");
    wrapper.unmount();
  });
});
