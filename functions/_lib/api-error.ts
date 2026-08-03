import { apiErrorSchema } from "@shared/contracts/api";

/** 构建统一的依赖不可用错误信封，不包含 Secret 值或底层异常。 */
export function dependencyUnavailable(requestId: string, message: string) {
  return apiErrorSchema.parse({
    ok: false,
    error: { code: "DEPENDENCY_UNAVAILABLE", message },
    requestId,
  });
}
