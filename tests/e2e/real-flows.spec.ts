import { expect, test, type Page } from "@playwright/test";

const API = "http://localhost:8788/api/v1";

// 全文件共享一次 API 登录，避免触发登录限流（LOGIN_MAX_ATTEMPTS=10/5min）
let cachedAuth: { cookie: string; csrf: string } | null = null;

async function loginViaApi(page: Page): Promise<{
  cookie: string;
  csrf: string;
}> {
  if (cachedAuth) return cachedAuth;
  const response = await page.request.post(`${API}/admin/session`, {
    data: { password: process.env["E2E_ADMIN_PASSWORD"] ?? "test-admin-password" },
  });
  expect(response.status()).toBe(200);
  const setCookie = response.headers()["set-cookie"] ?? "";
  const cookie = setCookie.match(/session=([^;]+)/)?.[1] ?? "";
  const json = (await response.json()) as { data: { csrfToken: string } };
  cachedAuth = { cookie, csrf: json.data.csrfToken };
  return cachedAuth;
}

/** 把 API 登录会话 cookie 注入浏览器上下文（供 goto /admin 使用） */
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
  const response = await page.request.fetch(`${API}${path}`, {
    method,
    headers,
    data: body,
  });
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
  tags: string[] = [],
): Promise<string> {
  const { status, data } = await api(
    page,
    "POST",
    "/admin",
    {
      title,
      description: "真实数据 E2E 种子",
      kind: "interest",
      platform: "QQ",
      status: "published",
      tags,
      joinMethods: [{ type: "group_number", value: "100001", sortOrder: 0 }],
    },
    auth,
  );
  expect(status).toBe(201);
  return (data as { data: { id: string } }).data.id;
}

async function seedBoard(
  page: Page,
  auth: { cookie: string; csrf: string },
  title: string,
): Promise<string> {
  const { status, data } = await api(page, "POST", "/admin/boards", { title }, auth);
  expect(status).toBe(201);
  const boards = (data as { data: { boards: Array<{ id: string; title: string }> } }).data.boards;
  return boards.find((board) => board.title === title)?.id ?? "";
}

async function addBoardMember(
  page: Page,
  auth: { cookie: string; csrf: string },
  boardId: string,
  groupId: string,
): Promise<void> {
  const { status } = await api(page, "POST", `/admin/boards/${boardId}/members`, { groupId }, auth);
  expect(status).toBe(201);
}

test("public home renders real discover, tags, boards and groups", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `公开首页真实群-${String(Date.now())}`;
  const groupId = await seedPublishedGroup(page, auth, title, ["冒烟标签"]);
  const boardTitle = `冒烟公开板块-${String(Date.now())}`;
  const boardId = await seedBoard(page, auth, boardTitle);
  await addBoardMember(page, auth, boardId, groupId);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "找一个值得加入的群" })).toBeVisible();

  // 发现新群：最近发布排在首位
  await expect(page.getByRole("heading", { name: "发现新群" })).toBeVisible();
  await expect(page.locator(".carousel-slide").first()).toContainText(title);

  // 所有标签：真实聚合计数
  await expect(page.getByRole("heading", { name: "所有标签" })).toBeVisible();
  // 计数 ≥1（跨 project 共享数据库时标签可能被多次种子）
  await expect(page.locator(".tag-card", { hasText: "冒烟标签" })).toContainText("个群");

  // 公开板块：成员真实展示
  await expect(page.getByRole("heading", { name: boardTitle })).toBeVisible();

  // 所有群组网格：真实卡片渲染（跨 project 共享数据库时新群可能在目录第 2 页）
  await expect(page.getByRole("heading", { name: "所有群组" })).toBeVisible();
  await expect(page.locator(".group-grid .group-card").first()).toBeVisible();
});

test("deep link opens the real group detail and clears only group on close", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `深链群-${String(Date.now())}`;
  const groupId = await seedPublishedGroup(page, auth, title);

  await page.goto(`/?q=深链&group=${groupId}`);
  const dialog = page.locator('[data-dialog="group-detail-dialog"]');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(title);

  // 关闭只移除 group，保留 q（URL 为百分号编码）
  await dialog.getByRole("button", { name: "关闭弹窗" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("group")).toBeNull();
  expect(new URL(page.url()).searchParams.get("q")).toBe("深链");
});

test("admin pagination uses real totals and navigates pages", async ({ page }) => {
  const auth = await loginViaApi(page);
  for (let index = 0; index < 55; index++) {
    await seedPublishedGroup(page, auth, `分页真实-${String(index).padStart(2, "0")}`);
  }

  await seedBrowserSession(page, auth);
  await page.goto("/admin");
  await expect(page.locator(".admin-summary")).toContainText(/第 1 \//);
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(50);

  // 下一页
  await page.getByRole("button", { name: "下一页" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.locator(".admin-summary")).toContainText(/第 2 \//);
  const page2Rows = await page.locator(".admin-table tbody tr").count();
  expect(page2Rows).toBeGreaterThan(0);
  expect(page2Rows).toBeLessThanOrEqual(50);

  // 上一页返回第一页
  await page.getByRole("button", { name: "上一页" }).click();
  await expect(page).toHaveURL(/page=1/);
  await expect(page.locator(".admin-table tbody tr")).toHaveCount(50);
});

test("board management adds a real member and keeps it in the public board", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `板块成员真实群-${String(Date.now())}`;
  await seedPublishedGroup(page, auth, title);
  await seedBrowserSession(page, auth);

  await page.goto("/admin");
  await page.getByRole("button", { name: "板块管理" }).click();
  await expect(page.getByRole("heading", { name: "板块排序与成员预览" })).toBeVisible();

  // 默认自定板块 → 添加新群 → 选择真实群组
  const defaultBoard = page.locator(".board-panel").filter({ hasText: "自定板块" });
  await defaultBoard.getByRole("button", { name: "添加新群" }).click();
  const addDialog = page.locator('[data-dialog="board-add-group-dialog"]');
  await expect(addDialog).toBeVisible();
  await addDialog.getByLabel("搜索群组").fill(title);
  await addDialog.getByRole("option", { name: new RegExp(title) }).click();

  // 成员行出现（跨 project 共享数据库时板块可能有多个成员，只断言行存在）
  await expect(defaultBoard.getByRole("row", { name: new RegExp(title) })).toBeVisible();
  await expect(defaultBoard).toContainText(/个群组/);

  // 公开首页板块显示该成员（限定板块区域，避免发现新群 Carousel 干扰）
  await page.goto("/");
  const boardSection = page.locator("section").filter({ hasText: "自定板块" }).first();
  await expect(boardSection).toBeVisible();
  await expect(boardSection.locator(".carousel-slide").filter({ hasText: title })).toHaveCount(1);
});

test("admin group edit persists through the real API", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `编辑真实群-${String(Date.now())}`;
  const groupId = await seedPublishedGroup(page, auth, title);
  await seedBrowserSession(page, auth);

  await page.goto("/admin");

  // 在表格中找到该群组并打开编辑
  const row = page.locator(".admin-table tbody tr").filter({ hasText: title });
  await expect(row.first()).toBeVisible();
  // 窄屏隐藏"编辑"按钮时使用"更多操作"（两者都打开编辑弹窗）
  const openBtn = row
    .first()
    .getByRole("button", { name: /编辑|更多操作/ })
    .first();
  await openBtn.click();

  const dialog = page.locator('[data-dialog="admin-edit-dialog"]');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("群组标题").fill(`${title}-改`);
  await dialog.getByRole("button", { name: "保存修改" }).click();

  // 保存成功后列表刷新显示新标题（服务端持久化）
  await expect(
    page
      .locator(".admin-table tbody tr")
      .filter({ hasText: `${title}-改` })
      .first(),
  ).toBeVisible();
  const { status, data } = await api(page, "GET", `/admin/${groupId}`, undefined, auth);
  expect(status).toBe(200);
  expect((data as { data: { title: string } }).data.title).toBe(`${title}-改`);
});
