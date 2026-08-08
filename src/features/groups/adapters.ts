import type { AdminGroupDto, PublicGroupDto } from "@shared/contracts/group";
import type { BoardWithGroups } from "@shared/contracts/board";
import type { BoardDto, BoardMemberDto } from "@shared/contracts/board";
import type { DemoBoard, DemoGroup } from "@/data/fixtures";

/**
 * 服务端 DTO → 冻结视图模型（DemoGroup/DemoBoard）适配器。
 *
 * 组件不直接理解数据库字段或管理端私有字段；后端字段变更只影响本文件。
 * 公开数据只从公开 DTO 进入；管理端私有字段（联系方式、审核备注、R2 key 等）
 * 不进入任何公开 view-model。
 */

export type LikeStateSource = {
  get(groupId: string): { liked: boolean; likes: number } | undefined;
  isLiked(groupId: string): boolean;
};

/** 加群方式展示顺序：群号 → 邀请链接 → 二维码（PRD 补充要求，展示与存储解耦） */
const JOIN_METHOD_ORDER: Record<string, number> = { number: 0, link: 1, qr: 2 };

export function toDemoGroup(
  group: PublicGroupDto | AdminGroupDto,
  likeState: LikeStateSource,
): DemoGroup {
  const local = likeState.get(group.id);
  const joinMethods: DemoGroup["joinMethods"] = group.joinMethods
    .map<DemoGroup["joinMethods"][number]>((method, index) => {
      if (method.type === "qr_code") {
        const assetId = "assetId" in method ? (method.assetId ?? undefined) : undefined;
        const previewUrl =
          "assetUrl" in method ? (method.assetUrl ?? method.qrCodeUrl) : method.qrCodeUrl;
        return {
          id: `${group.id}-method-${String(index)}`,
          type: "qr",
          label: "二维码",
          value: previewUrl ?? assetId ?? "",
          assetId,
          imagePreviewUrl: previewUrl ?? undefined,
        };
      }
      return {
        id: `${group.id}-method-${String(index)}`,
        type: method.type === "group_number" ? "number" : "link",
        label: method.type === "group_number" ? "群号" : "邀请链接",
        value: method.value ?? method.url ?? "",
      };
    })
    .sort((a, b) => (JOIN_METHOD_ORDER[a.type] ?? 9) - (JOIN_METHOD_ORDER[b.type] ?? 9));
  return {
    id: group.id,
    title: group.title,
    platform: group.platform,
    kind: group.kind,
    description: group.description,
    tags: group.tags,
    likes: local?.likes ?? group.likeCount,
    liked: local?.liked ?? likeState.isLiked(group.id),
    avatarState: group.logoUrl ? "ready" : "missing",
    logoR2Key: "logoR2Key" in group ? group.logoR2Key : undefined,
    logoUrl: group.logoUrl ?? null,
    status: group.status,
    inRecycleBin: "deletedAt" in group ? group.deletedAt !== null : false,
    contact: "submissionContact" in group ? group.submissionContact : undefined,
    auditNotes: "auditNotes" in group ? group.auditNotes : undefined,
    joinMethods,
  };
}

/** 公开板块 → DemoBoard（只含已发布成员，板块启用的由服务端保证） */
export function toDemoBoardPublic(board: BoardWithGroups): DemoBoard {
  return {
    id: board.id,
    title: board.title,
    description: "",
    enabled: true,
    memberCount: board.groups.length,
    members: board.groups.map((group) => group.id),
  };
}

/** 管理板块 → DemoBoard（含全部成员，含已下架；启用状态来自服务端） */
export function toDemoBoardAdmin(board: BoardDto, members: BoardMemberDto[]): DemoBoard {
  return {
    id: board.id,
    title: board.title,
    description: "",
    enabled: board.isEnabled,
    memberCount: board.memberCount,
    members: members.map((member) => member.groupId),
  };
}
