import { expect, test, type Page } from "@playwright/test";

const WEBP_1X1 = Buffer.from([
  0x52, 0x49, 0x46, 0x46, 0x20, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x4c,
  0x13, 0x00, 0x00, 0x00, 0x2f, 0x00, 0x00, 0x00, 0x00, 0x07, 0x10, 0xfd, 0x8f, 0xfe, 0x07, 0x22,
  0xa2, 0xff, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

async function mockPublicAssets(page: Page) {
  await page.route("https://assets.e2e.invalid/**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/webp",
      body: WEBP_1X1,
    });
  });
}

async function login(page: Page): Promise<string> {
  await page.goto("/admin/login");
  await page.getByLabel("管理员密码").fill("test-admin-password");
  await page.getByRole("button", { name: "登录", exact: true }).click();
  await expect(page).toHaveURL(/\/admin$/);
  const sessionResponse = await page.request.get("/api/v1/admin/session");
  expect(sessionResponse.status()).toBe(200);
  const session = (await sessionResponse.json()) as {
    ok: boolean;
    data: { csrfToken: string };
  };
  expect(session.ok).toBe(true);
  return session.data.csrfToken;
}

async function seedReadyQrGroup(page: Page, csrfToken: string, title: string) {
  const uploadResponse = await page.request.post("/api/v1/admin/assets", {
    headers: { "X-CSRF-Token": csrfToken },
    multipart: {
      file: {
        name: "qr.webp",
        mimeType: "image/webp",
        buffer: WEBP_1X1,
      },
      purpose: "qr_code",
    },
  });
  expect(uploadResponse.status()).toBe(201);
  const uploaded = (await uploadResponse.json()) as {
    data: { id: string; r2Key: string };
  };

  const createResponse = await page.request.post("/api/v1/admin", {
    headers: { "X-CSRF-Token": csrfToken },
    data: {
      title,
      description: "Playwright 已有二维码场景",
      kind: "interest",
      platform: "qq",
      status: "published",
      tags: ["e2e"],
      joinMethods: [{ type: "qr_code", assetId: uploaded.data.id, sortOrder: 0 }],
    },
  });
  expect(createResponse.status()).toBe(201);
  return uploaded.data;
}

test.beforeEach(async ({ page }) => {
  await mockPublicAssets(page);
});

test.afterEach(async ({ page }) => {
  const sessionResponse = await page.request.get("/api/v1/admin/session");
  if (sessionResponse.status() !== 200) return;
  const session = (await sessionResponse.json()) as {
    data: { csrfToken: string };
  };
  const headers = { "X-CSRF-Token": session.data.csrfToken };
  const params = new URLSearchParams({ q: "E2E", limit: "50" });
  for (const status of ["pending", "published", "rejected", "delisted"]) {
    params.append("status", status);
  }
  const activeResponse = await page.request.get(`/api/v1/admin?${params.toString()}`);
  expect(activeResponse.status()).toBe(200);
  const active = (await activeResponse.json()) as {
    data: { items: Array<{ id: string; title: string }> };
  };
  for (const group of active.data.items.filter(({ title }) => title.startsWith("E2E "))) {
    const softDelete = await page.request.delete(`/api/v1/admin/${group.id}`, { headers });
    expect(softDelete.status()).toBe(200);
  }

  const trashResponse = await page.request.get("/api/v1/admin?deleted=true&q=E2E&limit=50");
  expect(trashResponse.status()).toBe(200);
  const trash = (await trashResponse.json()) as {
    data: { items: Array<{ id: string; title: string }> };
  };
  for (const group of trash.data.items.filter(({ title }) => title.startsWith("E2E "))) {
    const permanentDelete = await page.request.delete(`/api/v1/admin/trash/groups/${group.id}`, {
      headers,
    });
    expect(permanentDelete.status()).toBe(200);
  }
});

test("管理员打开已有 QR 群组时抽屉显示远端二维码", async ({ page }, testInfo) => {
  const csrfToken = await login(page);
  const title = `E2E 已有二维码 ${Date.now().toString()}`;
  const uploaded = await seedReadyQrGroup(page, csrfToken, title);

  await page.goto("/admin");
  const row = page.getByRole("row").filter({ hasText: title });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "编辑" }).click();

  const drawer = page.locator("[data-drawer]");
  await expect(drawer).toBeVisible();
  if (testInfo.project.name === "chromium-mobile") {
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox?.width).toBe(page.viewportSize()?.width);
  }
  const preview = drawer.getByRole("img", { name: "二维码预览" });
  await expect(preview).toBeVisible();
  await expect(preview).toHaveAttribute("src", `https://assets.e2e.invalid/${uploaded.r2Key}`);
});

test("管理员上传 QR、保存后可在主页打开二维码", async ({ page }) => {
  await login(page);
  const title = `E2E 新二维码 ${Date.now().toString()}`;
  await page.goto("/admin");
  await page.getByRole("button", { name: "新建群聊" }).click();

  const drawer = page.locator("[data-drawer]");
  await drawer.getByLabel("标题").fill(title);
  await drawer.getByLabel("简介").fill("Playwright 上传保存并公开查看");
  await drawer.getByLabel("业务状态").selectOption("published");
  await drawer.getByPlaceholder("输入群号").fill("987654");
  await drawer.locator("select").last().selectOption("qr_code");
  await drawer.locator('input[type="file"]').setInputFiles({
    name: "qr.webp",
    mimeType: "image/webp",
    buffer: WEBP_1X1,
  });
  await expect(drawer.getByText("已上传")).toBeVisible();

  await drawer.getByRole("button", { name: "保存", exact: true }).click();
  await expect(drawer).toBeHidden();
  await expect(page.getByRole("row").filter({ hasText: title })).toBeVisible();

  await page.goto("/");
  const card = page.locator("article").filter({ hasText: title });
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "二维码" }).click();
  const dialog = page.getByRole("dialog", { name: `${title} 的二维码` });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("img", { name: `${title} 二维码` })).toBeVisible();
});
