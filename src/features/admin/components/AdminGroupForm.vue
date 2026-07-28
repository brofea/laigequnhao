<script setup lang="ts">
import { ref } from "vue";
import type { AdminGroupDto } from "@shared/contracts/group";

const props = defineProps<{
  group: AdminGroupDto | null;
  open: boolean;
}>();

const emit = defineEmits<{
  "update:open": [value: boolean];
  save: [data: Record<string, unknown>];
}>();

const form = ref({
  title: props.group?.title ?? "",
  description: props.group?.description ?? "",
  kind: props.group?.kind ?? "interest",
  platform: props.group?.platform ?? "",
  status: props.group?.status ?? "pending",
});

function handleSave() {
  emit("save", { ...form.value, version: props.group?.version });
  emit("update:open", false);
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      @click.self="emit('update:open', false)"
    >
      <div class="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 class="text-lg font-semibold">{{ group ? "编辑群聊" : "新建群聊" }}</h2>
        <form class="mt-4 space-y-3" @submit.prevent="handleSave">
          <label class="block">
            <span class="text-sm font-medium">标题</span>
            <input
              v-model="form.title"
              class="mt-1 block w-full rounded border px-3 py-2 text-sm"
              required
            />
          </label>
          <label class="block">
            <span class="text-sm font-medium">简介</span>
            <textarea
              v-model="form.description"
              rows="2"
              class="mt-1 block w-full rounded border px-3 py-2 text-sm"
            />
          </label>
          <label class="block">
            <span class="text-sm font-medium">性质</span>
            <select v-model="form.kind" class="mt-1 block w-full rounded border px-3 py-2 text-sm">
              <option value="official">官方群</option>
              <option value="interest">同好群</option>
            </select>
          </label>
          <label class="block">
            <span class="text-sm font-medium">状态</span>
            <select
              v-model="form.status"
              class="mt-1 block w-full rounded border px-3 py-2 text-sm"
            >
              <option value="pending">待审核</option>
              <option value="published">已发布</option>
              <option value="rejected">已拒绝</option>
              <option value="delisted">已下架</option>
            </select>
          </label>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded bg-gray-100 px-4 py-2 text-sm"
              @click="emit('update:open', false)"
            >
              取消
            </button>
            <button type="submit" class="rounded bg-brand-primary px-4 py-2 text-sm text-white">
              保存
            </button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>
