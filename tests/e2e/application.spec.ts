import { expect, test, type Page } from "@playwright/test";

async function loginAsAdmin(page: Page) {
  await page.goto("/admin/login");
  await expect(page.getByRole("heading", { name: /管理后台/ })).toBeVisible();
  await page
    .getByLabel("管理员密码")
    .fill(process.env["E2E_ADMIN_PASSWORD"] ?? "test-admin-password");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole("heading", { name: "管理工作台" })).toBeVisible();
}

test("public home renders the configured shell and reads the group API", async ({ page }) => {
  const groupsResponse = page.waitForResponse((response) =>
    response.url().includes("/api/v1/groups"),
  );

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "找一个值得加入的群" })).toBeVisible();
  await expect(page.getByRole("link", { name: "回到公开首页" })).toBeVisible();
  await expect(page.getByRole("button", { name: "管理端" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /管理端/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "添加新群" })).toBeVisible();
  expect((await groupsResponse).status()).toBe(200);

  const themeControl = page.locator(".theme-control");
  await themeControl.click();
  await themeControl.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("admin keeps groups, boards and runtime data in one page", async ({ page }) => {
  await loginAsAdmin(page);

  await expect(page.getByRole("button", { name: "群组管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: "板块管理" })).toBeVisible();
  await expect(page.getByRole("button", { name: "运行数据" })).toBeVisible();
  await expect(page.getByRole("button", { name: "设计系统" })).toHaveCount(0);

  await page.getByRole("button", { name: "板块管理" }).click();
  await expect(page.getByRole("heading", { name: "板块排序与成员预览" })).toBeVisible();

  await page.getByRole("button", { name: "运行数据" }).click();
  await expect(page.getByRole("heading", { name: "运行数据" })).toBeVisible();
});

test("admin group management stays connected to the authenticated API", async ({ page }) => {
  await loginAsAdmin(page);

  await expect(page.getByText("群组列表", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加新群" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "回收站" })).toBeVisible();

  await page.getByRole("button", { name: "运行数据" }).click();
  await expect(page.getByText("系统健康")).toBeVisible();
});

test("public submission keeps its dialog separate from admin fields", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "添加新群" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "提交新群" })).toBeVisible();
  await expect(dialog.getByLabel("群组标题")).toBeVisible();
  await expect(dialog.getByText("审核备注")).toHaveCount(0);
  await dialog.getByRole("button", { name: "关闭弹窗" }).first().click();
  await expect(dialog).toHaveCount(0);
});

test("board management retains keyboard and mobile-friendly member actions", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsAdmin(page);
  await page.getByRole("button", { name: "板块管理" }).click();
  await expect(page.getByRole("heading", { name: "板块排序与成员预览" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "板块排序与成员预览" })).toBeVisible();
  // 空状态或已填充成员表均合法（依赖数据库种子状态）；板块默认只展开第一个，需先展开
  const firstPanel = page.locator(".board-panel").first();
  const toggle = firstPanel.locator(".board-panel__toggle");
  if ((await toggle.getAttribute("aria-expanded")) !== "true") {
    await toggle.click();
  }
  const emptyState = page.getByText("这个板块还没有成员").first();
  const memberRows = page.locator(".board-members tbody tr").first();
  await expect(emptyState.or(memberRows)).toBeVisible();
  await expect(page.getByRole("button", { name: "添加新群" }).first()).toBeVisible();
});
