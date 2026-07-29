<script setup lang="ts">
import { ref, computed } from "vue";
import { submissionRequestSchema, type SubmissionRequest } from "@shared/contracts/submission";
import siteConfig from "../../../../site.config";
import { submitGroup } from "../api";

const emit = defineEmits<{
  close: [];
  submitted: [];
}>();

const open = defineModel<boolean>("open", { default: false });

const form = ref<Partial<SubmissionRequest> & { tagsStr: string }>({
  title: "",
  kind: "interest",
  platform: siteConfig.platforms[0]?.id ?? "",
  groupNumber: "",
  url: "",
  tagsStr: "",
  description: "",
  notes: "",
  contact: "",
});

const submitting = ref(false);
const formError = ref<string | null>(null);
const validationErrors = ref<Record<string, string>>({});
const submitted = ref(false);

const platforms = computed(() => siteConfig.platforms);

function clearForm() {
  form.value = {
    title: "",
    kind: "interest",
    platform: siteConfig.platforms[0]?.id ?? "",
    groupNumber: "",
    url: "",
    tagsStr: "",
    description: "",
    notes: "",
    contact: "",
  };
  formError.value = null;
  validationErrors.value = {};
  submitted.value = false;
}

async function handleSubmit() {
  formError.value = null;
  validationErrors.value = {};

  const tags = form.value.tagsStr
    ? form.value.tagsStr
        .split(/[,，\s]+/)
        .map((t) => t.trim())
        .filter(Boolean)
    : [];

  const data = {
    title: form.value.title,
    kind: form.value.kind,
    platform: form.value.platform,
    groupNumber: form.value.groupNumber || undefined,
    url: form.value.url || undefined,
    tags: tags.length > 0 ? tags : undefined,
    description: form.value.description || undefined,
    notes: form.value.notes || undefined,
    contact: form.value.contact || undefined,
    turnstileToken: "placeholder",
  };

  const result = submissionRequestSchema.safeParse(data);
  if (!result.success) {
    const errs: Record<string, string> = {};
    for (const [key, msgs] of Object.entries(result.error.flatten().fieldErrors)) {
      errs[key] = msgs[0] ?? "无效";
    }
    validationErrors.value = errs;
    return;
  }

  submitting.value = true;
  const response = await submitGroup(result.data);
  submitting.value = false;

  if (response.ok) {
    submitted.value = true;
    emit("submitted");
  } else {
    formError.value = response.error.message;
  }
}

function close() {
  open.value = false;
  emit("close");
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-40 flex items-center justify-center bg-black/40"
      @click.self="close"
    >
      <dialog
        open
        class="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl"
        @keydown.escape="close"
      >
        <button
          class="absolute right-4 top-4 text-gray-400 hover:text-gray-600"
          aria-label="关闭"
          @click="close"
        >
          ✕
        </button>

        <h2 class="text-lg font-semibold text-gray-900">提交新的群聊</h2>

        <form v-if="!submitted" class="mt-4 space-y-4" @submit.prevent="handleSubmit">
          <!-- 标题 -->
          <label class="block">
            <span class="text-sm font-medium text-gray-700">标题 *</span>
            <input
              v-model="form.title"
              type="text"
              required
              maxlength="100"
              class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              :class="{ 'border-red-400': validationErrors.title }"
            />
            <span v-if="validationErrors.title" class="text-xs text-red-500">{{
              validationErrors.title
            }}</span>
          </label>

          <!-- 性质 -->
          <label class="block">
            <span class="text-sm font-medium text-gray-700">群聊性质 *</span>
            <select
              v-model="form.kind"
              class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="official">官方群</option>
              <option value="interest">同好群</option>
            </select>
          </label>

          <!-- 平台 -->
          <label class="block">
            <span class="text-sm font-medium text-gray-700">平台 *</span>
            <select
              v-model="form.platform"
              class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            >
              <option v-for="p in platforms" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
          </label>

          <!-- 群号 -->
          <label class="block">
            <span class="text-sm font-medium text-gray-700">群号</span>
            <input
              v-model="form.groupNumber"
              type="text"
              maxlength="50"
              class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="至少填写群号或链接"
            />
          </label>

          <!-- 链接 -->
          <label class="block">
            <span class="text-sm font-medium text-gray-700">HTTPS 链接</span>
            <input
              v-model="form.url"
              type="url"
              class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="https://..."
              :class="{ 'border-red-400': validationErrors.url }"
            />
            <span v-if="validationErrors.url" class="text-xs text-red-500">{{
              validationErrors.url
            }}</span>
          </label>

          <!-- 标签 -->
          <label class="block">
            <span class="text-sm font-medium text-gray-700">标签（1-5 个，逗号分隔）</span>
            <input
              v-model="form.tagsStr"
              type="text"
              class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="如：游戏, 编程"
              :class="{ 'border-red-400': validationErrors.tags }"
            />
            <span v-if="validationErrors.tags" class="text-xs text-red-500">{{
              validationErrors.tags
            }}</span>
          </label>

          <!-- 简介 -->
          <label class="block">
            <span class="text-sm font-medium text-gray-700">简介</span>
            <textarea
              v-model="form.description"
              maxlength="500"
              rows="2"
              class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <!-- 联系方式 -->
          <label class="block">
            <span class="text-sm font-medium text-gray-700">联系方式（仅管理员可见）</span>
            <input
              v-model="form.contact"
              type="text"
              maxlength="200"
              class="mt-1 block w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </label>

          <p v-if="formError" class="text-sm text-red-500">
            {{ formError }}
          </p>
          <p v-if="validationErrors.groupNumber" class="text-sm text-red-500">
            {{ validationErrors.groupNumber }}
          </p>

          <button
            type="submit"
            :disabled="submitting"
            class="w-full rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80 disabled:opacity-50"
          >
            {{ submitting ? "提交中..." : "提交" }}
          </button>
        </form>

        <div v-else class="mt-4 text-center">
          <p class="text-green-600 font-medium">提交成功！</p>
          <p class="mt-1 text-sm text-gray-500">管理员审核后即可公开展示</p>
          <button
            class="mt-4 rounded bg-gray-100 px-4 py-2 text-sm hover:bg-gray-200"
            @click="
              clearForm();
              close();
            "
          >
            关闭
          </button>
        </div>
      </dialog>
    </div>
  </Teleport>
</template>
