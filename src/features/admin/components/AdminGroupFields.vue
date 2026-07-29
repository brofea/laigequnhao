<script setup lang="ts">
import type { GroupKind, GroupStatus } from "@shared/domain";
import siteConfig from "@/../site.config";

defineProps<{
  title: string;
  description: string;
  kind: GroupKind;
  platform: string;
  status: GroupStatus;
  fieldErrors: Record<string, string[]>;
}>();

const emit = defineEmits<{
  "update:title": [value: string];
  "update:description": [value: string];
  "update:kind": [value: GroupKind];
  "update:platform": [value: string];
  "update:status": [value: GroupStatus];
}>();

const kindLabels: Record<GroupKind, string> = {
  official: "官方群",
  interest: "同好群",
};

const statusLabels: Record<GroupStatus, string> = {
  pending: "待审核",
  published: "已发布",
  rejected: "已拒绝",
  delisted: "已下架",
};
</script>

<template>
  <fieldset class="space-y-4">
    <legend class="text-sm font-semibold text-gray-700">基本信息</legend>

    <!-- 标题 -->
    <label class="block">
      <span class="text-sm font-medium text-gray-600">标题</span>
      <input
        :value="title"
        type="text"
        maxlength="200"
        required
        class="mt-1 block w-full rounded border px-3 py-2 text-sm"
        :class="fieldErrors.title ? 'border-red-400' : 'border-gray-300'"
        @input="emit('update:title', ($event.target as HTMLInputElement).value)"
      />
      <p v-if="fieldErrors.title" class="mt-1 text-xs text-red-500">
        {{ fieldErrors.title.join("、") }}
      </p>
    </label>

    <!-- 简介 -->
    <label class="block">
      <span class="text-sm font-medium text-gray-600">简介</span>
      <textarea
        :value="description"
        rows="3"
        maxlength="2000"
        class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm resize-y"
        @input="emit('update:description', ($event.target as HTMLTextAreaElement).value)"
      />
      <p v-if="fieldErrors.description" class="mt-1 text-xs text-red-500">
        {{ fieldErrors.description.join("、") }}
      </p>
    </label>

    <div class="grid grid-cols-2 gap-3">
      <!-- 性质 -->
      <label class="block">
        <span class="text-sm font-medium text-gray-600">性质</span>
        <select
          :value="kind"
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          @change="emit('update:kind', ($event.target as HTMLSelectElement).value as GroupKind)"
        >
          <option v-for="(label, val) in kindLabels" :key="val" :value="val">
            {{ label }}
          </option>
        </select>
        <p v-if="fieldErrors.kind" class="mt-1 text-xs text-red-500">
          {{ fieldErrors.kind.join("、") }}
        </p>
      </label>

      <!-- 平台 -->
      <label class="block">
        <span class="text-sm font-medium text-gray-600">平台</span>
        <select
          :value="platform"
          class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
          :class="fieldErrors.platform ? 'border-red-400' : ''"
          @change="emit('update:platform', ($event.target as HTMLSelectElement).value)"
        >
          <option v-for="p in siteConfig.platforms" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
        <p v-if="fieldErrors.platform" class="mt-1 text-xs text-red-500">
          {{ fieldErrors.platform.join("、") }}
        </p>
      </label>
    </div>

    <!-- 状态 -->
    <label class="block">
      <span class="text-sm font-medium text-gray-600">业务状态</span>
      <select
        :value="status"
        class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
        :class="fieldErrors.status ? 'border-red-400' : ''"
        @change="emit('update:status', ($event.target as HTMLSelectElement).value as GroupStatus)"
      >
        <option v-for="(label, val) in statusLabels" :key="val" :value="val">
          {{ label }}
        </option>
      </select>
      <p v-if="fieldErrors.status" class="mt-1 text-xs text-red-500">
        {{ fieldErrors.status.join("、") }}
      </p>
    </label>
  </fieldset>
</template>
