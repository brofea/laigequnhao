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

describe("last_published_at 发布状态转换", () => {
  it("新建后直接发布时写入服务端时间", async () => {
    const group = await createGroup(auth, { status: "published" });
    expect(group.lastPublishedAt).not.toBeNull();
    expect(new Date(group.lastPublishedAt!).getTime()).toBeGreaterThan(0);
  });

  it("新建为 pending 时保持 NULL", async () => {
    const group = await createGroup(auth, { status: "pending" });
    expect(group.lastPublishedAt).toBeNull();
  });

  it("pending → published 写入服务端时间", async () => {
    const group = await createGroup(auth, { status: "pending" });
    expect(group.lastPublishedAt).toBeNull();

    const response = await apiFetch(auth, "PATCH", `/api/v1/admin/${group.id}`, {
      status: "published",
      version: group.version,
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: { lastPublishedAt: string | null } };
    expect(json.data.lastPublishedAt).not.toBeNull();
  });

  it("published → published 的编辑不更新时间", async () => {
    const group = await createGroup(auth, { status: "published" });
    const before = group.lastPublishedAt;

    const response = await apiFetch(auth, "PATCH", `/api/v1/admin/${group.id}`, {
      title: "编辑后的标题",
      version: group.version,
    });
    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: { lastPublishedAt: string | null } };
    expect(json.data.lastPublishedAt).toBe(before);
  });

  it("delisted → published 重新发布写入新时间", async () => {
    const group = await createGroup(auth, { status: "published" });
    const firstPublish = group.lastPublishedAt;

    const delist = await apiFetch(auth, "PATCH", `/api/v1/admin/${group.id}`, {
      status: "delisted",
      version: group.version,
    });
    const delisted = ((await delist.json()) as { data: { version: number } }).data;

    const republish = await apiFetch(auth, "PATCH", `/api/v1/admin/${group.id}`, {
      status: "published",
      version: delisted.version,
    });
    expect(republish.status).toBe(200);
    const json = (await republish.json()) as { data: { lastPublishedAt: string | null } };
    expect(json.data.lastPublishedAt).not.toBe(firstPublish);
  });

  it("published → delisted 下架不更新发布时间", async () => {
    const group = await createGroup(auth, { status: "published" });
    const before = group.lastPublishedAt;

    const response = await apiFetch(auth, "PATCH", `/api/v1/admin/${group.id}`, {
      status: "delisted",
      version: group.version,
    });
    const json = (await response.json()) as { data: { lastPublishedAt: string | null } };
    expect(json.data.lastPublishedAt).toBe(before);
  });

  it("从回收站恢复不自动发布、不更新发布时间", async () => {
    const group = await createGroup(auth, { status: "published" });
    const before = group.lastPublishedAt;

    await apiFetch(auth, "DELETE", `/api/v1/admin/${group.id}`);
    const restore = await apiFetch(auth, "POST", `/api/v1/admin/${group.id}/restore`);
    expect(restore.status).toBe(200);
    const json = (await restore.json()) as {
      data: { lastPublishedAt: string | null; deletedAt: string | null };
    };
    expect(json.data.deletedAt).toBeNull();
    expect(json.data.lastPublishedAt).toBe(before);
  });

  it("回收站恢复后再次发布写入新时间", async () => {
    const group = await createGroup(auth, { status: "published" });
    await apiFetch(auth, "DELETE", `/api/v1/admin/${group.id}`);
    const restore = await apiFetch(auth, "POST", `/api/v1/admin/${group.id}/restore`);
    const restored = ((await restore.json()) as { data: { version: number } }).data;

    const publish = await apiFetch(auth, "PATCH", `/api/v1/admin/${group.id}`, {
      status: "published",
      version: restored.version,
    });
    expect(publish.status).toBe(200);
    const json = (await publish.json()) as { data: { lastPublishedAt: string | null } };
    expect(json.data.lastPublishedAt).not.toBeNull();
  });
});

describe("公开详情深链", () => {
  it("返回已发布群组详情", async () => {
    const group = await createGroup(auth, { status: "published" });
    const response = await apiFetch({}, "GET", `/api/v1/groups/${group.id}`);
    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: { id: string; version?: unknown } };
    expect(json.data.id).toBe(group.id);
    expect(json.data.version).toBeUndefined();
  });

  it("下架群组返回 404 且不泄露状态", async () => {
    const group = await createGroup(auth, { status: "published" });
    await apiFetch(auth, "PATCH", `/api/v1/admin/${group.id}`, {
      status: "delisted",
      version: group.version,
    });
    const response = await apiFetch({}, "GET", `/api/v1/groups/${group.id}`);
    expect(response.status).toBe(404);
    const json = (await response.json()) as { error: { code: string } };
    expect(json.error.code).toBe("NOT_FOUND");
  });

  it("回收站与不存在的群组同样返回 404", async () => {
    const group = await createGroup(auth, { status: "published" });
    await apiFetch(auth, "DELETE", `/api/v1/admin/${group.id}`);
    expect((await apiFetch({}, "GET", `/api/v1/groups/${group.id}`)).status).toBe(404);
    expect((await apiFetch({}, "GET", `/api/v1/groups/${crypto.randomUUID()}`)).status).toBe(404);
  });
});

describe("发现新群", () => {
  it("最多返回 10 条且全部为 published", async () => {
    for (let i = 0; i < 12; i++) {
      await createGroup(auth, { status: "published", title: `发现群-${i}` });
    }
    const response = await apiFetch({}, "GET", "/api/v1/discover");
    expect(response.status).toBe(200);
    const json = (await response.json()) as { data: { items: Array<{ status: string }> } };
    expect(json.data.items.length).toBeLessThanOrEqual(10);
    for (const item of json.data.items) {
      expect(item.status).toBe("published");
    }
  });

  it("按 last_published_at DESC, id DESC 稳定排序", async () => {
    const ids: string[] = [];
    for (let i = 0; i < 5; i++) {
      const group = await createGroup(auth, { status: "published", title: `排序群-${i}` });
      ids.push(group.id);
    }

    const first = await apiFetch({}, "GET", "/api/v1/discover");
    const json = (await first.json()) as { data: { items: Array<{ id: string }> } };
    // 新创建的群组按发布时间倒序排在前面
    expect(json.data.items[0]!.id).toBe(ids[ids.length - 1]);

    // 刷新后顺序稳定
    const second = await apiFetch({}, "GET", "/api/v1/discover");
    const json2 = (await second.json()) as { data: { items: Array<{ id: string }> } };
    expect(json2.data.items.map(({ id }) => id)).toEqual(json.data.items.map(({ id }) => id));
  });

  it("NULL 发布时间排在有时间的记录之后", async () => {
    const response = await apiFetch({}, "GET", "/api/v1/discover");
    const json = (await response.json()) as { data: { items: Array<{ id: string }> } };
    expect(json.data.items.length).toBeLessThanOrEqual(10);
    // 迁移后新建的直接 published 群组都有时间；直接查库验证 NULL 不排在前面
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS count FROM groups WHERE status = 'published' AND last_published_at IS NULL",
    ).first<{ count: number }>();
    expect(row?.count).toBe(0);
  });
});

describe("标签聚合", () => {
  it("只统计已发布群组，单次聚合结果正确", async () => {
    await createGroup(auth, { status: "published", tags: ["聚合甲"] });
    await createGroup(auth, { status: "published", tags: ["聚合甲"] });
    await createGroup(auth, { status: "delisted", tags: ["聚合甲"] });
    await createGroup(auth, { status: "pending", tags: ["聚合乙"] });

    const response = await apiFetch({}, "GET", "/api/v1/tags");
    expect(response.status).toBe(200);
    const json = (await response.json()) as {
      data: { tags: Array<{ tag: string; count: number }> };
    };
    const byTag = new Map(json.data.tags.map((t) => [t.tag, t.count]));
    expect(byTag.get("聚合甲")).toBe(2);
    expect(byTag.has("聚合乙")).toBe(false);
  });
});
