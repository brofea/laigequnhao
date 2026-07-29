import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createR2Adapter } from "../../functions/_lib/adapters/r2-adapter";
import app from "../../functions/_lib/app";
import { createGroupRepository } from "../../functions/_lib/repositories/group-repository";
import { createAssetService } from "../../functions/_lib/services/asset-service";
import type { AdminGroupDto } from "../../shared/contracts/group";
import { apiFetch, createGroup, loginAdmin, uploadQrAsset } from "./helpers";

interface AssetRow {
  id: string;
  r2_key: string;
  status: string;
  ref_count: number;
  delete_attempts: number;
  delete_last_error_code: string | null;
}

let authHeaders: Record<string, string>;

beforeAll(async () => {
  authHeaders = await loginAdmin();
});

async function getAdminGroup(id: string): Promise<AdminGroupDto> {
  const response = await apiFetch(authHeaders, "GET", `/api/v1/admin/${id}`);
  expect(response.status).toBe(200);
  return ((await response.json()) as { data: AdminGroupDto }).data;
}

async function patchGroup(
  group: AdminGroupDto,
  payload: Record<string, unknown>,
): Promise<Response> {
  return apiFetch(authHeaders, "PATCH", `/api/v1/admin/${group.id}`, {
    ...payload,
    version: group.version,
  });
}

describe("QR resource lifecycle", () => {
  it("keeps a retryable D1 record when R2 upload fails", async () => {
    const realAdapter = createR2Adapter(env.R2, env);
    const failingService = createAssetService(env.DB, env.R2, env, {
      ...realAdapter,
      upload: async () => {
        throw new Error("simulated R2 upload failure");
      },
    });

    await expect(
      failingService.uploadStaged(new ArrayBuffer(1), "qr_code", {
        width: 1,
        height: 1,
        byteLength: 1,
      }),
    ).rejects.toMatchObject({ code: "R2_UPLOAD_FAILED" });
    expect(
      await env.DB.prepare(
        "SELECT status, delete_attempts, delete_last_error_code FROM assets WHERE purpose = 'qr_code'",
      ).first(),
    ).toMatchObject({
      status: "delete_failed",
      delete_attempts: 1,
      delete_last_error_code: "R2_UPLOAD_FAILED",
    });

    const recoveryService = createAssetService(env.DB, env.R2, env);
    expect(await recoveryService.retryFailedDeletes()).toBe(1);
    expect(
      await env.DB.prepare("SELECT id FROM assets WHERE purpose = 'qr_code'").first(),
    ).toBeNull();
  });

  it("recovers delete_pending assets through the authenticated cleanup endpoint", async () => {
    const uploaded = await uploadQrAsset(authHeaders);
    await env.DB.prepare("UPDATE assets SET status = 'delete_pending' WHERE id = ?")
      .bind(uploaded.id)
      .run();

    const cleanup = await apiFetch(authHeaders, "POST", "/api/v1/admin/assets/cleanup");
    expect(cleanup.status).toBe(200);
    expect(await cleanup.json()).toMatchObject({
      data: { failedRetried: 1 },
    });
    expect(
      await env.DB.prepare("SELECT id FROM assets WHERE id = ?").bind(uploaded.id).first(),
    ).toBeNull();
    expect(await env.R2.head(uploaded.r2Key)).toBeNull();
  });

  it("does not upload to R2 when the initial D1 asset insert fails", async () => {
    await env.DB.prepare(
      `CREATE TRIGGER force_asset_insert_failure
       BEFORE INSERT ON assets
       BEGIN
         SELECT RAISE(ABORT, 'forced asset insert failure');
       END`,
    ).run();
    const realAdapter = createR2Adapter(env.R2, env);
    const upload = vi.fn(realAdapter.upload);
    const failingService = createAssetService(env.DB, env.R2, env, {
      ...realAdapter,
      upload,
    });

    await expect(
      failingService.uploadStaged(new ArrayBuffer(1), "qr_code", {
        width: 1,
        height: 1,
        byteLength: 1,
      }),
    ).rejects.toMatchObject({ code: "D1_WRITE_FAILED" });
    expect(upload).not.toHaveBeenCalled();
    expect(await env.DB.prepare("SELECT id FROM assets").first()).toBeNull();
  });

  it("counts both references when two aggregates concurrently adopt the same staged asset", async () => {
    const uploaded = await uploadQrAsset(authHeaders);
    const repo = createGroupRepository(env.DB);
    const groups = await Promise.all(
      ["并发引用一", "并发引用二"].map((title) =>
        repo.create({
          title,
          description: "",
          kind: "interest",
          platform: "qq",
          status: "pending",
          tags: [],
          joinMethods: [{ type: "qr_code", assetId: uploaded.id, sortOrder: 0 }],
          adoptAssetIds: [uploaded.id],
        }),
      ),
    );

    expect(groups).toHaveLength(2);
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(uploaded.id)
        .first(),
    ).toMatchObject({ status: "ready", ref_count: 2 });
    expect(
      await env.DB.prepare("SELECT COUNT(*) AS count FROM join_methods WHERE asset_id = ?")
        .bind(uploaded.id)
        .first<{ count: number }>(),
    ).toEqual({ count: 2 });
  });

  it("rolls back aggregate creation if a QR asset becomes non-referenceable", async () => {
    const uploaded = await uploadQrAsset(authHeaders);
    await env.DB.prepare("UPDATE assets SET status = 'delete_pending' WHERE id = ?")
      .bind(uploaded.id)
      .run();
    const repo = createGroupRepository(env.DB);

    await expect(
      repo.create({
        title: "不应创建的群",
        description: "",
        kind: "interest",
        platform: "qq",
        status: "pending",
        tags: ["不应写入"],
        joinMethods: [{ type: "qr_code", assetId: uploaded.id, sortOrder: 0 }],
        adoptAssetIds: [uploaded.id],
      }),
    ).rejects.toThrow();
    expect(
      await env.DB.prepare("SELECT id FROM groups WHERE title = '不应创建的群'").first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM group_tags WHERE tag = '不应写入'").first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM join_methods WHERE asset_id = ?")
        .bind(uploaded.id)
        .first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(uploaded.id)
        .first(),
    ).toMatchObject({ status: "delete_pending", ref_count: 0 });
  });

  it("adopts once, exposes only public QR metadata, and deletes after the final reference", async () => {
    const uploaded = await uploadQrAsset(authHeaders);
    const first = await createGroup(authHeaders, {
      title: "第一个二维码群",
      joinMethods: [
        { type: "group_number", value: "100001", sortOrder: 0 },
        { type: "qr_code", assetId: uploaded.id, sortOrder: 1 },
      ],
    });

    let asset = await env.DB.prepare("SELECT * FROM assets WHERE id = ?")
      .bind(uploaded.id)
      .first<AssetRow>();
    expect(asset).toMatchObject({ status: "ready", ref_count: 1 });
    expect(await env.R2.head(uploaded.r2Key)).not.toBeNull();

    const adminDto = await getAdminGroup(first.id);
    const adminQr = adminDto.joinMethods.find((method) => method.type === "qr_code");
    expect(adminQr).toMatchObject({
      assetId: uploaded.id,
      assetUrl: `https://assets.test.invalid/${uploaded.r2Key}`,
    });

    const publicResponse = await apiFetch(authHeaders, "GET", "/api/v1/groups?limit=50");
    expect(publicResponse.status).toBe(200);
    const publicItems = (
      (await publicResponse.json()) as {
        data: { items: Array<Record<string, unknown> & { id: string; joinMethods: unknown[] }> };
      }
    ).data.items;
    const publicGroup = publicItems.find((group) => group.id === first.id);
    expect(publicGroup).toBeDefined();
    expect(publicGroup).not.toHaveProperty("version");
    expect(publicGroup).not.toHaveProperty("submissionContact");
    const publicQr = (publicGroup?.joinMethods as Array<Record<string, unknown>>).find(
      (method) => method.type === "qr_code",
    );
    expect(publicQr).toMatchObject({
      qrCodeUrl: `https://assets.test.invalid/${uploaded.r2Key}`,
    });
    expect(publicQr).not.toHaveProperty("assetId");
    expect(publicQr).not.toHaveProperty("r2Key");

    let second = await createGroup(authHeaders, { title: "第二个二维码群" });
    const addSecondRef = await patchGroup(second, {
      joinMethods: [
        { type: "group_number", value: "100002", sortOrder: 0 },
        { type: "qr_code", assetId: uploaded.id, sortOrder: 1 },
      ],
    });
    expect(addSecondRef.status).toBe(200);
    second = ((await addSecondRef.json()) as { data: AdminGroupDto }).data;
    asset = await env.DB.prepare("SELECT * FROM assets WHERE id = ?")
      .bind(uploaded.id)
      .first<AssetRow>();
    expect(asset).toMatchObject({ status: "ready", ref_count: 2 });

    const removeSecondRef = await patchGroup(second, {
      joinMethods: [{ type: "group_number", value: "100002", sortOrder: 0 }],
    });
    expect(removeSecondRef.status).toBe(200);
    asset = await env.DB.prepare("SELECT * FROM assets WHERE id = ?")
      .bind(uploaded.id)
      .first<AssetRow>();
    expect(asset).toMatchObject({ status: "ready", ref_count: 1 });

    const refreshedFirst = await getAdminGroup(first.id);
    const removeFinalRef = await patchGroup(refreshedFirst, {
      joinMethods: [{ type: "group_number", value: "100001", sortOrder: 0 }],
    });
    expect(removeFinalRef.status).toBe(200);
    expect(
      await env.DB.prepare("SELECT id FROM assets WHERE id = ?").bind(uploaded.id).first(),
    ).toBeNull();
    expect(await env.R2.head(uploaded.r2Key)).toBeNull();
  });

  it("never purges a ready referenced asset through staged cleanup", async () => {
    const uploaded = await uploadQrAsset(authHeaders);
    const group = await createGroup(authHeaders, {
      joinMethods: [{ type: "qr_code", assetId: uploaded.id, sortOrder: 0 }],
    });

    const response = await apiFetch(
      authHeaders,
      "DELETE",
      `/api/v1/admin/assets/${uploaded.id}?mode=purge`,
    );
    expect(response.status).toBe(409);
    expect(await env.R2.head(uploaded.r2Key)).not.toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM join_methods WHERE group_id = ? AND asset_id = ?")
        .bind(group.id, uploaded.id)
        .first(),
    ).not.toBeNull();
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(uploaded.id)
        .first(),
    ).toMatchObject({ status: "ready", ref_count: 1 });
  });

  it("counts only successful retry cleanup when R2 initially fails", async () => {
    const id = crypto.randomUUID();
    const r2Key = `qr_code/${id}.webp`;
    await env.R2.put(r2Key, new Uint8Array([1, 2, 3]));
    await env.DB.prepare(
      `INSERT INTO assets
         (id, r2_key, purpose, content_type, byte_length, width, height, status, ref_count)
       VALUES (?, ?, 'qr_code', 'image/webp', 3, 1, 1, 'delete_failed', 0)`,
    )
      .bind(id, r2Key)
      .run();

    const realAdapter = createR2Adapter(env.R2, env);
    const failingAdapter = {
      ...realAdapter,
      delete: async () => {
        throw new Error("simulated R2 delete failure");
      },
      head: async () => {
        throw new Error("simulated R2 head failure");
      },
    };
    const failingService = createAssetService(env.DB, env.R2, env, failingAdapter);

    expect(await failingService.retryFailedDeletes()).toBe(0);
    expect(await env.R2.head(r2Key)).not.toBeNull();
    expect(
      await env.DB.prepare("SELECT * FROM assets WHERE id = ?").bind(id).first<AssetRow>(),
    ).toMatchObject({
      status: "delete_failed",
      ref_count: 0,
      delete_attempts: 1,
      delete_last_error_code: "R2_HEAD_FAILED",
    });

    const cleanupResponse = await apiFetch(authHeaders, "POST", "/api/v1/admin/assets/cleanup");
    expect(cleanupResponse.status).toBe(200);
    expect((await cleanupResponse.json()) as unknown).toMatchObject({
      data: { failedRetried: 1 },
    });
    expect(await env.R2.head(r2Key)).toBeNull();
    expect(await env.DB.prepare("SELECT id FROM assets WHERE id = ?").bind(id).first()).toBeNull();
  });

  it("permanently deletes an exclusive QR asset and preserves shared QR references", async () => {
    const exclusive = await uploadQrAsset(authHeaders);
    const exclusiveGroup = await createGroup(authHeaders, {
      title: "独占二维码群",
      joinMethods: [{ type: "qr_code", assetId: exclusive.id, sortOrder: 0 }],
    });
    expect(
      (await apiFetch(authHeaders, "DELETE", `/api/v1/admin/${exclusiveGroup.id}`)).status,
    ).toBe(200);
    const exclusiveDelete = await apiFetch(
      authHeaders,
      "DELETE",
      `/api/v1/admin/trash/groups/${exclusiveGroup.id}`,
    );
    expect(exclusiveDelete.status).toBe(200);
    expect(
      await env.DB.prepare("SELECT id FROM groups WHERE id = ?").bind(exclusiveGroup.id).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM assets WHERE id = ?").bind(exclusive.id).first(),
    ).toBeNull();
    expect(await env.R2.head(exclusive.r2Key)).toBeNull();

    const shared = await uploadQrAsset(authHeaders);
    const first = await createGroup(authHeaders, {
      title: "共享二维码群一",
      joinMethods: [{ type: "qr_code", assetId: shared.id, sortOrder: 0 }],
    });
    let second = await createGroup(authHeaders, { title: "共享二维码群二" });
    const addSharedRef = await patchGroup(second, {
      joinMethods: [{ type: "qr_code", assetId: shared.id, sortOrder: 0 }],
    });
    expect(addSharedRef.status).toBe(200);
    second = ((await addSharedRef.json()) as { data: AdminGroupDto }).data;

    expect((await apiFetch(authHeaders, "DELETE", `/api/v1/admin/${first.id}`)).status).toBe(200);
    const deleteFirst = await apiFetch(
      authHeaders,
      "DELETE",
      `/api/v1/admin/trash/groups/${first.id}`,
    );
    expect(deleteFirst.status).toBe(200);
    expect(await env.R2.head(shared.r2Key)).not.toBeNull();
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(shared.id)
        .first(),
    ).toMatchObject({ status: "ready", ref_count: 1 });
    expect(
      await env.DB.prepare("SELECT id FROM join_methods WHERE group_id = ? AND asset_id = ?")
        .bind(second.id, shared.id)
        .first(),
    ).not.toBeNull();
  });

  it("keeps permanent QR deletion retryable when R2 delete fails", async () => {
    const uploaded = await uploadQrAsset(authHeaders);
    const group = await createGroup(authHeaders, {
      title: "永久删除 R2 故障",
      joinMethods: [{ type: "qr_code", assetId: uploaded.id, sortOrder: 0 }],
    });
    expect((await apiFetch(authHeaders, "DELETE", `/api/v1/admin/${group.id}`)).status).toBe(200);

    const failingR2 = new Proxy(env.R2, {
      get(target, property) {
        if (property === "delete") {
          return async () => {
            throw new Error("simulated permanent-delete R2 failure");
          };
        }
        const value = Reflect.get(target, property);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const failingResponse = await app.fetch(
      new Request(`http://localhost/api/v1/admin/trash/groups/${group.id}`, {
        method: "DELETE",
        headers: {
          ...authHeaders,
          "X-Request-Id": crypto.randomUUID(),
        },
      }),
      { ...env, R2: failingR2 },
    );
    expect(failingResponse.status).toBe(502);
    expect(await failingResponse.json()).toMatchObject({
      error: { code: "DEPENDENCY_UNAVAILABLE" },
    });
    expect(
      await env.DB.prepare(
        "SELECT purge_state, purge_attempts, purge_last_error_code FROM groups WHERE id = ?",
      )
        .bind(group.id)
        .first(),
    ).toMatchObject({
      purge_state: "pending",
      purge_attempts: 2,
      purge_last_error_code: "R2_CLEANUP_FAILED",
    });
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(uploaded.id)
        .first(),
    ).toMatchObject({ status: "ready", ref_count: 1 });
    expect(await env.R2.head(uploaded.r2Key)).not.toBeNull();

    const retry = await apiFetch(authHeaders, "DELETE", `/api/v1/admin/trash/groups/${group.id}`);
    expect(retry.status).toBe(200);
    expect(
      await env.DB.prepare("SELECT id FROM groups WHERE id = ?").bind(group.id).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM assets WHERE id = ?").bind(uploaded.id).first(),
    ).toBeNull();
    expect(await env.R2.head(uploaded.r2Key)).toBeNull();
  });

  it("keeps the group tombstone when the final D1 asset cleanup fails", async () => {
    const uploaded = await uploadQrAsset(authHeaders);
    const group = await createGroup(authHeaders, {
      title: "永久删除 D1 故障",
      joinMethods: [{ type: "qr_code", assetId: uploaded.id, sortOrder: 0 }],
    });
    expect((await apiFetch(authHeaders, "DELETE", `/api/v1/admin/${group.id}`)).status).toBe(200);
    await env.DB.prepare(
      `CREATE TRIGGER force_asset_delete_failure
       BEFORE DELETE ON assets
       BEGIN
         SELECT RAISE(ABORT, 'forced asset delete failure');
       END`,
    ).run();

    const failed = await apiFetch(authHeaders, "DELETE", `/api/v1/admin/trash/groups/${group.id}`);
    expect(failed.status).toBe(500);
    expect(
      await env.DB.prepare("SELECT purge_state FROM groups WHERE id = ?").bind(group.id).first(),
    ).toEqual({ purge_state: "r2_done" });
    expect(
      await env.DB.prepare("SELECT id FROM join_methods WHERE group_id = ?").bind(group.id).first(),
    ).not.toBeNull();
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(uploaded.id)
        .first(),
    ).toMatchObject({ status: "delete_pending", ref_count: 0 });
    expect(await env.R2.head(uploaded.r2Key)).toBeNull();

    await env.DB.prepare("DROP TRIGGER force_asset_delete_failure").run();
    const retry = await apiFetch(authHeaders, "DELETE", `/api/v1/admin/trash/groups/${group.id}`);
    expect(retry.status).toBe(200);
    expect(
      await env.DB.prepare("SELECT id FROM groups WHERE id = ?").bind(group.id).first(),
    ).toBeNull();
    expect(
      await env.DB.prepare("SELECT id FROM assets WHERE id = ?").bind(uploaded.id).first(),
    ).toBeNull();
  });
});

describe("atomic admin PATCH", () => {
  it("allows exactly one concurrent writer and keeps a winner-consistent aggregate", async () => {
    const originalAsset = await uploadQrAsset(authHeaders);
    const candidateAssets = [
      await uploadQrAsset(authHeaders),
      await uploadQrAsset(authHeaders),
    ] as const;
    const original = await createGroup(authHeaders, {
      title: "并发原始",
      tags: ["原始"],
      auditNotes: "原始备注",
      joinMethods: [
        { type: "group_number", value: "200000", sortOrder: 0 },
        { type: "qr_code", assetId: originalAsset.id, sortOrder: 1 },
      ],
    });
    const payloads = [
      {
        title: "并发赢家 A",
        tags: ["标签A"],
        joinMethods: [
          { type: "group_number", value: "200001", sortOrder: 0 },
          { type: "qr_code", assetId: candidateAssets[0].id, sortOrder: 1 },
        ],
        auditNotes: "备注A",
      },
      {
        title: "并发赢家 B",
        tags: ["标签B"],
        joinMethods: [
          { type: "group_number", value: "200002", sortOrder: 0 },
          { type: "qr_code", assetId: candidateAssets[1].id, sortOrder: 1 },
        ],
        auditNotes: "备注B",
      },
    ];

    const responses = await (async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-07-29T08:00:00.000Z"));
      try {
        return await Promise.all(payloads.map((payload) => patchGroup(original, payload)));
      } finally {
        vi.useRealTimers();
      }
    })();
    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);

    const current = await getAdminGroup(original.id);
    const winnerIndex = current.title.endsWith("A") ? 0 : 1;
    const winner = payloads[winnerIndex]!;
    expect(current).toMatchObject({
      title: winner.title,
      tags: winner.tags,
      auditNotes: winner.auditNotes,
      version: original.version + 1,
    });
    expect(current.joinMethods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "group_number",
          value: winner.joinMethods[0]!.value,
        }),
        expect.objectContaining({
          type: "qr_code",
          assetId: winner.joinMethods[1]!.assetId,
        }),
      ]),
    );
    const loserIndex = winnerIndex === 0 ? 1 : 0;
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(candidateAssets[winnerIndex].id)
        .first(),
    ).toMatchObject({ status: "ready", ref_count: 1 });
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(candidateAssets[loserIndex].id)
        .first(),
    ).toMatchObject({ status: "staged", ref_count: 0 });
    expect(
      await env.DB.prepare("SELECT id FROM assets WHERE id = ?").bind(originalAsset.id).first(),
    ).toBeNull();
    expect(await env.R2.head(originalAsset.r2Key)).toBeNull();
    expect(
      await env.DB.prepare("SELECT mutation_token FROM groups WHERE id = ?")
        .bind(original.id)
        .first<{ mutation_token: string | null }>(),
    ).toEqual({ mutation_token: null });

    const followUp = await patchGroup(current, { title: "并发后的合法更新" });
    expect(followUp.status).toBe(200);
    expect(((await followUp.json()) as { data: AdminGroupDto }).data).toMatchObject({
      title: "并发后的合法更新",
      version: current.version + 1,
    });
  });

  it("rolls back the complete aggregate when a guarded association statement fails", async () => {
    const originalAsset = await uploadQrAsset(authHeaders);
    const original = await createGroup(authHeaders, {
      title: "回滚原始",
      tags: ["旧标签"],
      auditNotes: "旧备注",
      joinMethods: [
        { type: "group_number", value: "300001", sortOrder: 0 },
        { type: "qr_code", assetId: originalAsset.id, sortOrder: 1 },
      ],
    });
    await env.DB.prepare(
      `CREATE TRIGGER force_join_method_failure
       BEFORE INSERT ON join_methods
       WHEN NEW.value = 'force-batch-failure'
       BEGIN
         SELECT RAISE(ABORT, 'forced join method failure');
       END`,
    ).run();

    const response = await patchGroup(original, {
      title: "不应提交",
      tags: ["新标签"],
      auditNotes: "新备注",
      joinMethods: [{ type: "group_number", value: "force-batch-failure", sortOrder: 0 }],
    });
    expect(response.status).toBe(500);

    const current = await getAdminGroup(original.id);
    expect(current).toMatchObject({
      title: "回滚原始",
      tags: ["旧标签"],
      auditNotes: "旧备注",
      version: original.version,
    });
    expect(current.joinMethods).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "group_number", value: "300001" }),
        expect.objectContaining({ type: "qr_code", assetId: originalAsset.id }),
      ]),
    );
    expect(
      await env.DB.prepare("SELECT status, ref_count FROM assets WHERE id = ?")
        .bind(originalAsset.id)
        .first(),
    ).toMatchObject({ status: "ready", ref_count: 1 });
    expect(await env.R2.head(originalAsset.r2Key)).not.toBeNull();
    expect(
      await env.DB.prepare("SELECT mutation_token FROM groups WHERE id = ?")
        .bind(original.id)
        .first<{ mutation_token: string | null }>(),
    ).toEqual({ mutation_token: null });
  });
});
