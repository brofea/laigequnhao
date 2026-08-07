import { expect, test, type Page } from "@playwright/test";

const API = "http://localhost:8788/api/v1";

let cachedAuth: { cookie: string; csrf: string } | null = null;

async function loginViaApi(page: Page): Promise<{ cookie: string; csrf: string }> {
  if (cachedAuth) return cachedAuth;
  const response = await page.request.post(`${API}/admin/session`, {
    data: { password: process.env["E2E_ADMIN_PASSWORD"] ?? "test-admin-password" },
  });
  expect(response.status()).toBe(200);
  const cookie = (response.headers()["set-cookie"] ?? "").match(/session=([^;]+)/)?.[1] ?? "";
  const json = (await response.json()) as { data: { csrfToken: string } };
  cachedAuth = { cookie, csrf: json.data.csrfToken };
  return cachedAuth;
}

async function seedBrowserSession(page: Page, auth: { cookie: string; csrf: string }) {
  await page
    .context()
    .addCookies([{ name: "session", value: auth.cookie, url: "http://localhost:5173" }]);
}

async function api(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  auth?: { cookie: string; csrf: string },
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {};
  if (auth) {
    headers["Cookie"] = `session=${auth.cookie}`;
    headers["X-CSRF-Token"] = auth.csrf;
  }
  const response = await page.request.fetch(`${API}${path}`, { method, headers, data: body });
  const text = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  return { status: response.status(), data };
}

async function seedPublishedGroup(
  page: Page,
  auth: { cookie: string; csrf: string },
  title: string,
  status = "published",
): Promise<string> {
  const { status: s, data } = await api(
    page,
    "POST",
    "/admin",
    {
      title,
      description: "管理流程 E2E 种子",
      kind: "interest",
      platform: "QQ",
      status,
      tags: ["管理标签"],
      joinMethods: [{ type: "group_number", value: "100001", sortOrder: 0 }],
    },
    auth,
  );
  expect(s).toBe(201);
  return (data as { data: { id: string } }).data.id;
}

async function gotoAdmin(page: Page, auth: { cookie: string; csrf: string }) {
  await seedBrowserSession(page, auth);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "管理工作台" })).toBeVisible();
}

test("筛选和排序变化回到第一页并同步 URL", async ({ page }) => {
  const auth = await loginViaApi(page);
  for (let index = 0; index < 55; index++) {
    await seedPublishedGroup(page, auth, `筛选回页群-${String(index).padStart(2, "0")}`);
  }
  await gotoAdmin(page, auth);

  await expect(page.getByRole("searchbox", { name: "管理端搜索" })).toBeVisible();
  await expect(page.locator(".admin-toolbar .app-field__spinner")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "状态" }).locator(".app-field__spinner"),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page).toHaveURL(/page=2/);

  // 修改状态筛选 → 回第一页
  await page.getByLabel("状态").click();
  await page.getByRole("option", { name: "已发布" }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page.locator(".admin-summary")).toContainText("第 1 /");
  await expect(page.locator(".admin-toolbar .app-field__spinner")).toHaveCount(0);
  await expect(
    page.getByRole("combobox", { name: "状态" }).locator(".app-field__spinner"),
  ).toHaveCount(0);

  // 修改排序 → 回第一页
  await page.getByRole("button", { name: "标题" }).first().click();
  await expect(page).toHaveURL(/page=1/);
});

test("URL 状态刷新后恢复页码和筛选", async ({ page }) => {
  const auth = await loginViaApi(page);
  for (let index = 0; index < 55; index++) {
    await seedPublishedGroup(page, auth, `URL恢复群-${String(index).padStart(2, "0")}`);
  }
  await gotoAdmin(page, auth);

  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page).toHaveURL(/page=2/);
  await page.reload();
  await expect(page.locator(".admin-summary")).toContainText("第 2 /");
});

test("删除当前页最后一条自动退到上一页", async ({ page }) => {
  const auth = await loginViaApi(page);
  const prefix = `退页群-${String(Date.now())}`;
  for (let index = 0; index < 51; index++) {
    await seedPublishedGroup(page, auth, `${prefix}-${String(index).padStart(2, "0")}`);
  }
  // 搜索限定本测试数据（共享库中还有其他测试群组），使总数恰好 51
  await seedBrowserSession(page, auth);
  await page.goto(`/admin?q=${encodeURIComponent(prefix)}`);
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(50);

  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(1);

  // 删除第二页最后一条（也是最后一条）：窄屏下用"更多操作"→编辑抽屉删除
  const row = page.locator(".admin-table tbody tr");
  const directDelete = row.getByRole("button", { name: "删除" });
  if (await directDelete.isVisible()) {
    await directDelete.click();
  } else {
    await row.getByRole("button", { name: "更多操作" }).click();
    const dialog = page.locator('[data-dialog="admin-edit-dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "删除群组" }).click();
  }
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(50);
  await expect(page.locator(".admin-summary")).toContainText("第 1 /");
});

test("回收站 UI：恢复与永久删除按钮可用", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `回收站UI群-${String(Date.now())}`;
  const groupId = await seedPublishedGroup(page, auth, title);
  await seedBrowserSession(page, auth);
  await page.goto(`/admin?q=${encodeURIComponent(title)}`);
  await expect(page.locator(".admin-table tbody tr").first()).toBeVisible();

  // 软删除进入回收站
  const row = page.locator(".admin-table tbody tr").filter({ hasText: title });
  const directDelete = row.getByRole("button", { name: "删除" });
  if (await directDelete.isVisible()) {
    await directDelete.click();
  } else {
    await row.getByRole("button", { name: "更多操作" }).click();
    const dialog = page.locator('[data-dialog="admin-edit-dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "删除群组" }).click();
  }
  await expect(row).toHaveCount(0);

  // 回收站视图出现"恢复"和"永久删除"按钮
  await page.getByRole("button", { name: "回收站" }).click();
  await expect(page).toHaveURL(/deleted=true/);
  const trashRow = page.locator(".admin-table tbody tr").filter({ hasText: title });
  await expect(trashRow).toBeVisible();
  const restoreButton = trashRow.getByRole("button", { name: /恢复/ });
  const purgeButton = trashRow.getByRole("button", { name: "永久删除" });
  await expect(restoreButton).toBeVisible();
  await expect(purgeButton).toBeVisible();

  // 恢复 → 回到正常列表且群组存在
  await restoreButton.click();
  await expect(trashRow).toHaveCount(0);
  await page.getByRole("button", { name: "回收站" }).click();
  await expect(page.locator(".admin-table tbody tr").filter({ hasText: title })).toBeVisible();

  // 再次软删 → 永久删除（二次确认）→ 公开详情 404
  const row2 = page.locator(".admin-table tbody tr").filter({ hasText: title });
  const directDelete2 = row2.getByRole("button", { name: "删除" });
  if (await directDelete2.isVisible()) {
    await directDelete2.click();
  } else {
    await row2.getByRole("button", { name: "更多操作" }).click();
    const dialog = page.locator('[data-dialog="admin-edit-dialog"]');
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "删除群组" }).click();
  }
  await page.getByRole("button", { name: "回收站" }).click();
  const trashRow2 = page.locator(".admin-table tbody tr").filter({ hasText: title });
  await expect(trashRow2).toBeVisible();
  await trashRow2.getByRole("button", { name: "永久删除" }).click();
  const purgeDialog = page.locator('[data-dialog="purge-confirm-dialog"]');
  await expect(purgeDialog).toBeVisible();
  let releasePurge: (() => void) | undefined;
  const purgeGate = new Promise<void>((resolve) => {
    releasePurge = resolve;
  });
  await page.route(`${API}/admin/trash/groups/${groupId}`, async (route) => {
    await purgeGate;
    await route.continue();
  });
  await purgeDialog.getByRole("button", { name: "确认永久删除" }).click();
  await expect(purgeDialog).toBeVisible();
  await expect(purgeDialog).toHaveAttribute("aria-busy", "true");
  await expect(purgeDialog.getByRole("button", { name: "确认永久删除" })).toBeDisabled();
  releasePurge?.();
  await expect(trashRow2).toHaveCount(0);

  const { status: detailStatus } = await api(page, "GET", `/groups/${groupId}`);
  expect(detailStatus).toBe(404);
  const { status: adminStatus } = await api(page, "GET", `/admin/${groupId}`, undefined, auth);
  expect(adminStatus).toBe(404);
});

test("版本冲突以 Toast 警告呈现且不覆盖", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `版本冲突群-${String(Date.now())}`;
  const groupId = await seedPublishedGroup(page, auth, title);
  await gotoAdmin(page, auth);

  // 另一会话修改（version 递增）
  const { data: getData } = await api(page, "GET", `/admin/${groupId}`);
  const version = (getData as { data: { version: number } }).data.version;
  const { status } = await api(
    page,
    "PATCH",
    `/admin/${groupId}`,
    { description: "外部修改", version },
    auth,
  );
  expect(status).toBe(200);

  const row = page.locator(".admin-table tbody tr").filter({ hasText: title });
  await row
    .getByRole("button", { name: /编辑|更多操作/ })
    .first()
    .click();
  const dialog = page.locator('[data-dialog="admin-edit-dialog"]');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("群组标题").fill(`${title}-本地`);
  await dialog.getByRole("button", { name: "保存修改" }).click();

  await expect(page.getByText("群组已被其他会话修改，请刷新后重试")).toBeVisible();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("群组标题")).toHaveValue(`${title}-本地`);
  await expect(dialog.getByRole("button", { name: "保存修改" })).toBeEnabled();
  const { status: verifyStatus, data } = await api(page, "GET", `/admin/${groupId}`);
  expect(verifyStatus).toBe(200);
  expect((data as { data: { title: string } }).data.title).toBe(title);
});

test("响应式列隐藏顺序：标签先隐藏，标题/状态/操作保留", async ({ page }) => {
  const auth = await loginViaApi(page);
  await seedPublishedGroup(page, auth, `响应式列群-${String(Date.now())}`);
  await page.setViewportSize({ width: 900, height: 800 });
  await gotoAdmin(page, auth);

  const table = page.locator(".admin-table");
  const tagsVisible = await table.locator(".admin-table__tags").first().isVisible();
  // 900px 已触发隐藏（标签列应隐藏），标题/状态/操作列必须可见
  await expect(table.locator(".admin-table__title").first()).toBeVisible();
  await expect(table.locator(".admin-table__status").first()).toBeVisible();
  await expect(table.locator(".table-link-button").first()).toBeVisible();
  // 记录可见性（窄屏下表格列使用 CSS 隐藏）
  const hiddenTags = await table
    .locator(".admin-table__tags")
    .first()
    .evaluate((el) => el.getBoundingClientRect().width === 0);
  expect(hiddenTags || !tagsVisible).toBe(true);
});

test("板块启停影响公开端可见性", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `启停板块群-${String(Date.now())}`;
  const groupId = await seedPublishedGroup(page, auth, title);
  const { status, data } = await api(
    page,
    "POST",
    "/admin/boards",
    { title: `启停板块-${String(Date.now())}` },
    auth,
  );
  expect(status).toBe(201);
  const boards = (data as { data: { boards: Array<{ id: string; title: string }> } }).data.boards;
  const lastBoard = boards[boards.length - 1];
  if (!lastBoard) throw new Error("board creation returned no boards");
  const boardId = lastBoard.id;
  const boardTitle = lastBoard.title;
  await api(page, "POST", `/admin/boards/${boardId}/members`, { groupId }, auth);

  await gotoAdmin(page, auth);
  await page.getByRole("button", { name: "板块管理" }).click();
  const panel = page.locator(".board-panel").filter({ hasText: boardTitle });
  // 板块默认只展开第一个，需先展开目标板块
  await panel.locator(".board-panel__toggle").click();
  await expect(panel.getByText(title)).toBeVisible();

  // 关闭板块（板块 header 的编辑按钮，与成员行"编辑"区分）
  await panel
    .locator(".board-panel__actions")
    .getByRole("button", { name: `编辑 ${boardTitle}` })
    .click();
  const boardDialog = page.locator('[data-dialog="board-edit-dialog"]');
  await boardDialog.getByLabel("状态").click();
  await boardDialog.getByRole("option", { name: "未启用" }).click();
  await boardDialog.getByRole("button", { name: "保存板块" }).click();
  await expect(panel.locator(".board-panel__header")).toContainText("未启用");

  // 公开端不再显示该板块标题
  await page.goto("/");
  await expect(
    page.locator(`[aria-labelledby^="board-"]`).filter({ hasText: boardTitle }),
  ).toHaveCount(0);
  // 管理端仍可编辑（未启用板块保留成员）
  await gotoAdmin(page, auth);
  await page.getByRole("button", { name: "板块管理" }).click();
  const panel2 = page.locator(".board-panel").filter({ hasText: boardTitle });
  await panel2.locator(".board-panel__toggle").click();
  await expect(panel2.getByText(title)).toBeVisible();
});

test("板块数量为零时公开端不显示自定义板块区域", async ({ page }) => {
  const auth = await loginViaApi(page);
  // 删除全部板块（含默认自定板块）
  await gotoAdmin(page, auth);
  await page.getByRole("button", { name: "板块管理" }).click();
  // 等待板块异步加载完成：迁移默认板块必存在，未渲染前 count() 为 0 会让删除循环空转
  await expect(page.locator(".board-panel").first()).toBeVisible();
  let guard = 0;
  while (guard < 50) {
    guard += 1;
    const panels = page.locator(".board-panel");
    const count = await panels.count();
    if (count === 0) break;
    // 目标面板展开后才显示删除确认；默认只展开第一个
    const firstPanel = panels.first();
    const toggle = firstPanel.locator(".board-panel__toggle");
    if ((await toggle.getAttribute("aria-expanded")) !== "true") {
      await toggle.click();
    }
    await firstPanel.getByRole("button", { name: /删除/ }).click();
    const confirm = page.locator(".delete-confirm");
    if (await confirm.isVisible()) {
      await confirm.getByRole("button", { name: /确认删除/ }).click();
      await expect(panels).toHaveCount(count - 1);
    } else {
      break;
    }
  }
  await expect(page.locator(".board-panel")).toHaveCount(0);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "发现新群" })).toBeVisible();
  await expect(page.locator("section[aria-labelledby^='board-']")).toHaveCount(0);

  // 现场恢复：重建默认板块，避免污染共享测试库（后续测试依赖"自定板块"）
  const { status } = await api(page, "POST", "/admin/boards", { title: "自定板块" }, auth);
  expect(status).toBe(201);
});
