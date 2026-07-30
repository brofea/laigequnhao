<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import type { JoinMethod } from "@shared/domain";
import type { DraftJoinMethod } from "../composables/useAdminGroupDraft";
import { uploadQrAsset } from "../api";
import { useImageProcessor } from "../composables/useImageProcessor";
import {
  QR_CODE_MAX_BYTES,
  QR_CODE_MAX_DIMENSION,
  QR_CODE_TARGET_BYTES,
} from "@shared/contracts/asset";

const props = defineProps<{
  methods: DraftJoinMethod[];
  error: string | null;
  csrfToken?: string;
}>();

const emit = defineEmits<{
  add: [type: JoinMethod];
  remove: [clientKey: string];
  "update:value": [clientKey: string, value: string];
  "update:url": [clientKey: string, url: string];
  "update:assetId": [clientKey: string, assetId: string, assetUrl?: string | null];
  "move-up": [clientKey: string];
  "move-down": [clientKey: string];
  /** 上传了新二维码资源 → 父组件应跟踪以便取消时清理 */
  "asset-uploaded": [oldAssetId: string | null, newAssetId: string];
  /** 请求清理指定 asset（移除/替换时） */
  "cleanup-asset": [assetId: string];
}>();

const typeLabels: Record<JoinMethod, string> = {
  group_number: "群号",
  url: "链接",
  qr_code: "二维码",
};

const ALL_JOIN_TYPES = [
  { type: "qr_code" as const, label: "添加二维码" },
  { type: "group_number" as const, label: "添加群号" },
  { type: "url" as const, label: "添加链接" },
];

const { error: processError, process: processImage } = useImageProcessor();

const availableTypes = computed(() =>
  ALL_JOIN_TYPES.filter((t) => !props.methods.some((m) => m.type === t.type)),
);

// ── 二维码上传状态 ──
const qrUploading = ref<Record<string, boolean>>({});
const qrUploadError = ref<Record<string, string>>({});
const qrPreviewUrls = ref<Record<string, string | undefined>>({});

function revokePreview(clientKey: string) {
  const previewUrl = qrPreviewUrls.value[clientKey];
  if (!previewUrl) return;
  URL.revokeObjectURL(previewUrl);
  qrPreviewUrls.value[clientKey] = undefined;
}

function removeQrAsset(method: DraftJoinMethod) {
  if (method.assetId) emit("cleanup-asset", method.assetId);
  revokePreview(method.clientKey);
  emit("update:assetId", method.clientKey, "", null);
}

function removeMethod(method: DraftJoinMethod) {
  if (method.type === "qr_code" && method.assetId) {
    emit("cleanup-asset", method.assetId);
  }
  revokePreview(method.clientKey);
  emit("remove", method.clientKey);
}

/** 处理二维码文件选择并上传 */
async function handleQrFile(clientKey: string, file: File) {
  qrUploading.value[clientKey] = true;
  qrUploadError.value[clientKey] = "";

  try {
    // 使用统一图片处理器：5MB 上限 → 缩放到 1024px → webp 压缩到 ≤300KB
    const result = await processImage(
      file,
      QR_CODE_MAX_BYTES,
      QR_CODE_TARGET_BYTES,
      QR_CODE_MAX_DIMENSION,
    );
    if (!result) {
      qrUploadError.value[clientKey] = processError.value || "图片处理失败";
      return;
    }

    revokePreview(clientKey);
    qrPreviewUrls.value[clientKey] = result.previewUrl;

    const uploadResult = await uploadQrAsset(result.blob, props.csrfToken ?? "");
    if (!uploadResult.ok) throw new Error(uploadResult.error.message);

    const oldAssetId =
      props.methods.find((method) => method.clientKey === clientKey)?.assetId ?? null;
    emit("update:assetId", clientKey, uploadResult.data.id, uploadResult.data.publicUrl);
    emit("asset-uploaded", oldAssetId, uploadResult.data.id);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "上传失败";
    qrUploadError.value[clientKey] = msg;
    revokePreview(clientKey);
  } finally {
    qrUploading.value[clientKey] = false;
  }
}

onBeforeUnmount(() => {
  for (const clientKey of Object.keys(qrPreviewUrls.value)) {
    revokePreview(clientKey);
  }
});
</script>

<template>
  <fieldset class="space-y-3">
    <legend class="text-sm font-semibold text-gray-700">
      加群方式
      <span class="font-normal text-gray-400">（至少 1 个）</span>
    </legend>

    <ul class="space-y-3">
      <li
        v-for="(m, i) in methods"
        :key="m.clientKey"
        class="rounded-lg border border-gray-200 bg-gray-50 p-3"
      >
        <div class="mb-2 flex items-center justify-between">
          <span class="flex items-center gap-1.5 text-xs font-medium text-gray-500">
            <img
              v-if="m.type === 'qr_code' && (m.assetUrl || qrPreviewUrls[m.clientKey])"
              :src="qrPreviewUrls[m.clientKey] ?? m.assetUrl ?? ''"
              class="inline-block h-6 w-6 rounded border object-cover"
              alt="QR 预览"
            />
            {{ typeLabels[m.type] }}
          </span>
          <div class="flex items-center gap-1">
            <button
              v-if="i > 0"
              type="button"
              class="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              title="上移"
              @click="emit('move-up', m.clientKey)"
            >
              ↑
            </button>
            <button
              v-if="i < methods.length - 1"
              type="button"
              class="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-200 hover:text-gray-600"
              title="下移"
              @click="emit('move-down', m.clientKey)"
            >
              ↓
            </button>
            <button
              v-if="methods.length > 1"
              type="button"
              class="rounded px-1.5 py-0.5 text-xs text-red-400 hover:bg-red-50 hover:text-red-600"
              title="删除"
              @click="removeMethod(m)"
            >
              ×
            </button>
          </div>
        </div>

        <!-- group_number -->
        <input
          v-if="m.type === 'group_number'"
          :value="m.value"
          type="text"
          placeholder="输入群号"
          class="block w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
          @input="emit('update:value', m.clientKey, ($event.target as HTMLInputElement).value)"
        />

        <!-- url -->
        <input
          v-if="m.type === 'url'"
          :value="m.url"
          type="url"
          placeholder="https://example.com/join"
          class="block w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
          @input="emit('update:url', m.clientKey, ($event.target as HTMLInputElement).value)"
        />

        <!-- qr_code -->
        <div v-if="m.type === 'qr_code'" class="text-sm">
          <!-- 已有 assetId：显示预览 -->
          <template v-if="m.assetId">
            <div class="flex items-center gap-2">
              <img
                v-if="qrPreviewUrls[m.clientKey] || m.assetUrl"
                :src="qrPreviewUrls[m.clientKey] ?? m.assetUrl ?? ''"
                alt="二维码预览"
                class="h-12 w-12 rounded border object-cover"
              />
              <span class="text-xs text-gray-400">已上传</span>
              <button
                type="button"
                class="ml-auto text-xs text-red-400 hover:text-red-600"
                @click="removeQrAsset(m)"
              >
                移除
              </button>
            </div>
          </template>
          <!-- 未上传：文件选择器 -->
          <template v-else>
            <div class="flex items-center gap-2">
              <label
                class="cursor-pointer rounded border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-400 hover:border-brand-primary hover:text-brand-primary"
              >
                <span v-if="qrUploading[m.clientKey]">上传中…</span>
                <span v-else>选择二维码图片</span>
                <input
                  type="file"
                  accept="image/*"
                  class="hidden"
                  :disabled="qrUploading[m.clientKey]"
                  @change="
                    (e) => {
                      const f = (e.target as HTMLInputElement).files?.[0];
                      if (f) handleQrFile(m.clientKey, f);
                      (e.target as HTMLInputElement).value = '';
                    }
                  "
                />
              </label>
            </div>
            <p
              v-if="qrUploadError[m.clientKey]"
              class="mt-1 text-xs text-red-500"
              role="alert"
              aria-live="polite"
            >
              {{ qrUploadError[m.clientKey] }}
            </p>
          </template>
        </div>
      </li>
    </ul>

    <!-- 添加新方式 -->
    <div class="flex flex-wrap gap-2">
      <button
        v-for="t in availableTypes"
        :key="t.type"
        type="button"
        class="rounded border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-brand-primary hover:text-brand-primary"
        @click="emit('add', t.type)"
      >
        {{ t.label }}
      </button>
    </div>

    <p v-if="error" class="text-xs text-red-500">
      {{ error }}
    </p>
  </fieldset>
</template>
