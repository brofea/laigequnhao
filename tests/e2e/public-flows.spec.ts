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
  tags: string[] = [],
  joinMethods: Array<{ type: "group_number"; value: string; sortOrder: number } | { type: "url"; url: string; sortOrder: number }> = [
    { type: "group_number", value: "100001", sortOrder: 0 },
  ],
): Promise<string> {
  const { status, data } = await api(
    page,
    "POST",
    "/admin",
    {
      title,
      description: "公开流程 E2E 种子",
      kind: "interest",
      platform: "QQ",
      status: "published",
      tags,
      joinMethods,
    },
    auth,
  );
  expect(status).toBe(201);
  return (data as { data: { id: string } }).data.id;
}

test("清空搜索恢复默认首页，搜索框位置稳定", async ({ page }) => {
  const auth = await loginViaApi(page);
  await seedPublishedGroup(page, auth, `清空恢复群-${String(Date.now())}`);

  const searchbox = page.getByRole("searchbox", { name: "搜索群组" });
  await page.goto("/");
  const homePosition = await searchbox.boundingBox();

  await searchbox.fill("清空恢复");
  await expect(page.getByRole("heading", { name: /搜索“清空恢复”/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: "发现新群" })).toHaveCount(0);

  // 搜索框纵向位置不因状态切换跳动（首页/搜索状态均在 hero 内）
  const searchModePosition = await searchbox.boundingBox();
  if (homePosition && searchModePosition) {
    expect(Math.abs(searchModePosition.y - homePosition.y)).toBeLessThanOrEqual(2);
  }

  await page.getByRole("button", { name: "清除搜索" }).click();
  await expect(page.getByRole("heading", { name: "发现新群" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /搜索/ })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("q")).toBeNull();
});

test("标签点击替换搜索词并进入搜索结果状态", async ({ page }) => {
  const auth = await loginViaApi(page);
  await seedPublishedGroup(page, auth, `标签替换群-${String(Date.now())}`, ["T06唯一标签"]);

  await page.goto("/");
  const tagCard = page.locator(".tag-card", { hasText: "T06唯一标签" });
  await expect(tagCard).toBeVisible();
  await tagCard.click();

  await expect(page.getByRole("heading", { name: /搜索“T06唯一标签”/ })).toBeVisible();
  // URL 中的搜索词经 normalizeSearchQuery 归一化（ASCII 转小写）
  expect(new URL(page.url()).searchParams.get("q")).toBe("t06唯一标签");
  await expect(page.getByRole("searchbox", { name: "搜索群组" })).toHaveValue("T06唯一标签");
});

test("搜索无结果状态显示关键词和提交入口", async ({ page }) => {
  await page.goto("/");
  const keyword = `绝无匹配词${String(Date.now())}`;
  await page.getByRole("searchbox", { name: "搜索群组" }).fill(keyword);
  await expect(page.getByRole("heading", { name: /搜索“/ })).toBeVisible();
  await expect(page.getByText("还没有匹配的群组")).toBeVisible();
  await expect(page.getByRole("button", { name: "清除筛选" })).toBeVisible();
});

test("深链访问下架群组不泄露信息", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `下架隔离群-${String(Date.now())}`;
  const groupId = await seedPublishedGroup(page, auth, title);

  const { status: getStatus, data: getData } = await api(page, "GET", `/admin/${groupId}`, undefined, auth);
  expect(getStatus).toBe(200);
  const version = (getData as { data: { version: number } }).data.version;
  const { status: downStatus } = await api(
    page,
    "PATCH",
    `/admin/${groupId}`,
    { status: "delisted", version },
    auth,
  );
  expect(downStatus).toBe(200);

  await page.goto(`/?group=${groupId}`);
  const dialog = page.locator('[data-dialog="group-detail-dialog"]');
  await expect(dialog).toHaveCount(0);
  // 非敏感错误：不渲染标题，仅通用 toast 提示
  await expect(page.getByText(title)).toHaveCount(0);
  await expect(page.getByText("群组不存在或不可公开")).toBeVisible();
  // 无效 group 参数可被清理
  await expect.poll(() => new URL(page.url()).searchParams.get("group")).toBeNull();
});

test("点赞不打开详情弹窗", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `点赞独立群-${String(Date.now())}`;
  await seedPublishedGroup(page, auth, title);

  await page.goto("/");
  const card = page.locator(".group-card", { hasText: title }).first();
  await expect(card).toBeVisible();
  const likeButton = card.locator(".like-button").first();
  await expect(likeButton).toBeVisible();
  const pressedBefore = await likeButton.getAttribute("aria-pressed");
  await likeButton.click();
  await expect(page.locator('[data-dialog="group-detail-dialog"]')).toHaveCount(0);
  await expect(likeButton).toHaveAttribute("aria-pressed", pressedBefore === "true" ? "false" : "true");
});

test("多个加群方式按固定顺序展示：群号→邀请链接→二维码", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `加群顺序群-${String(Date.now())}`;
  await seedPublishedGroup(page, auth, title, [], [
    { type: "group_number", value: "100099", sortOrder: 0 },
    { type: "url", url: "https://example.com/first", sortOrder: 1 },
  ]);

  await page.goto("/");
  const card = page.locator(".group-card", { hasText: title }).first();
  await card.locator(".group-card__body").click();
  const dialog = page.locator('[data-dialog="group-detail-dialog"]');
  await expect(dialog).toBeVisible();
  const joinLabels = dialog.locator(".join-method strong");
  await expect(joinLabels.nth(0)).toHaveText("群号");
  await expect(joinLabels.nth(1)).toHaveText("邀请链接");
});

test("主题三态循环切换且刷新后保留", async ({ page }) => {
  await page.goto("/");
  const control = page.locator(".theme-control");
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);

  // 每次点击前进一档（system → light → dark → system）
  await control.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await control.click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // 刷新后保留 dark 偏好
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // 回到 system：data-theme 跟随系统
  await control.click();
  const preference = await page.evaluate(() => localStorage.getItem("lgqh.theme-preference.v1"));
  expect(preference).toBe('"system"');
  await page.evaluate(() => {
    localStorage.removeItem("lgqh.theme-preference.v1");
  });
});

test("手机端 Carousel 至少同时显示两张卡片", async ({ page }) => {
  const auth = await loginViaApi(page);
  for (let index = 0; index < 4; index++) {
    await seedPublishedGroup(page, auth, `双卡可见群-${String(Date.now())}-${String(index)}`);
  }
  await page.goto("/");
  const track = page.locator("section[aria-labelledby='discover-title'] .carousel-track");
  await expect(track).toBeVisible();
  const trackBox = await track.boundingBox();
  const slideBox = await track.locator(".carousel-slide").first().boundingBox();
  expect(trackBox).not.toBeNull();
  expect(slideBox).not.toBeNull();
  if (trackBox && slideBox) {
    expect(slideBox.width).toBeLessThanOrEqual(trackBox.width / 2 + 1);
  }
});
