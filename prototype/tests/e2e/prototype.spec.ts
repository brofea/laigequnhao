import { expect, test } from "@playwright/test";

test("public sample, theme, dialog and share feedback stay local", async ({ page }) => {
  let businessApiRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/")) businessApiRequests += 1;
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "发现新群" })).toBeVisible();
  await page.getByRole("button", { name: "切换主题偏好" }).click();
  await page.getByRole("button", { name: "切换主题偏好" }).click();
  await expect(page.locator(".prototype-app")).toHaveAttribute("data-theme", "dark");

  await page
    .getByRole("button", { name: /设计师交换站/ })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "分享", exact: true }).click();
  await expect(page.getByRole("status").last()).toContainText("分享链接已复制");
  await page.getByRole("button", { name: "关闭弹窗" }).last().click();
  expect(businessApiRequests).toBe(0);
});

test("admin board members use an internal scroll surface", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "管理端" }).click();
  await page.getByRole("button", { name: "板块管理" }).click();
  await expect(page.getByRole("heading", { name: "板块排序与成员预览" })).toBeVisible();
  await expect(page.locator(".board-members").first()).toHaveCSS("overflow-y", "auto");
});

test("mobile board members hide status and use flat more actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "管理端" }).click();
  await page.getByRole("button", { name: "板块管理" }).click();
  await expect(page.locator(".board-members__status").first()).toBeHidden();
  await expect(page.locator(".board-member-actions").first()).toBeHidden();
  await expect(page.locator(".board-member-more").first()).toBeVisible();
  await page.locator(".board-member-more").first().click();
  const dialog = page.locator("[data-dialog='admin-edit-dialog']");
  await expect(dialog.getByRole("button", { name: "移除群组" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "删除群组" })).toHaveCount(0);
});

test("group management toggles the local recycle bin surface", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "管理端" }).click();
  const toggle = page.getByRole("button", { name: "回收站" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(16);
  const status = page.getByRole("combobox", { name: "状态" });
  await status.click();
  await page.getByRole("option", { name: "已发布", exact: true }).click();
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(12);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(13);
  await status.click();
  await page.getByRole("option", { name: "待审核", exact: true }).click();
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(2);
  await status.click();
  await page.getByRole("option", { name: "已拒绝", exact: true }).click();
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(1);
  await status.click();
  await page.getByRole("option", { name: "已下架", exact: true }).click();
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(2);
  await status.click();
  await page.getByRole("option", { name: "全部状态", exact: true }).click();
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(18);
  await expect(page.getByRole("rowheader", { name: /回收站：旧活动群/ })).toBeVisible();
});

test("board edit opens a detail dialog", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "管理端" }).click();
  await page.getByRole("button", { name: "板块管理" }).click();
  await page.locator(".board-panel__actions").first().getByRole("button", { name: /编辑/ }).click();
  await expect(page.locator("[data-dialog='board-edit-dialog']")).toBeVisible();
  await expect(page.getByRole("heading", { name: "编辑板块详细信息" })).toBeVisible();
});

test("board management opens create and add-group dialogs without empty search results", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "管理端" }).click();
  await page.getByRole("button", { name: "板块管理" }).click();
  await page.locator(".board-manager__toolbar").getByRole("button", { name: "添加板块" }).click();
  const createDialog = page.locator("[data-dialog='board-create-dialog']");
  await expect(createDialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "新增板块" })).toBeVisible();
  await createDialog.locator("input[required]").fill("新板块样例");
  await createDialog.getByRole("button", { name: "创建板块" }).click();
  await expect(page.getByText("新板块样例", { exact: true })).toBeVisible();

  await page
    .locator(".board-members-toolbar")
    .first()
    .getByRole("button", { name: "添加新群" })
    .click();
  const picker = page.locator("[data-dialog='board-add-group-dialog']");
  await expect(picker).toBeVisible();
  await expect(picker.locator(".board-group-search-results")).toHaveCount(0);
  await picker.getByRole("searchbox", { name: "搜索群组" }).fill("语言");
  await expect(picker.getByRole("option", { name: "添加群组 语言交换角" })).toBeVisible();
});

test("mobile management table keeps title, status and actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "管理端" }).click();
  await expect(page.locator(".admin-table__title").first()).toBeVisible();
  await expect(page.locator(".admin-table__status").first()).toBeVisible();
  await expect(page.locator(".admin-table__tags").first()).toBeHidden();
  await expect(page.locator(".admin-table__kind").first()).toBeHidden();
});

test("header submit uses the public dialog, hides admin-only fields, and confirms locally", async ({
  page,
}) => {
  let businessApiRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/")) businessApiRequests += 1;
  });

  await page.goto("/");
  await page.locator(".proto-header__actions").getByRole("button", { name: "添加新群" }).click();
  const publicDialog = page.locator("[data-dialog='public-submit-dialog']");
  await expect(publicDialog).toBeVisible();
  await expect(publicDialog.getByText("待审核", { exact: true })).toBeVisible();
  await expect(publicDialog.getByText("审核备注")).toHaveCount(0);
  await expect(publicDialog.getByRole("button", { name: "提交群组" })).toBeVisible();
  await publicDialog.locator("input[required]").fill("Playwright 本地提交");
  await publicDialog.getByRole("button", { name: "提交群组" }).click();
  await expect(publicDialog).toHaveCount(0);
  await expect(page.getByRole("status").last()).toContainText("提交成功，等待审核");
  expect(businessApiRequests).toBe(0);
});

test("public submit reuses the edit form and exposes image upload affordances", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".proto-header__actions").getByRole("button", { name: "添加新群" }).click();
  const dialog = page.locator("[data-dialog='public-submit-dialog']");
  await expect(dialog.locator(".admin-edit-form")).toBeVisible();
  await expect(dialog.locator("input[type='file'][aria-label='上传群组头像']")).toHaveCount(1);
  await expect(dialog.getByRole("combobox", { name: "状态" })).toHaveCount(0);
  await expect(dialog.getByText("审核备注")).toHaveCount(0);
  await expect(dialog.getByText("添加加群方式")).toBeVisible();
  await expect(dialog.locator(".proto-select__trigger-icon")).toBeVisible();
});

test("brand navigation clears the public search query", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("searchbox", { name: "搜索群组" }).fill("设计");
  await expect(page.getByRole("searchbox", { name: "搜索群组" })).toHaveValue("设计");
  await page.getByRole("link", { name: "回到公开首页" }).click();
  await expect(page.getByRole("searchbox", { name: "搜索群组" })).toHaveValue("");
});

test("admin submit uses the full edit dialog with status and audit fields", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "管理端" }).click();
  await page.locator(".admin-toolbar").getByRole("button", { name: "添加新群" }).click();
  const adminDialog = page.locator("[data-dialog='admin-create-dialog']");
  await expect(adminDialog).toBeVisible();
  await expect(adminDialog.getByRole("combobox", { name: "状态" })).toBeVisible();
  await expect(adminDialog.getByText("审核备注")).toBeVisible();
  await expect(adminDialog.getByRole("textbox", { name: "添加标签" })).toBeVisible();
  await expect(page.locator("[data-dialog='public-submit-dialog']")).toHaveCount(0);
});
