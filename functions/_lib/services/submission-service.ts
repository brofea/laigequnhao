import type { SubmissionRequest } from "@shared/contracts/submission";
import type { SubmissionReadyAssetInput } from "../repositories/group-repository";
import type { R2Adapter } from "../adapters/r2-adapter";

/**
 * 由共享图片校验器返回的可信文件结果。
 *
 * route 不应从 multipart 的 filename、MIME、width 或 byteLength 构造此对象；
 * byteLength 在 service 中仍以 bytes.byteLength 为最终事实来源。
 */
export interface ValidatedSubmissionLogo {
  bytes: Uint8Array;
  width: number;
  height: number;
}

export interface SubmissionServiceOptions {
  r2Adapter?: R2Adapter;
  requestId?: string;
}

type SubmissionGroupRepository = Pick<
  ReturnType<typeof import("../repositories/group-repository").createGroupRepository>,
  "create" | "recordSubmissionAssetCleanup"
>;

export function createSubmissionService(
  groupRepo: SubmissionGroupRepository,
  rateLimitRepo: import("../repositories/rate-limit-repository").RateLimitRepository,
  options: SubmissionServiceOptions = {},
) {
  return {
    async submit(
      input: SubmissionRequest,
      clientKey: string,
      limitPerHour = 1,
      submission?: { logo?: ValidatedSubmissionLogo; requestId?: string },
    ): Promise<{ id: string; title: string }> {
      // 频率限制（PRD：单个 IP/设备每小时最多成功提交新群组 limitPerHour 次）
      const limited = await rateLimitRepo.checkLimit(
        `submission:${clientKey}`,
        limitPerHour,
        60 * 60 * 1000,
      );
      if (!limited) {
        throw new RateLimitError();
      }

      const requestId = submission?.requestId ?? options.requestId ?? "unknown";
      const logo = submission?.logo;

      if (!logo) {
        try {
          const result = await groupRepo.create({
            title: input.title,
            description: input.description,
            kind: input.kind,
            platform: input.platform,
            tags: input.tags ?? [],
            joinMethods: [
              ...(input.groupNumber ? [{ type: "group_number", value: input.groupNumber }] : []),
              ...(input.url ? [{ type: "url", value: input.url }] : []),
            ],
            contact: input.contact,
            notes: input.notes,
          });

          return { id: result.id, title: result.title };
        } catch {
          throw new SubmissionDependencyError("D1_WRITE_FAILED");
        }
      }

      const r2Adapter = options.r2Adapter;
      if (!r2Adapter) {
        throw new SubmissionDependencyError("R2_WRITE_FAILED");
      }

      const resourceId = crypto.randomUUID();
      const resourceKey = `logo/submission/${resourceId}.webp`;
      // Copy the view before handing it to R2 so a validator-backed subarray can
      // never upload bytes outside the validated file range.
      const uploadBytes = logo.bytes.slice();
      const byteLength = uploadBytes.byteLength;
      const readyAsset: SubmissionReadyAssetInput = {
        id: resourceId,
        r2Key: resourceKey,
        purpose: "logo",
        byteLength,
        width: logo.width,
        height: logo.height,
      };

      try {
        await r2Adapter.upload(resourceKey, uploadBytes.buffer as ArrayBuffer, "image/webp");
      } catch {
        throw new SubmissionDependencyError("R2_WRITE_FAILED");
      }

      try {
        const result = await groupRepo.create({
          title: input.title,
          description: input.description,
          kind: input.kind,
          platform: input.platform,
          tags: input.tags ?? [],
          joinMethods: [
            ...(input.groupNumber ? [{ type: "group_number", value: input.groupNumber }] : []),
            ...(input.url ? [{ type: "url", value: input.url }] : []),
          ],
          contact: input.contact,
          notes: input.notes,
          readyAsset,
        });

        return { id: result.id, title: result.title };
      } catch {
        const removed = await r2Adapter.compensateDelete(resourceKey, {
          requestId,
          resourceId,
        });

        if (!removed) {
          try {
            await groupRepo.recordSubmissionAssetCleanup({ ...readyAsset, requestId });
          } catch {
            // D1 也不可用时，结构化日志仍保留 request ID 和资源 key，供外部清理任务接管。
            console.error(
              JSON.stringify({
                level: "error",
                event: "submission.cleanup_record_failed",
                requestId,
                resourceId,
                resourceKey,
                dependency: "D1",
                errorCode: "D1_WRITE_FAILED",
              }),
            );
          }
          throw new SubmissionDependencyError("R2_COMPENSATION_FAILED");
        }

        throw new SubmissionDependencyError("D1_WRITE_FAILED");
      }
    },
  };
}

export class RateLimitError extends Error {
  constructor() {
    super("Too many requests");
    this.name = "RateLimitError";
  }
}

export type SubmissionDependencyCode =
  "R2_WRITE_FAILED" | "D1_WRITE_FAILED" | "R2_COMPENSATION_FAILED";

export class SubmissionDependencyError extends Error {
  constructor(public readonly dependencyCode: SubmissionDependencyCode) {
    super("Submission dependency unavailable");
    this.name = "SubmissionDependencyError";
  }
}
