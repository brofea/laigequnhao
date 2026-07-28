<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import { ref, watch, computed, nextTick, onBeforeUnmount } from "vue";
import type { AdminGroupDto } from "@shared/contracts/group";
import { useAdminGroupDraft } from "../composables/useAdminGroupDraft";
import AdminGroupFields from "./AdminGroupFields.vue";
import AdminTagEditor from "./AdminTagEditor.vue";
import AdminJoinMethodEditor from "./AdminJoinMethodEditor.vue";
import AdminPrivateDetails from "./AdminPrivateDetails.vue";

const props = defineProps<{
  group: AdminGroupDto | null;
  open: boolean;
  saving: boolean;
  serverFieldErrors?: Record<string, string[]>;
  serverError?: string;
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

const {
  draft,
  fieldErrors,
  isCreate,
  isDirty,
  allowedJoinMethods,
  tagError,
  addTag,
  removeTag,
  moveTag,
  joinMethodError,
  addJoinMethod,
  removeJoinMethod,
  updateJoinMethod,
  moveJoinMethod,
  toCreateInput,
  toUpdateInput,
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
  if (pendingClose.value) {
    pendingClose.value();
  }
}

// Escape 键
function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    if (confirmClose.value) {
      confirmClose.value = false;
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
  (val) => {
    if (val) {
      window.addEventListener("beforeunload", onBeforeUnload);
      document.addEventListener("keydown", onKeydown);
      clearFieldErrors();
      // 焦点移到抽屉
      void nextTick(() => {
        const drawer = document.querySelector("[data-drawer]");
        if (drawer instanceof HTMLElement) drawer.focus();
      });
    } else {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("keydown", onKeydown);
      confirmClose.value = false;
      pendingClose.value = null;
    }
  },
);

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
  document.removeEventListener("keydown", onKeydown);
});

// ── 保存 ──
const formError = ref("");

function handleSave() {
  formError.value = "";
  clearFieldErrors();

  // 前端校验
  if (tagError.value || joinMethodError.value) {
    formError.value = tagError.value ?? joinMethodError.value ?? "请修正表单错误";
    return;
  }

  try {
    const input = isCreate.value ? toCreateInput() : toUpdateInput();
    emit("save", input as unknown as Record<string, unknown>);
  } catch (e) {
    formError.value = e instanceof Error ? e.message : "保存失败";
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
      class="fixed right-0 top-0 z-50 flex h-full w-full flex-col bg-white shadow-2xl outline-none sm:w-[540px]"
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
      <form class="flex-1 space-y-6 overflow-y-auto px-6 py-4" @submit.prevent="handleSave">
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
          :allowed-types="allowedJoinMethods"
          :error="joinMethodError"
          @add="addJoinMethod($event)"
          @remove="removeJoinMethod($event)"
          @update:value="(key, val) => updateJoinMethod(key, { value: val })"
          @update:url="(key, url) => updateJoinMethod(key, { url })"
          @update:asset-id="(key, id) => updateJoinMethod(key, { assetId: id || null })"
          @move-up="moveJoinMethod($event, 'up')"
          @move-down="moveJoinMethod($event, 'down')"
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
        <p v-if="serverError" class="mb-3 text-sm text-red-500">{{ serverError }}</p>
        <p v-if="formError && !serverError" class="mb-3 text-sm text-red-500">{{ formError }}</p>
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
            class="rounded bg-brand-primary px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
            :disabled="saving"
            @click="handleSave"
          >
            {{ saving ? "保存中…" : "保存" }}
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
                @click="confirmClose = false"
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
