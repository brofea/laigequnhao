<script setup lang="ts">
import { ref } from "vue";
import type { PublicGroupDto } from "@shared/contracts/group";
import QrCodeDialog from "./QrCodeDialog.vue";

defineProps<{
  group: PublicGroupDto;
  liked: boolean;
}>();

const emit = defineEmits<{
  toggleLike: [groupId: string];
  copyNumber: [text: string];
}>();

const qrDialogOpen = ref(false);
const viewingQrMethod = ref<PublicGroupDto["joinMethods"][number] | null>(null);

function openUrl(url: string) {
  window.open(url, "_blank", "noopener");
}

function openQrDialog(method: PublicGroupDto["joinMethods"][number]) {
  viewingQrMethod.value = method;
  qrDialogOpen.value = true;
}
</script>

<template>
  <article
    class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
  >
    <!-- Logo -->
    <div class="mb-3 flex items-center gap-3">
      <img
        v-if="group.logoUrl"
        :src="group.logoUrl"
        :alt="`${group.title} Logo`"
        :width="group.logoMeta?.width ?? 64"
        :height="group.logoMeta?.height ?? 64"
        class="h-12 w-12 rounded-lg object-cover"
        loading="lazy"
      />
      <div
        v-else
        class="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-400 text-xs"
      >
        无图
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="truncate text-base font-semibold text-gray-900">{{ group.title }}</h3>
        <div class="mt-0.5 flex items-center gap-2">
          <span class="text-xs text-gray-500">{{ group.platform }}</span>
          <span
            class="inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium"
            :class="
              group.kind === 'official'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-amber-100 text-amber-700'
            "
          >
            {{ group.kind === "official" ? "官方群" : "同好群" }}
          </span>
          <span
            v-if="group.status === 'delisted'"
            class="inline-flex rounded-full bg-red-100 px-1.5 py-0.5 text-xs font-medium text-red-600"
          >
            已下架
          </span>
        </div>
      </div>
    </div>

    <!-- 标签 -->
    <div v-if="group.tags.length > 0" class="mb-3 flex flex-wrap gap-1">
      <span
        v-for="tag in group.tags"
        :key="tag"
        class="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600"
      >
        {{ tag }}
      </span>
    </div>

    <!-- 简介 -->
    <p v-if="group.description" class="mb-3 text-sm text-gray-600 line-clamp-2">
      {{ group.description }}
    </p>

    <!-- 操作区 -->
    <div class="flex items-center justify-between border-t border-gray-100 pt-3">
      <!-- 点赞 -->
      <button
        class="flex items-center gap-1 text-sm transition-colors"
        :class="liked ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-400'"
        :aria-label="liked ? '取消点赞' : '点赞'"
        @click="emit('toggleLike', group.id)"
      >
        <span>{{ liked ? "❤️" : "🤍" }}</span>
        <span>{{ group.likeCount }}</span>
      </button>

      <!-- 加群按钮 -->
      <div class="flex gap-2">
        <button
          v-for="(method, idx) in group.joinMethods"
          :key="`${method.type}-${idx}`"
          class="rounded bg-brand-primary px-3 py-1 text-xs font-medium text-white transition-opacity hover:opacity-80"
          @click="
            method.type === 'group_number' && method.value
              ? emit('copyNumber', method.value)
              : method.type === 'url' && method.url
                ? openUrl(method.url)
                : method.type === 'qr_code' && method.qrCodeUrl
                  ? openQrDialog(method)
                  : undefined
          "
        >
          {{
            method.type === "group_number"
              ? "复制群号"
              : method.type === "url"
                ? "打开链接"
                : "二维码"
          }}
        </button>
      </div>
    </div>

    <!-- 二维码对话框 -->
    <QrCodeDialog
      v-if="viewingQrMethod"
      v-model:open="qrDialogOpen"
      :group-title="group.title"
      :qr-code-url="viewingQrMethod.qrCodeUrl ?? ''"
      :qr-code-meta="viewingQrMethod.qrCodeMeta ?? null"
    />
  </article>
</template>
