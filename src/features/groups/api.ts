import { api } from "@/shared/api/client";
import type { ApiResponse } from "@shared/contracts/api";
import { listQuerySchema } from "@shared/contracts/pagination";
import { publicGroupDtoSchema, type PublicGroupDto } from "@shared/contracts/group";
import { likeToggleResponseSchema } from "@shared/contracts/like";
import {
  submissionRequestSchema,
  submissionReceiptSchema,
  type SubmissionRequest,
} from "@shared/contracts/submission";
import { z } from "zod";

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
  ApiResponse<{ items: PublicGroupDto[]; nextCursor: string | null; rotationWindow: string }>
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

export async function toggleLike(
  groupId: string,
  liked: boolean,
): Promise<ApiResponse<{ liked: boolean; likeCount: number }>> {
  if (liked) {
    return api.delete(`/groups/${groupId}/like`, likeToggleResponseSchema);
  }
  return api.put(`/groups/${groupId}/like`, likeToggleResponseSchema);
}

export async function submitGroup(
  input: SubmissionRequest,
): Promise<ApiResponse<{ id: string; title: string; status: string }>> {
  const validated = submissionRequestSchema.parse(input);
  return api.post("/submissions", submissionReceiptSchema, validated);
}
