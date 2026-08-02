import { describe, expect, it, beforeAll } from "vitest";
import app from "../../functions/_lib/app";
import type { Env } from "../../functions/_lib/env";
import { env as testEnv } from "cloudflare:test";
import { loginAdmin, apiFetch, createGroup } from "./helpers";

const env = testEnv as Env;
let auth: Record<string, string>;

beforeAll(async () => {
  auth = await loginAdmin();
});

describe("管理端页码分页（固定每页 50 条）", () => {
  it("第 50、51 条边界与 totalPages 正确", async () => {
    for (let i = 0; i < 51; i++) {
      await createGroup(auth, {
        status: "pending",
        title: `分页边界-${String(i).padStart(2, "0")}`,
      });
    }

    const page1 = (await (
      await apiFetch(auth, "GET", "/api/v1/admin?page=1&status=pending")
    ).json()) as {
      data: {
        items: unknown[];
        page: number;
        pageSize: number;
        totalItems: number;
        totalPages: number;
      };
    };
    expect(page1.data.items).toHaveLength(50);
    expect(page1.data.page).toBe(1);
    expect(page1.data.pageSize).toBe(50);
    expect(page1.data.totalItems).toBe(51);
    expect(page1.data.totalPages).toBe(2);

    const page2 = (await (
      await apiFetch(auth, "GET", "/api/v1/admin?page=2&status=pending")
    ).json()) as { data: { items: unknown[]; totalItems: number; totalPages: number } };
    expect(page2.data.items).toHaveLength(1);
    expect(page2.data.totalItems).toBe(51);
    expect(page2.data.totalPages).toBe(2);

    // 合并两页无重复、无遗漏
    const ids = [
      ...(page1.data.items as Array<{ id: string }>),
      ...(page2.data.items as Array<{ id: string }>),
    ].map((g) => g.id);
    expect(new Set(ids).size).toBe(51);
  });

  it("零条目时 totalItems 与 totalPages 均为 0", async () => {
    const json = (await (
      await apiFetch(auth, "GET", "/api/v1/admin?page=1&status=rejected")
    ).json()) as { data: { items: unknown[]; totalItems: number; totalPages: number } };
    expect(json.data.items).toEqual([]);
    expect(json.data.totalItems).toBe(0);
    expect(json.data.totalPages).toBe(0);
  });

  it("跨页排序稳定：相同值不跳动", async () => {
    // 51 条同 created_at 场景不可构造，改用 likeCount 排序 + 稳定次排序 id 验证
    for (let i = 0; i < 51; i++) {
      await createGroup(auth, {
        status: "published",
        title: `稳定排序-${String(i).padStart(2, "0")}`,
      });
    }
    // 全部 likeCount 相同 → 依赖 id 次排序，跨页不重复
    const page1 = (await (
      await apiFetch(
        auth,
        "GET",
        "/api/v1/admin?page=1&status=published&sortBy=likeCount&sortDir=desc",
      )
    ).json()) as { data: { items: Array<{ id: string }> } };
    const page2 = (await (
      await apiFetch(
        auth,
        "GET",
        "/api/v1/admin?page=2&status=published&sortBy=likeCount&sortDir=desc",
      )
    ).json()) as { data: { items: Array<{ id: string }> } };
    const allIds = [...page1.data.items, ...page2.data.items].map((g) => g.id);
    expect(new Set(allIds).size).toBe(51);
  });

  it("回收站筛选与搜索保持可用", async () => {
    const group = await createGroup(auth, { status: "published", title: "回收站分页-唯一" });
    await apiFetch(auth, "DELETE", `/api/v1/admin/${group.id}`);

    const trash = (await (
      await apiFetch(auth, "GET", "/api/v1/admin?page=1&deleted=true")
    ).json()) as { data: { items: Array<{ id: string }>; totalItems: number } };
    expect(trash.data.items.some((g) => g.id === group.id)).toBe(true);

    const search = (await (
      await apiFetch(
        auth,
        "GET",
        "/api/v1/admin?page=1&deleted=true&q=%E5%9B%9E%E6%94%B6%E7%AB%99%E5%88%86%E9%A1%B5",
      )
    ).json()) as { data: { items: Array<{ id: string }>; totalItems: number } };
    expect(search.data.totalItems).toBe(1);
    expect(search.data.items[0]!.id).toBe(group.id);
  });
});
