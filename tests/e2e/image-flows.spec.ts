import { expect, test as base, type Page } from "@playwright/test";
import sharp from "sharp";
import {
  assertLogoPng,
  assertPreviewPng,
  assertQrJpeg,
  assertPreviewJpeg,
  inspectPng,
  readImagePreview,
} from "./fixtures/image-assertions";
import {
  createImageFixtures,
  QR_EXPECTED_VALUE,
  type ImageFixtures,
} from "./fixtures/image-fixtures";

const API = "http://localhost:8788/api/v1";
const ADMIN_PASSWORD = process.env["E2E_ADMIN_PASSWORD"] ?? "test-admin-password";

type Auth = { cookie: string; csrf: string };
type ApiResult = { status: number; data: unknown };

const test = base.extend<{ images: ImageFixtures }>({
  images: async ({ browserName: _browserName }, use) => {
    await use(await createImageFixtures());
  },
});

async function loginViaApi(page: Page): Promise<Auth> {
  const response = await page.request.post(`${API}/admin/session`, {
    data: { password: ADMIN_PASSWORD },
  });
  expect(response.status()).toBe(200);
  const cookie = (response.headers()["set-cookie"] ?? "").match(/session=([^;]+)/)?.[1] ?? "";
  const json = (await response.json()) as { data: { csrfToken: string } };
  expect(cookie).not.toBe("");
  return { cookie, csrf: json.data.csrfToken };
}

async function seedGroup(page: Page, auth: Auth, title: string): Promise<string> {
  const result = await api(
    page,
    "POST",
    "/admin",
    {
      title,
      description: "图片跨浏览器 E2E 测试群组",
      kind: "interest",
      platform: "QQ",
      status: "published",
      tags: ["图片测试"],
      joinMethods: [{ type: "group_number", value: "100001", sortOrder: 0 }],
    },
    auth,
  );
  expect(result.status).toBe(201);
  return (result.data as { data: { id: string } }).data.id;
}

async function api(
  page: Page,
  method: string,
  path: string,
  body?: unknown,
  auth?: Auth,
): Promise<ApiResult> {
  const headers: Record<string, string> = {};
  if (auth) {
    headers["Cookie"] = `session=${auth.cookie}`;
    headers["X-CSRF-Token"] = auth.csrf;
  }
  const response = await page.request.fetch(`${API}${path}`, { method, headers, data: body });
  const text = await response.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    // 保留非 JSON 响应，状态码断言会给出更直接的诊断。
  }
  return { status: response.status(), data };
}

async function openAdmin(page: Page, auth: Auth) {
  await page
    .context()
    .addCookies([{ name: "session", value: auth.cookie, url: "http://localhost:5173" }]);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "管理工作台" })).toBeVisible();
}

async function openEditorByTitle(page: Page, title: string) {
  const row = page.locator(".admin-table tbody tr").filter({ hasText: title });
  await expect(row.first()).toBeVisible();
  await row
    .first()
    .getByRole("button", { name: /编辑|更多操作/ })
    .first()
    .click();
  const dialog = page.locator('[data-dialog="admin-edit-dialog"]');
  await expect(dialog).toBeVisible();
  return dialog;
}

async function readSavedGroup(page: Page, auth: Auth, groupId: string) {
  const result = await api(page, "GET", `/admin/${groupId}`, undefined, auth);
  expect(result.status).toBe(200);
  return (result.data as { data: Record<string, unknown> }).data;
}

async function fetchAsset(page: Page, publicUrl: string) {
  const response = await page.request.get(new URL(publicUrl, page.url()).toString());
  expect(response.status()).toBe(200);
  const contentType = response.headers()["content-type"];
  expect(["image/png", "image/jpeg"]).toContain(contentType);
  const bytes = await response.body();
  const info =
    contentType === "image/jpeg"
      ? await sharp(bytes).metadata()
      : await inspectPng(bytes).then((value) => value.metadata);
  expect(info.format).toMatch(/png|jpeg/);
  expect(bytes.byteLength).toBeGreaterThan(0);
  return { bytes, info };
}

test.describe("管理端图片上传跨浏览器流程", () => {
  test("头像经过浏览器 PNG 压缩并在保存后保留 alpha", async ({ page, images }) => {
    const auth = await loginViaApi(page);
    const title = `三引擎头像-${String(Date.now())}`;
    const groupId = await seedGroup(page, auth, title);
    await openAdmin(page, auth);
    const dialog = await openEditorByTitle(page, title);

    await dialog.getByLabel("上传群组头像").setInputFiles(images.logo);
    await expect(dialog.getByRole("status")).toContainText("头像已准备好");
    const preview = await readImagePreview(page, "已上传的群组头像预览");
    assertPreviewPng(preview, { maxDimension: 128, maxBytes: 128 * 1024 });
    expect(preview.pixels.some((value, index) => index % 4 === 3 && value < 255)).toBe(true);

    const assetResponses: string[] = [];
    const onResponse = (response: import("@playwright/test").Response) => {
      if (
        response.url().includes("/api/v1/admin/assets") &&
        response.request().method() === "POST"
      ) {
        assetResponses.push(response.url());
      }
    };
    page.on("response", onResponse);
    await dialog.getByRole("button", { name: "保存修改" }).click();
    await expect(dialog).toHaveCount(0);
    page.off("response", onResponse);
    expect(assetResponses).toHaveLength(1);

    const saved = await readSavedGroup(page, auth, groupId);
    const logoUrl = saved["logoUrl"];
    expect(typeof logoUrl).toBe("string");
    if (typeof logoUrl !== "string") throw new Error("保存后的群组缺少 logoUrl。");
    const finalAsset = await fetchAsset(page, logoUrl);
    expect(finalAsset.bytes.byteLength).toBeLessThanOrEqual(128 * 1024);
    expect(finalAsset.info.width).toBeLessThanOrEqual(128);
    expect(finalAsset.info.height).toBeLessThanOrEqual(128);
    await assertLogoPng(finalAsset.bytes);
  });

  test("二维码经过白底 JPEG 压缩、可识别并在保存后完成 adoption", async ({ page, images }) => {
    const auth = await loginViaApi(page);
    const title = `三引擎二维码-${String(Date.now())}`;
    const groupId = await seedGroup(page, auth, title);
    await openAdmin(page, auth);
    const dialog = await openEditorByTitle(page, title);

    await dialog.getByRole("combobox", { name: "加群方式" }).click();
    await dialog.getByRole("option", { name: "二维码" }).click();
    // 加群方式为多选下拉：选中后菜单保持展开，可能盖住底部操作区，先收起
    await dialog.getByRole("combobox", { name: "加群方式" }).click();
    await dialog.getByLabel("上传二维码").setInputFiles(images.qr);
    await expect(dialog.getByRole("status")).toContainText("二维码已准备好");
    const preview = await readImagePreview(page, "已上传的二维码预览");
    await assertPreviewJpeg(preview, { maxDimension: 1024, maxBytes: 1024 * 1024 });
    for (let index = 3; index < preview.pixels.length; index += 4) {
      expect(preview.pixels[index]).toBe(255);
    }
    await assertQrJpeg(Uint8Array.from(preview.bytes), QR_EXPECTED_VALUE);

    const assetResponses: string[] = [];
    const onResponse = (response: import("@playwright/test").Response) => {
      if (
        response.url().includes("/api/v1/admin/assets") &&
        response.request().method() === "POST"
      ) {
        assetResponses.push(response.url());
      }
    };
    page.on("response", onResponse);
    await dialog.getByRole("button", { name: "保存修改" }).click();
    await expect(dialog).toHaveCount(0);
    page.off("response", onResponse);
    expect(assetResponses).toHaveLength(1);

    const saved = await readSavedGroup(page, auth, groupId);
    const methods = saved["joinMethods"];
    expect(Array.isArray(methods)).toBe(true);
    const qrMethod = (methods as Array<Record<string, unknown>>).find(
      (method) => method["type"] === "qr_code",
    );
    expect(qrMethod).toBeDefined();
    const qrUrl = qrMethod?.["qrCodeUrl"];
    expect(typeof qrUrl).toBe("string");
    if (typeof qrUrl !== "string") throw new Error("保存后的群组缺少二维码 URL。");
    const finalAsset = await fetchAsset(page, qrUrl);
    expect(finalAsset.bytes.byteLength).toBeLessThanOrEqual(1024 * 1024);
    expect(finalAsset.info.width).toBeLessThanOrEqual(1024);
    expect(finalAsset.info.height).toBeLessThanOrEqual(1024);
    await assertQrJpeg(finalAsset.bytes, QR_EXPECTED_VALUE);
  });

  test("头像压缩失败时显示精确 Toast 且不产生上传预览", async ({ page, images }) => {
    const auth = await loginViaApi(page);
    const title = `三引擎头像失败-${String(Date.now())}`;
    await seedGroup(page, auth, title);
    await openAdmin(page, auth);
    const dialog = await openEditorByTitle(page, title);

    const assetRequests: string[] = [];
    const onRequest = (request: import("@playwright/test").Request) => {
      if (request.url().includes("/api/v1/admin/assets") && request.method() === "POST") {
        assetRequests.push(request.url());
      }
    };
    page.on("request", onRequest);
    await dialog.getByLabel("上传群组头像").setInputFiles(images.invalid);
    await expect(dialog.getByRole("status")).toHaveText("图像压缩失败");
    await expect(dialog.getByAltText("已上传的群组头像预览")).toHaveCount(0);
    await dialog.getByRole("button", { name: "保存修改" }).click();
    await expect(dialog).toHaveCount(0);
    page.off("request", onRequest);
    expect(assetRequests).toHaveLength(0);
  });

  test("二维码压缩失败时显示精确 Toast 且不产生上传预览", async ({ page, images }) => {
    const auth = await loginViaApi(page);
    const title = `三引擎二维码失败-${String(Date.now())}`;
    await seedGroup(page, auth, title);
    await openAdmin(page, auth);
    const dialog = await openEditorByTitle(page, title);

    const assetRequests: string[] = [];
    const onRequest = (request: import("@playwright/test").Request) => {
      if (request.url().includes("/api/v1/admin/assets") && request.method() === "POST") {
        assetRequests.push(request.url());
      }
    };
    page.on("request", onRequest);
    await dialog.getByRole("combobox", { name: "加群方式" }).click();
    await dialog.getByRole("option", { name: "二维码" }).click();
    // 加群方式为多选下拉：选中后菜单保持展开，会盖住下方的"移除加群方式"按钮，先收起
    await dialog.getByRole("combobox", { name: "加群方式" }).click();
    await dialog.getByLabel("上传二维码").setInputFiles(images.invalid);
    await expect(dialog.getByRole("status")).toHaveText("图像压缩失败，请考虑裁剪图像");
    await expect(dialog.getByAltText("已上传的二维码预览")).toHaveCount(0);
    await dialog.getByRole("button", { name: "移除加群方式" }).last().click();
    await dialog.getByRole("button", { name: "保存修改" }).click();
    await expect(dialog).toHaveCount(0);
    page.off("request", onRequest);
    expect(assetRequests).toHaveLength(0);
  });
});
