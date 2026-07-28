<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import type { JoinMethod } from "@shared/domain";
import type { DraftJoinMethod } from "../composables/useAdminGroupDraft";

defineProps<{
  methods: DraftJoinMethod[];
  allowedTypes: JoinMethod[];
  error: string | null;
}>();

const emit = defineEmits<{
  add: [type: JoinMethod];
  remove: [clientKey: string];
  "update:value": [clientKey: string, value: string];
  "update:url": [clientKey: string, url: string];
  "update:assetId": [clientKey: string, assetId: string];
  "move-up": [clientKey: string];
  "move-down": [clientKey: string];
}>();

const typeLabels: Record<JoinMethod, string> = {
  group_number: "群号",
  url: "链接",
  qr_code: "二维码",
};
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
          <span class="text-xs font-medium text-gray-500">
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
              @click="emit('remove', m.clientKey)"
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
          <input
            v-if="!m.assetId"
            :value="''"
            type="text"
            placeholder="输入已上传的二维码 Asset ID（或先上传再选择）"
            class="block w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            @input="emit('update:assetId', m.clientKey, ($event.target as HTMLInputElement).value)"
          />
          <p v-else class="text-gray-500">
            已关联 Asset: <code class="text-xs">{{ m.assetId }}</code>
            <button
              type="button"
              class="ml-2 text-red-400 hover:text-red-600"
              @click="emit('update:assetId', m.clientKey, '')"
            >
              移除
            </button>
          </p>
        </div>
      </li>
    </ul>

    <!-- 添加新方式 -->
    <div class="flex gap-2">
      <select
        class="rounded border border-gray-300 px-3 py-1.5 text-sm"
        @change="
          emit('add', ($event.target as HTMLSelectElement).value as JoinMethod);
          ($event.target as HTMLSelectElement).value = '';
        "
      >
        <option value="" disabled selected>添加加群方式…</option>
        <option v-for="t in allowedTypes" :key="t" :value="t">
          {{ typeLabels[t] }}
        </option>
      </select>
    </div>

    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </fieldset>
</template>
