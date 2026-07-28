import type { StatusCode } from "hono/utils/http-status";

export function errorHandler() {
  return (
    err: Error,
    c: { json: (body: unknown, status?: StatusCode) => Response; get: (key: string) => unknown },
  ) => {
    console.error("[api-error]", err.message);
    const requestId = (c.get("requestId") as string) ?? "unknown";
    return c.json(
      {
        ok: false,
        error: {
          code: "INTERNAL_ERROR",
          message: "An unexpected error occurred.",
        },
        requestId,
      },
      500,
    );
  };
}
