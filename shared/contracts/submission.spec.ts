import { describe, it, expect } from "vitest";
import {
  submissionRequestSchema,
  SUBMISSION_LOGO_FORM_FIELD,
  SUBMISSION_QR_FORM_FIELD,
} from "./submission";

const validBody = {
  title: "测试提交群",
  kind: "interest" as const,
  platform: "qq",
  groupNumber: "123456",
};

describe("submissionRequestSchema · 群号 / 链接 / 二维码 refine", () => {
  it("接受仅群号提交", () => {
    expect(() => submissionRequestSchema.parse(validBody)).not.toThrow();
  });

  it("接受仅 HTTPS 链接提交", () => {
    expect(() =>
      submissionRequestSchema.parse({ ...validBody, groupNumber: undefined, url: "https://example.com/join" }),
    ).not.toThrow();
  });

  it("拒绝无群号、无链接、无二维码的提交", () => {
    expect(() =>
      submissionRequestSchema.parse({ ...validBody, groupNumber: undefined }),
    ).toThrow();
  });

  it("拒绝 qr=false 且无群号/链接的提交", () => {
    expect(() =>
      submissionRequestSchema.parse({ ...validBody, groupNumber: undefined, qr: false }),
    ).toThrow();
  });

  it("接受仅二维码标记（qr=true）提交，无需群号或链接", () => {
    expect(() =>
      submissionRequestSchema.parse({ ...validBody, groupNumber: undefined, qr: true }),
    ).not.toThrow();
  });

  it("接受 qr=true 与群号同时存在", () => {
    expect(() => submissionRequestSchema.parse({ ...validBody, qr: true })).not.toThrow();
  });

  it("qr 字段为可选：旧请求（无 qr 字段）保持兼容", () => {
    const parsed = submissionRequestSchema.parse(validBody);
    expect(parsed.qr).toBeUndefined();
  });

  it("SUBMISSION_QR_FORM_FIELD 与 multipart 字段名一致", () => {
    expect(SUBMISSION_LOGO_FORM_FIELD).toBe("logo");
    expect(SUBMISSION_QR_FORM_FIELD).toBe("qr");
  });
});
