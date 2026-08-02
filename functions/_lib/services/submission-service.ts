import type { SubmissionRequest } from "@shared/contracts/submission";
import type { GroupRepository } from "../repositories/group-repository";
import type { RateLimitRepository } from "../repositories/rate-limit-repository";

export function createSubmissionService(
  groupRepo: ReturnType<typeof import("../repositories/group-repository").createGroupRepository>,
  rateLimitRepo: RateLimitRepository,
) {
  return {
    async submit(
      input: SubmissionRequest,
      clientKey: string,
    ): Promise<{ id: string; title: string }> {
      // 频率限制（PRD：单个 IP/设备每小时最多成功提交新群组 1 次）
      const limited = await rateLimitRepo.checkLimit(`submission:${clientKey}`, 1, 60 * 60 * 1000);
      if (!limited) {
        throw new RateLimitError();
      }

      // 写入 D1
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
    },
  };
}

export class RateLimitError extends Error {
  constructor() {
    super("Too many requests");
    this.name = "RateLimitError";
  }
}
