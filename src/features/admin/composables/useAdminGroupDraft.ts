import { ref, computed, watch, onUnmounted, type Ref } from "vue";
import type { AdminGroupDto } from "@shared/contracts/group";
import type { GroupCreateInput, GroupUpdateInput } from "@shared/contracts/group";
import type { GroupKind, GroupStatus, JoinMethod } from "@shared/domain";
import siteConfig from "@/../site.config";
import type { PlatformConfig } from "@shared/domain";

// ─── 草稿类型（扩展 DTO，加入 client key 用于动态列表）───

export interface DraftJoinMethod {
  clientKey: string;
  type: JoinMethod;
  value: string;
  url: string;
  assetId: string | null;
  /** 预览用 URL（新上传使用本地 Object URL，已有资源使用远端 URL） */
  assetUrl: string | null;
  sortOrder: number;
}

export interface DraftState {
  title: string;
  description: string;
  kind: GroupKind;
  platform: string;
  status: GroupStatus;
  tags: string[];
  joinMethods: DraftJoinMethod[];
  auditNotes: string | null;
  submissionContact: string | null;
  version: number;
  /** 新上传的 logo Blob（未保存状态），null 表示无新上传 */
  logoBlob: Blob | null;
  /** 是否已删除已有 logo（编辑模式） */
  logoRemoved: boolean;
}

let clientKeyCounter = 0;
function nextClientKey(): string {
  return `draft-${String(++clientKeyCounter)}-${String(Date.now())}`;
}

function dtoToDraft(dto: AdminGroupDto): DraftState {
  return {
    title: dto.title,
    description: dto.description,
    kind: dto.kind,
    platform: dto.platform,
    status: dto.status,
    tags: [...dto.tags],
    joinMethods: dto.joinMethods.map((m, i) => ({
      clientKey: nextClientKey(),
      type: m.type,
      value: m.value ?? "",
      url: m.url ?? "",
      assetId: m.assetId ?? null,
      assetUrl: m.assetUrl ?? m.qrCodeUrl ?? null,
      sortOrder: i,
    })),
    auditNotes: dto.auditNotes,
    submissionContact: dto.submissionContact,
    version: dto.version,
    logoBlob: null,
    logoRemoved: false,
  };
}

function emptyDraft(): DraftState {
  return {
    title: "",
    description: "",
    kind: "interest",
    platform: siteConfig.platforms[0]?.id ?? "",
    status: "pending",
    tags: [],
    joinMethods: [
      {
        clientKey: nextClientKey(),
        type: "group_number",
        value: "",
        url: "",
        assetId: null,
        assetUrl: null,
        sortOrder: 0,
      },
    ],
    auditNotes: null,
    submissionContact: null,
    version: 0,
    logoBlob: null,
    logoRemoved: false,
  };
}

export function useAdminGroupDraft(group: Ref<AdminGroupDto | null>) {
  // ── 核心状态 ──
  const draft = ref<DraftState>(emptyDraft());
  const originalJson = ref<string>("");
  const fieldErrors = ref<Record<string, string[]>>({});

  // ── Logo 预览（需在 watch 之前定义，因为 watch 回调中引用）──
  const logoPreviewUrl = ref<string | null>(null);

  /** 撤销当前 object URL（如果存在），避免内存泄漏 */
  function revokeLogoPreview() {
    if (logoPreviewUrl.value && logoPreviewUrl.value.startsWith("blob:")) {
      URL.revokeObjectURL(logoPreviewUrl.value);
    }
    logoPreviewUrl.value = null;
  }

  // 当 group 变化时重置草稿
  watch(
    () => group.value,
    (g) => {
      revokeLogoPreview();
      if (g) {
        draft.value = dtoToDraft(g);
        originalJson.value = JSON.stringify(draft.value);
        if (g.logoUrl) logoPreviewUrl.value = g.logoUrl;
      } else {
        draft.value = emptyDraft();
        originalJson.value = JSON.stringify(draft.value);
      }
      fieldErrors.value = {};
    },
    { immediate: true },
  );

  // ── 派生状态 ──

  const isCreate = computed(() => group.value === null);

  const isDirty = computed(() => {
    return JSON.stringify(draft.value) !== originalJson.value;
  });

  const currentPlatform = computed<PlatformConfig | undefined>(() => {
    return siteConfig.platforms.find((p) => p.id === draft.value.platform);
  });

  // ── Logo 操作 ──

  /** 当前 Logo 的展示 URL（ref 驱动，不在 computed 内调用 createObjectURL） */
  const logoUrl = computed(() => logoPreviewUrl.value);

  /** 设置新 Logo（上传回调） */
  function setLogo(blob: Blob) {
    revokeLogoPreview();
    logoPreviewUrl.value = URL.createObjectURL(blob);
    draft.value.logoBlob = blob;
    draft.value.logoRemoved = false;
  }

  /** 删除 Logo（编辑模式） */
  function removeLogo() {
    revokeLogoPreview();
    draft.value.logoBlob = null;
    draft.value.logoRemoved = true;
  }

  onUnmounted(() => {
    revokeLogoPreview();
  });

  /** 强制重置草稿（新建模式重新打开时调用） */
  function resetDraft() {
    revokeLogoPreview();
    draft.value = emptyDraft();
    originalJson.value = JSON.stringify(draft.value);
    fieldErrors.value = {};
  }

  // ── 标签操作 ──

  const tagError = computed<string | null>(() => {
    const tags = draft.value.tags.filter((t) => t.trim().length > 0);
    if (tags.length > 5) return "最多 5 个标签";
    const seen = new Set<string>();
    for (const t of tags) {
      if (seen.has(t.toLowerCase())) return "标签存在重复";
      seen.add(t.toLowerCase());
    }
    return null;
  });

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (draft.value.tags.length >= 5) return;
    const lower = trimmed.toLowerCase();
    if (draft.value.tags.some((t) => t.toLowerCase() === lower)) return;
    draft.value.tags = [...draft.value.tags, trimmed];
  }

  function removeTag(index: number) {
    draft.value.tags = draft.value.tags.filter((_, i) => i !== index);
  }

  function moveTag(index: number, direction: "up" | "down") {
    const tags = [...draft.value.tags];
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= tags.length) return;
    [tags[index], tags[target]] = [tags[target] as string, tags[index] as string];
    draft.value.tags = tags;
  }

  // ── 加群方式操作 ──

  const joinMethodError = computed<string | null>(() => {
    if (draft.value.joinMethods.length === 0) return "至少需要一个加群方式";
    if (draft.value.joinMethods.some((m) => m.type === "qr_code" && !m.assetId)) {
      return "请上传二维码图片";
    }

    // 检查完全重复
    const keys = draft.value.joinMethods.map((m) => {
      if (m.type === "group_number") return `${m.type}:${m.value}`;
      if (m.type === "url") return `${m.type}:${m.url}`;
      return `${m.type}:${m.assetId ?? ""}`;
    });
    if (new Set(keys).size !== keys.length) return "加群方式存在完全重复的项";

    return null;
  });

  /** QR 二维码加群方式存在但未上传图片时为 true */
  const qrImageMissing = computed(() => {
    return draft.value.joinMethods.some((m) => m.type === "qr_code" && !m.assetId);
  });

  function addJoinMethod(type: JoinMethod) {
    draft.value.joinMethods = [
      ...draft.value.joinMethods,
      {
        clientKey: nextClientKey(),
        type,
        value: "",
        url: "",
        assetId: null,
        assetUrl: null,
        sortOrder: draft.value.joinMethods.length,
      },
    ];
  }

  function removeJoinMethod(clientKey: string) {
    if (draft.value.joinMethods.length <= 1) return;
    draft.value.joinMethods = draft.value.joinMethods
      .filter((m) => m.clientKey !== clientKey)
      .map((m, i) => ({ ...m, sortOrder: i }));
  }

  function updateJoinMethod(clientKey: string, patch: Partial<DraftJoinMethod>) {
    const idx = draft.value.joinMethods.findIndex((m) => m.clientKey === clientKey);
    if (idx === -1) return;
    const updated = [...draft.value.joinMethods];
    const current = updated[idx];
    if (!current) return;
    updated[idx] = { ...current, ...patch };
    draft.value.joinMethods = updated;
  }

  function moveJoinMethod(clientKey: string, direction: "up" | "down") {
    const idx = draft.value.joinMethods.findIndex((m) => m.clientKey === clientKey);
    if (idx === -1) return;
    const target = direction === "up" ? idx - 1 : idx + 1;
    if (target < 0 || target >= draft.value.joinMethods.length) return;
    const methods = [...draft.value.joinMethods];
    const a = methods[target];
    const b = methods[idx];
    if (!a || !b) return;
    [methods[idx], methods[target]] = [a, b];
    draft.value.joinMethods = methods.map((m, i) => ({ ...m, sortOrder: i }));
  }

  // ── 保存数据转换 ──

  function toCreateInput(logo?: {
    logoR2Key?: string | null;
    adoptAssetIds?: string[];
  }): GroupCreateInput {
    const input: GroupCreateInput = {
      title: draft.value.title,
      description: draft.value.description,
      kind: draft.value.kind,
      platform: draft.value.platform,
      status: draft.value.status,
      tags: draft.value.tags,
      joinMethods: draft.value.joinMethods.map((m, i) => {
        const base = { sortOrder: i };
        if (m.type === "group_number") {
          return { type: "group_number" as const, value: m.value, ...base };
        }
        if (m.type === "url") {
          return { type: "url" as const, url: m.url, ...base };
        }
        return {
          type: "qr_code" as const,
          assetId: m.assetId ?? "",
          ...base,
        };
      }),
      auditNotes: draft.value.auditNotes,
    };
    // Logo 处理：有删除标记 → null；有上传 → r2Key；无变化 → 不传
    if (draft.value.logoRemoved) {
      input.logoR2Key = null;
    } else if (logo?.logoR2Key) {
      input.logoR2Key = logo.logoR2Key;
      input.adoptAssetIds = logo.adoptAssetIds ?? [];
    }
    return input;
  }

  function toUpdateInput(logo?: {
    logoR2Key?: string | null;
    adoptAssetIds?: string[];
  }): GroupUpdateInput {
    const create = toCreateInput(logo);
    return {
      ...create,
      version: draft.value.version,
    };
  }

  // ── 错误处理 ──

  function setFieldErrors(errors: Record<string, string[]>) {
    fieldErrors.value = errors;
  }

  function clearFieldErrors() {
    fieldErrors.value = {};
  }

  return {
    // state
    draft,
    fieldErrors,
    // derived
    isCreate,
    isDirty,
    currentPlatform,
    // logo
    logoBlob: computed(() => draft.value.logoBlob),
    logoRemoved: computed(() => draft.value.logoRemoved),
    logoUrl,
    setLogo,
    removeLogo,
    resetDraft,
    // tag
    tagError,
    addTag,
    removeTag,
    moveTag,
    // join method
    joinMethodError,
    qrImageMissing,
    addJoinMethod,
    removeJoinMethod,
    updateJoinMethod,
    moveJoinMethod,
    // save
    toCreateInput,
    toUpdateInput,
    // error
    setFieldErrors,
    clearFieldErrors,
  };
}
