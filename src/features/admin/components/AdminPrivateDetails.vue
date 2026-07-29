<script setup lang="ts">
defineProps<{
  submissionContact: string | null;
  auditNotes: string | null;
}>();

const emit = defineEmits<{
  "update:auditNotes": [value: string | null];
}>();
</script>

<template>
  <fieldset class="space-y-3">
    <legend class="text-sm font-semibold text-gray-700">管理信息</legend>

    <!-- 联系方式（只读） -->
    <label class="block">
      <span class="text-sm font-medium text-gray-600">提交者联系方式</span>
      <p class="mt-1 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
        {{ submissionContact || "未提供" }}
      </p>
    </label>

    <!-- 审核备注（可写） -->
    <label class="block">
      <span class="text-sm font-medium text-gray-600">审核备注</span>
      <textarea
        :value="auditNotes ?? ''"
        rows="3"
        maxlength="2000"
        placeholder="添加审核备注（仅管理员可见）"
        class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm resize-y"
        @input="emit('update:auditNotes', ($event.target as HTMLTextAreaElement).value || null)"
      />
    </label>
  </fieldset>
</template>
