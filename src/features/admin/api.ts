import { api } from "@/shared/api/client";
import { assetInfoSchema, type AssetInfo } from "@shared/contracts/asset";
import { sessionResponseSchema, sessionStatusSchema } from "@shared/contracts/auth";
import {
  adminGroupDtoSchema,
  adminGroupPageResponseSchema,
  adminGroupPageQuerySchema,
  groupCreateSchema,
  groupUpdateSchema,
  type AdminGroupDto,
  type AdminGroupPageResponse,
  type GroupCreateInput,
  type GroupUpdateInput,
} from "@shared/contracts/group";
import {
  adminBoardListResponseSchema,
  boardCreateSchema,
  boardMemberAddSchema,
  boardMemberListResponseSchema,
  boardMemberMoveSchema,
  boardReorderSchema,
  boardUpdateSchema,
  type BoardDto,
  type BoardMemberDto,
  type BoardCreateInput,
  type BoardUpdateInput,
  type BoardReorderInput,
  type BoardMemberAddInput,
  type BoardMemberMoveInput,
} from "@shared/contracts/board";
import { z } from "zod";

const assetDeleteResponseSchema = z.object({ id: z.string().uuid() });

type ApiErrorResult = {
  ok: false;
  error: import("@/shared/api/client").ClientError;
  requestId?: string;
};
type ApiOkResult<T> = { ok: true; data: T };

export async function login(
  password: string,
): Promise<ApiOkResult<{ csrfToken: string; expiresAt: string }> | ApiErrorResult> {
  return api.post("/admin/session", sessionResponseSchema, { password });
}

export async function checkSession(): Promise<
  ApiOkResult<{ authenticated: boolean; csrfToken: string; expiresAt: string }> | ApiErrorResult
> {
  return api.get("/admin/session", sessionStatusSchema);
}

export async function logout(): Promise<
  ApiOkResult<{ authenticated: boolean; csrfToken: string; expiresAt: string }> | ApiErrorResult
> {
  return api.delete("/admin/session", sessionStatusSchema);
}

async function uploadAsset(
  blob: Blob,
  purpose: "logo" | "qr_code",
  filename: string,
  csrfToken: string,
): Promise<ApiOkResult<AssetInfo> | ApiErrorResult> {
  const formData = new FormData();
  formData.append("file", blob, filename);
  formData.append("purpose", purpose);
  return api.postForm("/admin/assets", assetInfoSchema, formData, {
    "X-CSRF-Token": csrfToken,
  });
}

export function uploadQrAsset(
  blob: Blob,
  csrfToken: string,
): Promise<ApiOkResult<AssetInfo> | ApiErrorResult> {
  return uploadAsset(blob, "qr_code", "qr.png", csrfToken);
}

export async function uploadLogoAsset(
  blob: Blob,
  csrfToken: string,
): Promise<ApiOkResult<AssetInfo> | ApiErrorResult> {
  return uploadAsset(blob, "logo", "logo.png", csrfToken);
}

export async function purgeStagedAsset(
  assetId: string,
  csrfToken: string,
): Promise<ApiOkResult<{ id: string }> | ApiErrorResult> {
  return api.delete(
    `/admin/assets/${encodeURIComponent(assetId)}?mode=purge`,
    assetDeleteResponseSchema,
    { "X-CSRF-Token": csrfToken },
  );
}

// ─── 管理群组（页码分页，T04 契约）────────────────────────

export interface AdminGroupsQuery {
  statuses?: string[];
  deleted?: boolean;
  q?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  signal?: AbortSignal;
}

export async function fetchAdminGroupsPage(
  params: AdminGroupsQuery,
): Promise<ApiOkResult<AdminGroupPageResponse> | ApiErrorResult> {
  const query = adminGroupPageQuerySchema.parse({
    statuses: params.statuses ?? [],
    deleted: params.deleted ?? false,
    q: params.q,
    sortBy: params.sortBy,
    sortDir: params.sortDir ?? "desc",
    page: params.page ?? 1,
  });
  const qs = new URLSearchParams();
  for (const status of query.statuses) qs.append("status", status);
  if (query.deleted) qs.set("deleted", "true");
  if (query.q) qs.set("q", query.q);
  if (query.sortBy) qs.set("sortBy", query.sortBy);
  qs.set("sortDir", query.sortDir);
  qs.set("page", String(query.page));

  return api.get(`/admin?${qs.toString()}`, adminGroupPageResponseSchema, undefined, params.signal);
}

export async function createAdminGroup(
  input: GroupCreateInput,
  csrfToken: string,
): Promise<ApiOkResult<AdminGroupDto> | ApiErrorResult> {
  const payload = groupCreateSchema.parse(input);
  return api.post("/admin", adminGroupDtoSchema, payload, { "X-CSRF-Token": csrfToken });
}

export async function updateAdminGroup(
  id: string,
  input: GroupUpdateInput,
  csrfToken: string,
): Promise<ApiOkResult<AdminGroupDto> | ApiErrorResult> {
  const payload = groupUpdateSchema.parse(input);
  return api.patch(`/admin/${encodeURIComponent(id)}`, adminGroupDtoSchema, payload, {
    "X-CSRF-Token": csrfToken,
  });
}

export async function softDeleteGroup(
  id: string,
  csrfToken: string,
): Promise<ApiOkResult<{ id: string }> | ApiErrorResult> {
  return api.delete(`/admin/${encodeURIComponent(id)}`, z.object({ id: z.string().uuid() }), {
    "X-CSRF-Token": csrfToken,
  });
}

export async function restoreGroup(
  id: string,
  csrfToken: string,
): Promise<ApiOkResult<AdminGroupDto> | ApiErrorResult> {
  return api.post(
    `/admin/${encodeURIComponent(id)}/restore`,
    adminGroupDtoSchema,
    {},
    { "X-CSRF-Token": csrfToken },
  );
}

export async function permanentDeleteGroup(
  id: string,
  csrfToken: string,
): Promise<ApiOkResult<{ id: string; purgeState: string }> | ApiErrorResult> {
  return api.delete(
    `/admin/trash/groups/${encodeURIComponent(id)}`,
    z.object({ id: z.string().uuid(), purgeState: z.string() }),
    { "X-CSRF-Token": csrfToken },
  );
}

// ─── 管理板块（T04 契约）─────────────────────────────────

export async function fetchAdminBoards(
  signal?: AbortSignal,
): Promise<ApiOkResult<{ boards: BoardDto[] }> | ApiErrorResult> {
  return api.get("/admin/boards", adminBoardListResponseSchema, undefined, signal);
}

export async function createAdminBoard(
  input: BoardCreateInput,
  csrfToken: string,
): Promise<ApiOkResult<{ boards: BoardDto[] }> | ApiErrorResult> {
  const payload = boardCreateSchema.parse(input);
  return api.post("/admin/boards", adminBoardListResponseSchema, payload, {
    "X-CSRF-Token": csrfToken,
  });
}

export async function updateAdminBoard(
  id: string,
  input: BoardUpdateInput,
  csrfToken: string,
): Promise<ApiOkResult<{ boards: BoardDto[] }> | ApiErrorResult> {
  const payload = boardUpdateSchema.parse(input);
  return api.patch(
    `/admin/boards/${encodeURIComponent(id)}`,
    adminBoardListResponseSchema,
    payload,
    {
      "X-CSRF-Token": csrfToken,
    },
  );
}

export async function deleteAdminBoard(
  id: string,
  csrfToken: string,
): Promise<ApiOkResult<{ boards: BoardDto[] }> | ApiErrorResult> {
  return api.delete(`/admin/boards/${encodeURIComponent(id)}`, adminBoardListResponseSchema, {
    "X-CSRF-Token": csrfToken,
  });
}

export async function reorderAdminBoards(
  input: BoardReorderInput,
  csrfToken: string,
): Promise<ApiOkResult<{ boards: BoardDto[] }> | ApiErrorResult> {
  const payload = boardReorderSchema.parse(input);
  return api.post("/admin/boards/reorder", adminBoardListResponseSchema, payload, {
    "X-CSRF-Token": csrfToken,
  });
}

export async function fetchBoardMembers(
  boardId: string,
  signal?: AbortSignal,
): Promise<ApiOkResult<{ members: BoardMemberDto[] }> | ApiErrorResult> {
  return api.get(
    `/admin/boards/${encodeURIComponent(boardId)}/members`,
    boardMemberListResponseSchema,
    undefined,
    signal,
  );
}

export async function addBoardMember(
  boardId: string,
  input: BoardMemberAddInput,
  csrfToken: string,
): Promise<ApiOkResult<{ members: BoardMemberDto[] }> | ApiErrorResult> {
  const payload = boardMemberAddSchema.parse(input);
  return api.post(
    `/admin/boards/${encodeURIComponent(boardId)}/members`,
    boardMemberListResponseSchema,
    payload,
    { "X-CSRF-Token": csrfToken },
  );
}

export async function removeBoardMember(
  boardId: string,
  groupId: string,
  csrfToken: string,
): Promise<ApiOkResult<{ members: BoardMemberDto[] }> | ApiErrorResult> {
  return api.delete(
    `/admin/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(groupId)}`,
    boardMemberListResponseSchema,
    { "X-CSRF-Token": csrfToken },
  );
}

export async function moveBoardMember(
  boardId: string,
  groupId: string,
  input: BoardMemberMoveInput,
  csrfToken: string,
): Promise<ApiOkResult<{ members: BoardMemberDto[] }> | ApiErrorResult> {
  const payload = boardMemberMoveSchema.parse(input);
  return api.post(
    `/admin/boards/${encodeURIComponent(boardId)}/members/${encodeURIComponent(groupId)}/move`,
    boardMemberListResponseSchema,
    payload,
    { "X-CSRF-Token": csrfToken },
  );
}
