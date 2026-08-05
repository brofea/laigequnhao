import { describe, expect, it } from "vitest";
import {
  ASSET_CONTENT_TYPE,
  ASSET_POLICIES,
  ASSET_UPLOAD_REQUEST_MAX_BYTES,
  assetPublicUrlSchema,
} from "./asset";

describe("asset PNG policy", () => {
  it("uses the agreed final PNG limits and leaves multipart boundary headroom", () => {
    expect(ASSET_CONTENT_TYPE).toBe("image/png");
    expect(ASSET_POLICIES.logo).toMatchObject({
      maxBytes: 128 * 1024,
      maxDimension: 128,
      preserveAlpha: true,
      opaque: false,
    });
    expect(ASSET_POLICIES.qr_code).toMatchObject({
      maxBytes: 1024 * 1024,
      maxDimension: 1024,
      preserveAlpha: false,
      opaque: true,
    });
    expect(ASSET_UPLOAD_REQUEST_MAX_BYTES).toBeGreaterThan(ASSET_POLICIES.qr_code.maxBytes);
  });
});

describe("assetPublicUrlSchema", () => {
  it.each([
    "/api/v1/assets/logo/asset.png",
    "/api/v1/assets/logo%2Fasset.png",
    "https://assets.example.com/logo/asset.png",
    "http://localhost:5173/assets/logo/asset.png",
  ])("accepts %s", (value) => {
    expect(assetPublicUrlSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    "",
    "/assets/logo/asset.png",
    "api/v1/assets/logo/asset.png",
    "/api/v1/assets/",
    "/api/v1/assets/logo/asset.png?download=1",
    "javascript:alert(1)",
    "ftp://assets.example.com/logo/asset.png",
    "https://user:password@assets.example.com/logo/asset.png",
  ])("rejects %s", (value) => {
    expect(assetPublicUrlSchema.safeParse(value).success).toBe(false);
  });
});
