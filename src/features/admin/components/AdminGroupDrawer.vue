<script setup lang="ts">
import { ref, watch, computed, nextTick, onBeforeUnmount } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import type { AdminGroupDto } from "@shared/contracts/group";
import { useAdminGroupDraft } from "../composables/useAdminGroupDraft";
import { useImageProcessor } from "../composables/useImageProcessor";
import { LOGO_MAX_BYTES } from "@shared/contracts/asset";
import AdminGroupFields from "./AdminGroupFields.vue";
import AdminTagEditor from "./AdminTagEditor.vue";
import AdminJoinMethodEditor from "./AdminJoinMethodEditor.vue";
import AdminPrivateDetails from "./AdminPrivateDetails.vue";
import { purgeStagedAsset, uploadLogoAsset } from "../api";

const props = defineProps<{
  group: AdminGroupDto | null;
  open: boolean;
  saving: boolean;
  serverFieldErrors?: Record<string, string[]>;
  serverError?: string;
  csrfToken?: string;
  /** 父级在保存成功后设为 true，用于区分"保存关闭"和"取消关闭" */
  saved?: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  save: [data: Record<string, unknown>];
}>();

// 草稿状态
const groupRef = ref(props.group);
watch(
  () => props.group,
  (g) => {
    groupRef.value = g;
  },
);
// 新建模式每次打开重置草稿
watch(
  () => props.open,
  (open) => {
    if (open && isCreate.value) resetDraft();
  },
);

// ── Staged asset 跟踪（用于取消时清理）──
const stagedAssetIds = ref<Set<string>>(new Set());
const logoStagedAssetId = ref<string | null>(null);
const logoStagedR2Key = ref<string | null>(null);

function trackAssetUpload(oldAssetId: string | null, newAssetId: string) {
  stagedAssetIds.value.add(newAssetId);
  if (oldAssetId && oldAssetId !== newAssetId) {
    void cleanupStagedAsset(oldAssetId);
  }
}

async function cleanupStagedAsset(assetId: string) {
  // 只清理本会话上传的 staged 资源；已有 ready 资源不在此清理
  if (!stagedAssetIds.value.has(assetId)) return;
  stagedAssetIds.value.delete(assetId);
  if (!props.csrfToken) return;
  try {
    await purgeStagedAsset(assetId, props.csrfToken);
  } catch {
    // 清理尽力而为
  }
}

async function cleanupAllStagedAssets() {
  const ids = [...stagedAssetIds.value];
  stagedAssetIds.value.clear();
  for (const id of ids) {
    if (!props.csrfToken) continue;
    try {
      await purgeStagedAsset(id, props.csrfToken);
    } catch {
      // 清理尽力而为
    }
  }
}

// 抽屉打开时重置跟踪
watch(
  () => props.open,
  (val) => {
    if (val) {
      stagedAssetIds.value = new Set();
      logoStagedAssetId.value = null;
      logoStagedR2Key.value = null;
    }
  },
);

const {
  draft,
  fieldErrors,
  isCreate,
  isDirty,
  // logo
  logoBlob,
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
} = useAdminGroupDraft(groupRef);

// 同步服务端字段错误
watch(
  () => props.serverFieldErrors,
  (errors) => {
    if (errors) {
      setFieldErrors(errors);
    }
  },
);

// 服务端全局错误
const serverError = computed(() => props.serverError ?? "");

// ── Dirty guard ──
const confirmClose = ref(false);
const pendingClose = ref<(() => void) | null>(null);
let resolveNavigation: ((allow: boolean) => void) | null = null;

function requestClose() {
  if (!isDirty.value) {
    doClose();
    return;
  }
  confirmClose.value = true;
  pendingClose.value = doClose;
}

function doClose() {
  confirmClose.value = false;
  pendingClose.value = null;
  emit("update:open", false);
}

function forceClose() {
  confirmClose.value = false;
  if (resolveNavigation) {
    const resolve = resolveNavigation;
    resolveNavigation = null;
    pendingClose.value = null;
    resolve(true);
    return;
  }
  if (pendingClose.value) {
    pendingClose.value();
  }
}

function continueEditing() {
  confirmClose.value = false;
  pendingClose.value = null;
  if (resolveNavigation) {
    const resolve = resolveNavigation;
    resolveNavigation = null;
    resolve(false);
  }
}

// Escape 键
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (confirmClose.value) {
      continueEditing();
      return;
    }
    requestClose();
  }
}

// 导航守卫（router）
// 简化：在 beforeunload 阻止意外离开
function onBeforeUnload(e: BeforeUnloadEvent) {
  if (props.open && isDirty.value) {
    e.preventDefault();
  }
}

watch(
  () => props.open,
  (val, oldVal) => {
    if (val) {
      window.addEventListener("beforeunload", onBeforeUnload);
      document.addEventListener("keydown", onKeydown);
      clearFieldErrors();
      void nextTick(() => {
        const drawer = document.querySelector("[data-drawer]");
        if (drawer instanceof HTMLElement) drawer.focus();
      });
    } else if (oldVal) {
      // 关闭抽屉：如果保存未确认，清理 staged 资源
      if (!props.saved) {
        void cleanupAllStagedAssets();
      }
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("keydown", onKeydown);
      confirmClose.value = false;
      pendingClose.value = null;
    }
  },
);

onBeforeUnmount(() => {
  if (props.open && !props.saved) {
    void cleanupAllStagedAssets();
  }
  window.removeEventListener("beforeunload", onBeforeUnload);
  document.removeEventListener("keydown", onKeydown);
});

// SPA 导航守卫：有未保存修改时阻止路由跳转
onBeforeRouteLeave(() => {
  if (props.open && isDirty.value) {
    return new Promise<boolean>((resolve) => {
      resolveNavigation?.(false);
      resolveNavigation = resolve;
      pendingClose.value = null;
      confirmClose.value = true;
    });
  }
  return true;
});

// ── 保存 ──
const formError = ref("");
const { error: logoError, process: processLogo } = useImageProcessor();
const logoUploading = ref(false);

async function onLogoFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  if (logoStagedAssetId.value) {
    await cleanupStagedAsset(logoStagedAssetId.value);
    logoStagedAssetId.value = null;
    logoStagedR2Key.value = null;
  }
  const result = await processLogo(file, LOGO_MAX_BYTES);
  if (result) {
    URL.revokeObjectURL(result.previewUrl);
    setLogo(result.blob);
  }
  (e.target as HTMLInputElement).value = "";
}

async function onRemoveLogo() {
  if (logoStagedAssetId.value) {
    await cleanupStagedAsset(logoStagedAssetId.value);
    logoStagedAssetId.value = null;
    logoStagedR2Key.value = null;
  }
  removeLogo();
}

async function handleSave() {
  if (logoUploading.value) return;
  formError.value = "";
  clearFieldErrors();

  if (tagError.value || joinMethodError.value) {
    formError.value = tagError.value ?? joinMethodError.value ?? "请修正表单错误";
    return;
  }

  try {
    // 上传 logo（如果有新 blob）
    let logoPayload: { logoR2Key?: string | null; adoptAssetIds?: string[] } | undefined;
    if (logoBlob.value) {
      if (!logoStagedAssetId.value || !logoStagedR2Key.value) {
        logoUploading.value = true;
        const result = await uploadLogoAsset(logoBlob.value, props.csrfToken ?? "");
        if (!result.ok) throw new Error(result.error.message);
        logoStagedAssetId.value = result.data.id;
        logoStagedR2Key.value = result.data.r2Key;
        stagedAssetIds.value.add(result.data.id);
      }
      logoPayload = {
        logoR2Key: logoStagedR2Key.value,
        adoptAssetIds: [logoStagedAssetId.value],
      };
    }

    const input = isCreate.value ? toCreateInput(logoPayload) : toUpdateInput(logoPayload);
    emit("save", input as unknown as Record<string, unknown>);
  } catch (e) {
    formError.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    logoUploading.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <!-- 遮罩 -->
    <div
      v-if="open"
      class="fixed inset-0 z-40 bg-black/30 transition-opacity"
      :class="confirmClose ? 'pointer-events-none' : ''"
      @click="requestClose"
    />

    <!-- 抽屉 -->
    <aside
      v-if="open"
      data-drawer
      tabindex="-1"
      class="fixed right-0 top-0 z-50 flex h-full w-screen max-w-[100vw] flex-col bg-white shadow-2xl outline-none sm:w-[540px]"
      :class="confirmClose ? 'pointer-events-none' : ''"
    >
      <!-- 头部 -->
      <header class="flex shrink-0 items-center justify-between border-b px-6 py-4">
        <h2 class="text-lg font-semibold text-gray-900">
          {{ isCreate ? "新建群聊" : "编辑群聊" }}
          <span v-if="isDirty" class="ml-2 text-xs font-normal text-amber-500">未保存</span>
        </h2>
        <button
          type="button"
          class="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="关闭"
          @click="requestClose"
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </header>

      <!-- 表单内容 -->
      <form
        id="admin-group-form"
        class="flex-1 space-y-6 overflow-y-auto px-6 py-4"
        @submit.prevent="handleSave"
      >
        <!-- Logo 头像编辑 -->
        <div class="flex flex-col items-center">
          <div class="relative">
            <img
              v-if="logoUrl"
              :src="logoUrl"
              class="h-24 w-24 rounded-full border-2 border-gray-200 object-cover"
              alt="群聊 Logo"
            />
            <div
              v-else
              class="flex h-24 w-24 items-center justify-center rounded-full border-2 border-dashed border-gray-300 bg-gray-100 text-xs text-gray-400"
            >
              无头像
            </div>
            <p v-if="logoError" class="mt-1 text-center text-xs text-red-500">
              {{ logoError }}
            </p>
          </div>
          <div class="mt-2 flex justify-center gap-2">
            <label class="cursor-pointer text-xs text-brand-primary hover:underline">
              {{ logoUrl ? "更换头像" : "上传头像" }}
              <input type="file" accept="image/*" class="hidden" @change="onLogoFileChange" />
            </label>
            <button
              v-if="logoUrl"
              type="button"
              class="text-xs text-red-500 hover:underline"
              @click="onRemoveLogo"
            >
              移除
            </button>
          </div>
        </div>

        <!-- 基本信息 -->
        <AdminGroupFields
          :title="draft.title"
          :description="draft.description"
          :kind="draft.kind"
          :platform="draft.platform"
          :status="draft.status"
          :field-errors="fieldErrors"
          @update:title="draft.title = $event"
          @update:description="draft.description = $event"
          @update:kind="draft.kind = $event"
          @update:platform="draft.platform = $event"
          @update:status="draft.status = $event"
        />

        <!-- 标签 -->
        <AdminTagEditor
          :tags="draft.tags"
          :error="tagError"
          @add="addTag($event)"
          @remove="removeTag($event)"
          @move-up="moveTag($event, 'up')"
          @move-down="moveTag($event, 'down')"
        />

        <!-- 加群方式 -->
        <AdminJoinMethodEditor
          :methods="draft.joinMethods"
          :error="joinMethodError"
          :csrf-token="props.csrfToken ?? ''"
          @add="addJoinMethod($event)"
          @remove="removeJoinMethod($event)"
          @update:value="(key, val) => updateJoinMethod(key, { value: val })"
          @update:url="(key, url) => updateJoinMethod(key, { url })"
          @update:asset-id="
            (key, id, assetUrl) =>
              updateJoinMethod(key, { assetId: id || null, assetUrl: assetUrl ?? null })
          "
          @move-up="moveJoinMethod($event, 'up')"
          @move-down="moveJoinMethod($event, 'down')"
          @asset-uploaded="(oldId: string | null, newId: string) => trackAssetUpload(oldId, newId)"
          @cleanup-asset="(assetId: string) => cleanupStagedAsset(assetId)"
        />

        <!-- 管理信息 -->
        <AdminPrivateDetails
          :submission-contact="draft.submissionContact"
          :audit-notes="draft.auditNotes"
          @update:audit-notes="draft.auditNotes = $event"
        />
      </form>

      <!-- 底部操作栏 -->
      <footer class="shrink-0 border-t px-6 py-4">
        <p v-if="serverError" class="mb-3 text-sm text-red-500">
          {{ serverError }}
        </p>
        <p v-if="formError && !serverError" class="mb-3 text-sm text-red-500">
          {{ formError }}
        </p>
        <div class="flex items-center justify-end gap-3">
          <button
            type="button"
            class="rounded bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200"
            @click="requestClose"
          >
            取消
          </button>
          <button
            type="submit"
            form="admin-group-form"
            class="rounded bg-brand-primary px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            :disabled="saving || logoUploading"
          >
            {{ saving || logoUploading ? "保存中…" : "保存" }}
          </button>
        </div>
      </footer>

      <!-- Dirty 确认对话框 -->
      <Teleport to="body">
        <div
          v-if="confirmClose"
          class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
        >
          <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 class="text-base font-semibold text-gray-900">放弃未保存的更改？</h3>
            <p class="mt-2 text-sm text-gray-500">你做的修改尚未保存，关闭后将丢失。</p>
            <div class="mt-4 flex justify-end gap-2">
              <button
                type="button"
                class="rounded bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200"
                @click="continueEditing"
              >
                继续编辑
              </button>
              <button
                type="button"
                class="rounded bg-red-500 px-4 py-2 text-sm text-white hover:bg-red-600"
                @click="forceClose"
              >
                放弃
              </button>
            </div>
          </div>
        </div>
      </Teleport>
    </aside>
  </Teleport>
</template>
