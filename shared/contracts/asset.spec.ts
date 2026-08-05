import { describe, expect, it } from "vitest";
import {
  ASSET_CONTENT_TYPES,
  ASSET_POLICIES,
  ASSET_UPLOAD_REQUEST_MAX_BYTES,
  assetPublicUrlSchema,
} from "./asset";

describe("asset purpose policies", () => {
  it("uses purpose-specific final formats and leaves multipart boundary headroom", () => {
    expect(ASSET_CONTENT_TYPES).toEqual({ logo: "image/png", qr_code: "image/jpeg" });
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
