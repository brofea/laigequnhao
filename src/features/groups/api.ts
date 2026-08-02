import { api, type ClientError } from "@/shared/api/client";
import { listQuerySchema } from "@shared/contracts/pagination";
import { publicGroupDtoSchema, type PublicGroupDto } from "@shared/contracts/group";
import { likeToggleResponseSchema } from "@shared/contracts/like";
import { discoverResponseSchema } from "@shared/contracts/discover";
import { tagStatsResponseSchema, type TagStatsResponse } from "@shared/contracts/tags";
import { publicBoardsResponseSchema, type BoardWithGroups } from "@shared/contracts/board";
import {
  submissionRequestSchema,
  submissionReceiptSchema,
  type SubmissionRequest,
} from "@shared/contracts/submission";
import { z } from "zod";

type ApiErrorResult = { ok: false; error: ClientError; requestId?: string };
type ApiOkResult<T> = { ok: true; data: T };

const cursorPageResponseSchema = z.object({
  items: z.array(publicGroupDtoSchema),
  nextCursor: z.string().nullable(),
  rotationWindow: z.string(),
});

export async function fetchGroups(params: {
  q?: string;
  cursor?: string | null;
  limit?: number;
  signal?: AbortSignal;
}): Promise<
  | ApiOkResult<{ items: PublicGroupDto[]; nextCursor: string | null; rotationWindow: string }>
  | ApiErrorResult
> {
  const query = listQuerySchema.parse({
    q: params.q,
    cursor: params.cursor,
    limit: params.limit,
  });
  const qs = new URLSearchParams();
  if (query.q) qs.set("q", query.q);
  if (query.cursor) qs.set("cursor", query.cursor);
  qs.set("limit", String(query.limit));

  return api.get(`/groups?${qs.toString()}`, cursorPageResponseSchema, undefined, params.signal);
}

/** 发现新群：最近进入 published 的群组，最多 10 条 */
export async function fetchDiscover(
  signal?: AbortSignal,
): Promise<ApiOkResult<{ items: PublicGroupDto[] }> | ApiErrorResult> {
  return api.get("/discover", discoverResponseSchema, undefined, signal);
}

/** 标签聚合：只统计已发布群组 */
export async function fetchTags(
  signal?: AbortSignal,
): Promise<ApiOkResult<TagStatsResponse> | ApiErrorResult> {
  return api.get("/tags", tagStatsResponseSchema, undefined, signal);
}

/** 公开板块：启用板块及其已发布成员 */
export async function fetchPublicBoards(
  signal?: AbortSignal,
): Promise<ApiOkResult<{ boards: BoardWithGroups[] }> | ApiErrorResult> {
  return api.get("/boards", publicBoardsResponseSchema, undefined, signal);
}

/** 公开详情深链：不存在/下架/回收站统一 NOT_FOUND */
export async function fetchGroupDetail(
  id: string,
  signal?: AbortSignal,
): Promise<ApiOkResult<PublicGroupDto> | ApiErrorResult> {
  return api.get(`/groups/${encodeURIComponent(id)}`, publicGroupDtoSchema, undefined, signal);
}

export async function toggleLike(
  groupId: string,
  liked: boolean,
): Promise<ApiOkResult<{ liked: boolean; likeCount: number }> | ApiErrorResult> {
  if (liked) {
    return api.delete(`/groups/${groupId}/like`, likeToggleResponseSchema);
  }
  return api.put(`/groups/${groupId}/like`, likeToggleResponseSchema);
}

export async function submitGroup(
  input: SubmissionRequest,
): Promise<ApiOkResult<{ id: string; title: string; status: string }> | ApiErrorResult> {
  const validated = submissionRequestSchema.parse(input);
  return api.post("/submissions", submissionReceiptSchema, validated);
}
