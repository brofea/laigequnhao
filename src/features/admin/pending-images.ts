import { purgeStagedAsset, uploadLogoAsset, uploadQrAsset } from "@/features/admin/api";
import type { ClientError } from "@/shared/api/client";
import type { AssetInfo } from "@shared/contracts/asset";

export type PendingQrImage = {
  methodId: string;
  blob: Blob;
};

export type PendingAdminImages = {
  logo?: Blob;
  qr: PendingQrImage[];
};

export type StagedAdminImages = {
  logo: AssetInfo | null;
  qr: Record<string, AssetInfo>;
  stagedIds: string[];
};

type PendingImageUploadResult =
  { ok: true; data: StagedAdminImages } | { ok: false; error: ClientError; requestId?: string };

async function purgeAssets(assetIds: string[], csrfToken: string): Promise<void> {
  await Promise.allSettled(assetIds.map((assetId) => purgeStagedAsset(assetId, csrfToken)));
}

/**
 * 将编辑表单暂存的图片按一次保存动作上传到 R2。
 * 任一上传失败时，清理本次已上传的对象，避免留下孤立资产。
 */
export async function stagePendingAdminImages(
  pending: PendingAdminImages,
  csrfToken: string,
): Promise<PendingImageUploadResult> {
  const stagedIds: string[] = [];
  let logo: AssetInfo | null = null;
  const qr: Record<string, AssetInfo> = {};

  const handleFailure = async (result: {
    ok: false;
    error: ClientError;
    requestId?: string;
  }): Promise<PendingImageUploadResult> => {
    await purgeAssets(stagedIds, csrfToken);
    return { ok: false, error: result.error, requestId: result.requestId };
  };

  if (pending.logo) {
    const result = await uploadLogoAsset(pending.logo, csrfToken);
    if (!result.ok) return handleFailure(result);
    logo = result.data;
    stagedIds.push(result.data.id);
  }

  for (const pendingQr of pending.qr) {
    const result = await uploadQrAsset(pendingQr.blob, csrfToken);
    if (!result.ok) return handleFailure(result);
    qr[pendingQr.methodId] = result.data;
    stagedIds.push(result.data.id);
  }

  return { ok: true, data: { logo, qr, stagedIds } };
}

/** 保存群组失败时，回收本次保存动作产生的暂存资产。 */
export async function purgePendingAdminImages(
  stagedIds: string[],
  csrfToken: string,
): Promise<void> {
  await purgeAssets(stagedIds, csrfToken);
}
