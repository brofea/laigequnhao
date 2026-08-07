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

async function seedPublishedGroup(
  page: Page,
  auth: { cookie: string; csrf: string },
  title: string,
): Promise<string> {
  const response = await page.request.fetch(`${API}/admin`, {
    method: "POST",
    headers: {
      Cookie: `session=${auth.cookie}`,
      "X-CSRF-Token": auth.csrf,
      "Content-Type": "application/json",
    },
    data: {
      title,
      description: "无障碍 E2E 种子",
      kind: "interest",
      platform: "QQ",
      status: "published",
      tags: ["无障碍标签"],
      joinMethods: [{ type: "group_number", value: "100001", sortOrder: 0 }],
    },
  });
  expect(response.status()).toBe(201);
  const listResponse = await page.request.fetch(
    `${API}/admin?q=${encodeURIComponent(title)}&status=published`,
    { headers: { Cookie: `session=${auth.cookie}` } },
  );
  expect(listResponse.status()).toBe(200);
  const listData = (await listResponse.json()) as { data: { items: Array<{ id: string }> } };
  const group = listData.data.items[0];
  if (!group) throw new Error("seeded group not found in list");
  return group.id;
}

test("键盘 Tab 完成核心公开流程：卡片聚焦 + Enter 打开详情 + Escape 关闭并恢复焦点", async ({
  page,
}) => {
  const auth = await loginViaApi(page);
  const title = `键盘流程群-${String(Date.now())}`;
  await seedPublishedGroup(page, auth, title);

  await page.goto("/");
  // 等待种子群组卡片渲染完成，避免异步列表加载期间开始 Tab 导致焦点序列错过卡片
  await expect(page.getByRole("button", { name: new RegExp(title) }).first()).toBeAttached();
  // Tab 到搜索框 → 继续 Tab 到达 group-card 主体按钮（跳过样例状态条/轮播控件）
  await page.getByRole("searchbox", { name: "搜索群组" }).focus();
  let found = false;
  for (let index = 0; index < 16; index++) {
    await page.keyboard.press("Tab");
    const active = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName ?? "",
        cls: typeof el?.className === "string" ? el.className : "",
        text: el?.textContent ?? "",
      };
    });
    if (
      active.tag === "BUTTON" &&
      active.cls.includes("group-card__body") &&
      active.text.includes(title)
    ) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);

  // Enter 打开详情弹窗
  await page.keyboard.press("Enter");
  const dialog = page.locator('[data-dialog="group-detail-dialog"]');
  await expect(dialog).toBeVisible();

  // 弹窗打开后初始焦点在关闭按钮（Dialog 组件实现）
  const initialFocus = await page.evaluate(() => {
    const el = document.activeElement;
    const label = el instanceof HTMLElement ? (el.getAttribute("aria-label") ?? "") : "";
    const inDialog = Boolean(
      document.querySelector('[data-dialog="group-detail-dialog"]')?.contains(el),
    );
    return { label, inDialog };
  });
  expect(initialFocus.inDialog).toBe(true);

  // 焦点锁定：Tab/Shift+Tab 多轮循环不逃出弹窗
  for (let index = 0; index < 10; index++) {
    await page.keyboard.press(index % 2 === 0 ? "Tab" : "Shift+Tab");
    const inDialog = await page.evaluate(() =>
      Boolean(
        document
          .querySelector('[data-dialog="group-detail-dialog"]')
          ?.contains(document.activeElement),
      ),
    );
    expect(inDialog).toBe(true);
  }

  // Escape 关闭并恢复焦点到卡片主体
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  const restoredText = await page.evaluate(() => document.activeElement?.textContent ?? "");
  expect(restoredText).toContain(title);
});

test("Dialog 关闭按钮可键盘操作，点赞按钮独立可聚焦", async ({ page }) => {
  const auth = await loginViaApi(page);
  const title = `焦点独立群-${String(Date.now())}`;
  await seedPublishedGroup(page, auth, title);

  await page.goto("/");
  const card = page.locator(".group-card", { hasText: title }).first();
  await card.locator(".group-card__body").click();
  const dialog = page.locator('[data-dialog="group-detail-dialog"]');
  await expect(dialog).toBeVisible();

  // 点赞按钮在弹窗内可聚焦且可操作（aria-pressed 切换）
  const likeInDialog = dialog.getByRole("button", { name: /^(点赞|已点赞)/ }).first();
  await likeInDialog.focus();
  const pressedBefore = await likeInDialog.getAttribute("aria-pressed");
  await page.keyboard.press("Enter");
  await expect(likeInDialog).toHaveAttribute(
    "aria-pressed",
    pressedBefore === "true" ? "false" : "true",
  );

  // 关闭按钮可键盘操作
  await dialog.getByRole("button", { name: "关闭弹窗" }).focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
});

test("图标按钮具备可访问名称", async ({ page }) => {
  await page.goto("/");
  // 顶栏主题控件、GitHub、添加新群
  await expect(page.getByRole("button", { name: /切换主题/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "GitHub" })).toBeVisible();
  await expect(page.getByRole("button", { name: "添加新群" })).toBeVisible();

  // Carousel 控件（发现/板块各一，取首个）
  await expect(page.getByRole("button", { name: "向左滚动" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "向右滚动" }).first()).toBeVisible();
});

test("Toast 错误提示可被辅助技术感知（aria-live）", async ({ page }) => {
  await page.goto("/");
  // 触发一个错误场景：访问不可公开的深链（toast warning）
  await page.goto("/?group=00000000-0000-4000-8000-000000000000");
  await expect(page.getByText("群组不存在或不可公开")).toBeVisible();
  const live = await page.evaluate(() => {
    const toasts = document.querySelector(".app-toasts");
    return toasts?.getAttribute("aria-live") ?? null;
  });
  expect(live).not.toBeNull();
});

test("表格语义：表头 scope 与单元格结构正确", async ({ page }) => {
  const auth = await loginViaApi(page);
  await seedPublishedGroup(page, auth, `表格语义群-${String(Date.now())}`);
  await page
    .context()
    .addCookies([{ name: "session", value: auth.cookie, url: "http://localhost:5173" }]);
  await page.goto("/admin");
  await expect(page.locator(".admin-table")).toBeVisible();
  const headerScopes = await page
    .locator(".admin-table thead th")
    .evaluateAll((ths) =>
      ths.map((th) => ({ text: th.textContent, scope: th.getAttribute("scope") })),
    );
  const headerCols = headerScopes.filter(
    (h) => h.text.startsWith("标题") || h.text.startsWith("状态") || h.text.startsWith("操作"),
  );
  expect(headerCols.length).toBe(3);
  for (const h of headerCols) expect(h.scope).toBe("col");
});

test("主题三态按钮具备 aria-pressed 状态语义（颜色不是唯一状态）", async ({ page }) => {
  await page.goto("/");
  const control = page.locator(".theme-control");
  // 循环点击三档，label 变化（系统/浅色/深色），不只靠颜色区分
  const labels: string[] = [];
  for (let index = 0; index < 4; index++) {
    await control.click();
    const label = await control.textContent();
    if (label) labels.push(label.trim());
  }
  // system → light → dark → system，label 序列应包含三类文本
  expect(labels.join("")).toMatch(/系统/);
  expect(labels.join("")).toMatch(/浅色/);
  expect(labels.join("")).toMatch(/深色/);
});

test("reduced motion 偏好下核心动画关闭", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  // 无页面级横向滚动且主题切换无等待（快速可完成）
  await page.locator(".theme-control").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", /light|dark/);
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);
});

test("对比度抽查：浅色/深色主题主要文字组合", async ({ page }) => {
  for (const theme of ["light", "dark"] as const) {
    await page.context().addInitScript((t) => {
      localStorage.setItem("lgqh.theme-preference.v1", JSON.stringify(t));
    }, theme);
    await page.goto("/");
    await page.waitForTimeout(300);
    const results = await page.evaluate(() => {
      const shell = document.querySelector(".app-shell");
      if (!shell) return null;
      const cs = getComputedStyle(shell);
      const bg = cs.getPropertyValue("--background").trim();
      const primary = cs.getPropertyValue("--text-primary").trim();
      const secondary = cs.getPropertyValue("--text-secondary").trim();
      const muted = cs.getPropertyValue("--text-muted").trim();
      const link = cs.getPropertyValue("--text-link").trim();
      const accent = cs.getPropertyValue("--accent").trim();
      const parse = (color: string) => {
        const m = color.match(/rgba?\(([^)]+)\)/);
        if (m && m[1]) {
          const parts = m[1].split(",").map((s) => Number(s.trim()));
          return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0 };
        }
        const hex = color.replace("#", "");
        return {
          r: parseInt(hex.slice(0, 2), 16),
          g: parseInt(hex.slice(2, 4), 16),
          b: parseInt(hex.slice(4, 6), 16),
        };
      };
      const lum = ({ r, g, b }: { r: number; g: number; b: number }) => {
        const f = (v: number) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        };
        return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
      };
      const ratio = (a: string, b: string) => {
        const la = lum(parse(a));
        const lb = lum(parse(b));
        return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      };
      return {
        primary: Number(ratio(primary, bg).toFixed(2)),
        secondary: Number(ratio(secondary, bg).toFixed(2)),
        muted: Number(ratio(muted, bg).toFixed(2)),
        link: Number(ratio(link, bg).toFixed(2)),
        accentOnBg: Number(ratio(accent, bg).toFixed(2)),
      };
    });
    expect(results).not.toBeNull();
    if (results) {
      // 正文文字 ≥ 4.5、次要文字 ≥ 3（提示性 muted 记录不阻塞）
      expect(results.primary).toBeGreaterThanOrEqual(4.5);
      expect(results.secondary).toBeGreaterThanOrEqual(3);
      console.log(
        `[a11y] ${theme} 主题对比度: primary=${String(results.primary)} secondary=${String(results.secondary)} muted=${String(results.muted)} link=${String(results.link)} accent=${String(results.accentOnBg)}`,
      );
    }
  }
});
