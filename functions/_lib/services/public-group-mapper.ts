import {
  publicGroupDtoSchema,
  type AdminGroupDto,
  type PublicGroupDto,
} from "@shared/contracts/group";
import type { Env } from "../env";
import { createAssetService } from "./asset-service";
import { createR2Adapter } from "../adapters/r2-adapter";

/**
 * 把管理员 DTO 映射为公开 DTO。
 *
 * 解析 QR 加群方式的 asset URL/元数据，剔除全部管理端私有字段
 * （联系方式、审核备注、软删除、R2 key、版本号等）。
 */
export async function toPublicGroupDto(admin: AdminGroupDto, env: Env): Promise<PublicGroupDto> {
  const assetService = createAssetService(env.DB, env.R2, env);
  const r2Adapter = createR2Adapter(env.R2, env);

  const resolvedMethods = await Promise.all(
    admin.joinMethods.map(async (m) => {
      if (m.type === "qr_code" && m.assetId) {
        const url = await assetService.getPublicUrl(m.assetId);
        const meta = await assetService.getPublicMeta(m.assetId);
        return {
          ...m,
          qrCodeUrl: url ?? m.qrCodeUrl ?? undefined,
          qrCodeMeta: meta
            ? { width: meta.width, height: meta.height, byteLength: meta.byteLength }
            : m.qrCodeMeta,
        };
      }
      return m;
    }),
  );

  const {
    submissionContact: _submissionContact,
    auditNotes: _auditNotes,
    deletedAt: _deletedAt,
    deleteProgress: _deleteProgress,
    logoR2Key: _logoR2Key,
    version: _version,
    joinMethods: _joinMethods,
    lastPublishedAt: _lastPublishedAt,
    ...rest
  } = admin;

  return publicGroupDtoSchema.parse({
    ...rest,
    logoUrl: admin.logoR2Key ? r2Adapter.getPublicUrl(admin.logoR2Key) : null,
    joinMethods: resolvedMethods,
  });
}
