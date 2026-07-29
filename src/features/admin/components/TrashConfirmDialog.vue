<script setup lang="ts">
const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

defineProps<{
  open: boolean;
  groupTitle: string;
}>();
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-40 flex items-center justify-center bg-black/40">
      <div class="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
        <h3 class="text-lg font-semibold text-red-600">确认永久删除</h3>
        <p class="mt-2 text-sm text-gray-600">
          此操作将永久删除「{{ groupTitle }}」及其关联的标签、加群方式、点赞等数据，不可恢复。
        </p>
        <div class="mt-4 flex justify-end gap-2">
          <button class="rounded bg-gray-100 px-4 py-2 text-sm" @click="emit('cancel')">
            取消
          </button>
          <button class="rounded bg-red-600 px-4 py-2 text-sm text-white" @click="emit('confirm')">
            确认删除
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>
