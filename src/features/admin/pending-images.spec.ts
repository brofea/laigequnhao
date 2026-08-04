import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetInfo } from "@shared/contracts/asset";

const mocks = vi.hoisted(() => ({
  uploadLogoAsset: vi.fn(),
  uploadQrAsset: vi.fn(),
  purgeStagedAsset: vi.fn(),
}));

vi.mock("@/features/admin/api", () => mocks);

import { purgePendingAdminImages, stagePendingAdminImages } from "@/features/admin/pending-images";

function asset(id: string, purpose: AssetInfo["purpose"]): AssetInfo {
  return {
    id,
    purpose,
    r2Key: `${purpose}/${id}.webp`,
    contentType: "image/webp",
    byteLength: 128,
    width: 1,
    height: 1,
    status: "staged",
    publicUrl: `/api/v1/assets/${purpose}/${id}.webp`,
  };
}

const error = {
  code: "INTERNAL_ERROR" as const,
  message: "上传失败",
  kind: "server" as const,
  retryable: true,
};

describe("pending admin images", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.purgeStagedAsset.mockResolvedValue({ ok: true, data: { id: "purged" } });
  });

  it("按头像后二维码的顺序暂存，并返回 methodId 到资源的映射", async () => {
    const logo = asset("00000000-0000-0000-0000-000000000001", "logo");
    const qr = asset("00000000-0000-0000-0000-000000000002", "qr_code");
    mocks.uploadLogoAsset.mockResolvedValue({ ok: true, data: logo });
    mocks.uploadQrAsset.mockResolvedValue({ ok: true, data: qr });
    const logoBlob = new Blob(["logo"], { type: "image/webp" });
    const qrBlob = new Blob(["qr"], { type: "image/webp" });

    const result = await stagePendingAdminImages(
      { logo: logoBlob, qr: [{ methodId: "method-qr", blob: qrBlob }] },
      "csrf-token",
    );

    expect(result).toEqual({
      ok: true,
      data: { logo, qr: { "method-qr": qr }, stagedIds: [logo.id, qr.id] },
    });
    expect(mocks.uploadLogoAsset).toHaveBeenCalledWith(logoBlob, "csrf-token");
    expect(mocks.uploadQrAsset).toHaveBeenCalledWith(qrBlob, "csrf-token");
    expect(mocks.purgeStagedAsset).not.toHaveBeenCalled();
  });

  it("任一资源上传失败时清理本次已经暂存的对象", async () => {
    const logo = asset("00000000-0000-0000-0000-000000000011", "logo");
    const firstQr = asset("00000000-0000-0000-0000-000000000012", "qr_code");
    mocks.uploadLogoAsset.mockResolvedValue({ ok: true, data: logo });
    mocks.uploadQrAsset
      .mockResolvedValueOnce({ ok: true, data: firstQr })
      .mockResolvedValueOnce({ ok: false, error });

    const result = await stagePendingAdminImages(
      {
        logo: new Blob(["logo"], { type: "image/webp" }),
        qr: [
          { methodId: "method-1", blob: new Blob(["qr-1"], { type: "image/webp" }) },
          { methodId: "method-2", blob: new Blob(["qr-2"], { type: "image/webp" }) },
        ],
      },
      "csrf-token",
    );

    expect(result).toEqual({ ok: false, error });
    expect(mocks.purgeStagedAsset).toHaveBeenCalledTimes(2);
    expect(mocks.purgeStagedAsset).toHaveBeenCalledWith(logo.id, "csrf-token");
    expect(mocks.purgeStagedAsset).toHaveBeenCalledWith(firstQr.id, "csrf-token");
  });

  it("群组提交失败后的清理命令只针对本次暂存资源", async () => {
    await purgePendingAdminImages(["asset-1", "asset-2"], "csrf-token");

    expect(mocks.purgeStagedAsset).toHaveBeenCalledTimes(2);
    expect(mocks.purgeStagedAsset).toHaveBeenCalledWith("asset-1", "csrf-token");
    expect(mocks.purgeStagedAsset).toHaveBeenCalledWith("asset-2", "csrf-token");
  });
});
