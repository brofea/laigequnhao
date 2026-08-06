import type { SubmissionRequest } from "@shared/contracts/submission";
import type { SubmissionReadyAssetInput } from "../repositories/group-repository";
import type { R2Adapter } from "../adapters/r2-adapter";
import { getAssetContentType } from "@shared/contracts/asset";

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
      submission?: {
        logo?: ValidatedSubmissionLogo;
        qr?: ValidatedSubmissionLogo;
        requestId?: string;
      },
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
      const qr = submission?.qr;

      if (!logo && !qr) {
        try {
          const result = await groupRepo.create({
            title: input.title,
            description: input.description,
            kind: input.kind,
            platform: input.platform,
            tags: input.tags ?? [],
            joinMethods: buildTextJoinMethods(input),
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

      // 1. 上传全部资产（logo + 可选 qr）。任一上传失败时补偿已上传对象。
      const readyAssets: SubmissionReadyAssetInput[] = [];
      try {
        if (logo) {
          const resourceId = crypto.randomUUID();
          const resourceKey = `logo/submission/${resourceId}.png`;
          // Copy the view before handing it to R2 so a validator-backed subarray
          // can never upload bytes outside the validated file range.
          const uploadBytes = logo.bytes.slice();
          await r2Adapter.upload(
            resourceKey,
            uploadBytes.buffer as ArrayBuffer,
            getAssetContentType("logo"),
          );
          readyAssets.push({
            id: resourceId,
            r2Key: resourceKey,
            purpose: "logo",
            byteLength: uploadBytes.byteLength,
            width: logo.width,
            height: logo.height,
          });
        }
        if (qr) {
          const resourceId = crypto.randomUUID();
          const resourceKey = `qr_code/submission/${resourceId}.jpg`;
          const uploadBytes = qr.bytes.slice();
          await r2Adapter.upload(
            resourceKey,
            uploadBytes.buffer as ArrayBuffer,
            getAssetContentType("qr_code"),
          );
          readyAssets.push({
            id: resourceId,
            r2Key: resourceKey,
            purpose: "qr_code",
            byteLength: uploadBytes.byteLength,
            width: qr.width,
            height: qr.height,
          });
        }
      } catch {
        await compensateAssets(groupRepo, r2Adapter, readyAssets, requestId, "R2_WRITE_FAILED");
      }

      const qrAsset = readyAssets.find((asset) => asset.purpose === "qr_code");

      // 2. D1 聚合写入；失败时同步补偿删除全部已上传对象。
      try {
        const result = await groupRepo.create({
          title: input.title,
          description: input.description,
          kind: input.kind,
          platform: input.platform,
          tags: input.tags ?? [],
          joinMethods: [
            ...buildTextJoinMethods(input),
            ...(qrAsset ? [{ type: "qr_code" as const, assetId: qrAsset.id }] : []),
          ],
          contact: input.contact,
          notes: input.notes,
          readyAsset: readyAssets,
        });

        return { id: result.id, title: result.title };
      } catch {
        await compensateAssets(groupRepo, r2Adapter, readyAssets, requestId, "D1_WRITE_FAILED");
      }

      // 不可达：补偿删除恒抛出 SubmissionDependencyError。保留以帮助类型收窄。
      throw new SubmissionDependencyError("D1_WRITE_FAILED");
    },
  };
}

/**
 * 群号/链接文本加群方式。二维码（qr_code）由 readyAsset 关联，在调用方拼接。
 */
function buildTextJoinMethods(input: SubmissionRequest): {
  type: string;
  value?: string;
}[] {
  return [
    ...(input.groupNumber ? [{ type: "group_number", value: input.groupNumber }] : []),
    ...(input.url ? [{ type: "url", value: input.url }] : []),
  ];
}

/**
 * 上传/聚合失败后的补偿删除：逐个删除已上传对象；R2 删除失败的对象写入
 * delete_failed 清理记录（D1 也不可用时保留结构化日志供外部任务接管）。
 *
 * 恒抛出 SubmissionDependencyError：全部补偿成功时抛 failedDependency，
 * 存在补偿失败时抛 R2_COMPENSATION_FAILED。
 */
async function compensateAssets(
  groupRepo: SubmissionGroupRepository,
  r2Adapter: R2Adapter,
  readyAssets: SubmissionReadyAssetInput[],
  requestId: string,
  failedDependency: SubmissionDependencyCode,
): Promise<never> {
  let allRemoved = true;
  for (const readyAsset of readyAssets) {
    const removed = await r2Adapter.compensateDelete(readyAsset.r2Key, {
      requestId,
      resourceId: readyAsset.id,
    });
    if (!removed) {
      allRemoved = false;
      try {
        await groupRepo.recordSubmissionAssetCleanup({ ...readyAsset, requestId });
      } catch {
        // D1 也不可用时，结构化日志仍保留 request ID 和资源 key，供外部清理任务接管。
        console.error(
          JSON.stringify({
            level: "error",
            event: "submission.cleanup_record_failed",
            requestId,
            resourceId: readyAsset.id,
            resourceKey: readyAsset.r2Key,
            dependency: "D1",
            errorCode: "D1_WRITE_FAILED",
          }),
        );
      }
    }
  }
  throw new SubmissionDependencyError(allRemoved ? failedDependency : "R2_COMPENSATION_FAILED");
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
