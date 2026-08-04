import { describe, expect, it } from "vitest";
import { assetPublicUrlSchema } from "./asset";

describe("assetPublicUrlSchema", () => {
  it.each([
    "/api/v1/assets/logo/asset.webp",
    "/api/v1/assets/logo%2Fasset.webp",
    "https://assets.example.com/logo/asset.webp",
    "http://localhost:5173/assets/logo/asset.webp",
  ])("accepts %s", (value) => {
    expect(assetPublicUrlSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    "",
    "/assets/logo/asset.webp",
    "api/v1/assets/logo/asset.webp",
    "/api/v1/assets/",
    "/api/v1/assets/logo/asset.webp?download=1",
    "javascript:alert(1)",
    "ftp://assets.example.com/logo/asset.webp",
    "https://user:password@assets.example.com/logo/asset.webp",
  ])("rejects %s", (value) => {
    expect(assetPublicUrlSchema.safeParse(value).success).toBe(false);
  });
});
