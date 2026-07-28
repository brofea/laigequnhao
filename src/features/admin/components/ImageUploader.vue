<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import { ref, onUnmounted } from "vue";
import { useImageProcessor, formatBytes } from "../composables/useImageProcessor";
import { LOGO_MAX_BYTES, QR_CODE_MAX_BYTES } from "@shared/contracts/asset";

const props = defineProps<{
  purpose: "logo" | "qr_code";
  existingUrl?: string | null;
}>();

const emit = defineEmits<{
  uploaded: [data: { blob: Blob; width: number; height: number; byteLength: number }];
  remove: [];
}>();

const { loading, error, process, revokePreview } = useImageProcessor();

const dragging = ref(false);
const previewUrl = ref<string | null>(props.existingUrl ?? null);
const meta = ref<{ width: number; height: number; byteLength: number } | null>(null);

const maxBytes = props.purpose === "logo" ? LOGO_MAX_BYTES : QR_CODE_MAX_BYTES;
const label = props.purpose === "logo" ? "Logo" : "二维码";

function onDragOver(e: DragEvent) {
  e.preventDefault();
  dragging.value = true;
}
function onDragLeave() {
  dragging.value = false;
}
async function onDrop(e: DragEvent) {
  e.preventDefault();
  dragging.value = false;
  const file = e.dataTransfer?.files[0];
  if (file) await handleFile(file);
}
async function onFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) await handleFile(file);
}

async function handleFile(file: File) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    error.value = "仅支持 JPG、PNG、WebP 格式";
    return;
  }
  const result = await process(file, maxBytes);
  if (result) {
    if (previewUrl.value) revokePreview(previewUrl.value);
    previewUrl.value = result.previewUrl;
    meta.value = { width: result.width, height: result.height, byteLength: result.byteLength };
    emit("uploaded", {
      blob: result.blob,
      width: result.width,
      height: result.height,
      byteLength: result.byteLength,
    });
  }
}

function handleRemove() {
  if (previewUrl.value && previewUrl.value !== props.existingUrl) {
    revokePreview(previewUrl.value);
  }
  previewUrl.value = null;
  meta.value = null;
  emit("remove");
}

onUnmounted(() => {
  if (previewUrl.value && previewUrl.value !== props.existingUrl) {
    revokePreview(previewUrl.value);
  }
});
</script>

<template>
  <div class="space-y-2">
    <label class="text-sm font-medium text-gray-700">{{ label }}</label>

    <div
      class="relative rounded-lg border-2 border-dashed p-4 text-center transition-colors"
      :class="dragging ? 'border-brand-primary bg-blue-50' : 'border-gray-300'"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onDrop"
    >
      <!-- 预览 -->
      <div v-if="previewUrl" class="space-y-2">
        <img :src="previewUrl" :alt="label" class="mx-auto max-h-32 rounded object-contain" />
        <p v-if="meta" class="text-xs text-gray-500">
          {{ meta.width }}×{{ meta.height }} | {{ formatBytes(meta.byteLength) }}
          <span :class="meta.byteLength > maxBytes ? 'text-red-500' : 'text-green-600'">
            (上限 {{ formatBytes(maxBytes) }})
          </span>
        </p>
        <button type="button" class="text-xs text-red-500 hover:underline" @click="handleRemove">
          移除
        </button>
      </div>

      <!-- 上传区域 -->
      <div v-else>
        <p class="text-sm text-gray-400">拖拽图片到此处，或</p>
        <label class="cursor-pointer text-sm text-brand-primary hover:underline">
          选择文件
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            class="hidden"
            @change="onFileChange"
          />
        </label>
        <p class="mt-1 text-xs text-gray-400">
          支持 JPG/PNG/WebP，上限 {{ formatBytes(maxBytes) }}
        </p>
      </div>

      <!-- 加载 -->
      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center rounded-lg bg-white/80"
      >
        <span class="text-sm text-gray-500">处理中...</span>
      </div>
    </div>

    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </div>
</template>
