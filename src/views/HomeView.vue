<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useGroupDirectory } from "@/features/groups/composables/useGroupDirectory";
import { useLikedGroups } from "@/features/groups/composables/useLikedGroups";
import { useClipboard } from "@/features/groups/composables/useClipboard";
import GroupList from "@/features/groups/components/GroupList.vue";
import SubmissionDialog from "@/features/groups/components/SubmissionDialog.vue";
import Toast from "@/shared/components/Toast.vue";

const route = useRoute();
const initialSearchQuery = route.query.q;
const searchQuery = ref(typeof initialSearchQuery === "string" ? initialSearchQuery : "");
const showSubmission = ref(false);

const { groups, loading, error, loadMore, search, searchImmediate } = useGroupDirectory();
const { likedIds, toggle: toggleLike } = useLikedGroups();
const { toastMessage, toastType, copy } = useClipboard();

// 同步 URL → 输入框（前进/后退时）
watch(
  () => route.query.q as string | undefined,
  (q) => {
    searchQuery.value = q ?? "";
  },
);

function onSearchInput() {
  if (!searchQuery.value) {
    // 清空：立即执行
    searchImmediate("");
  } else {
    // 普通输入：防抖
    search(searchQuery.value);
  }
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    // 回车：立即执行
    searchImmediate(searchQuery.value);
  }
}

async function onToggleLike(groupId: string) {
  const currentLiked = likedIds.value.has(groupId);
  const newCount = await toggleLike(groupId, currentLiked);
  const group = groups.value.find((g) => g.id === groupId);
  if (group && newCount !== null) {
    group.likeCount = newCount;
  }
}

function onCopyNumber(text: string) {
  void copy(text);
}
</script>

<template>
  <main class="min-h-screen bg-gray-50">
    <header class="border-b border-gray-200 bg-white">
      <div class="mx-auto max-w-6xl px-4 py-6">
        <div class="flex items-center justify-between">
          <h1 class="text-2xl font-bold text-brand-primary">来个群号</h1>
          <button
            class="rounded-lg bg-brand-primary px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-80"
            @click="showSubmission = true"
          >
            提交新的群聊
          </button>
        </div>
        <div class="mt-4">
          <input
            v-model="searchQuery"
            type="search"
            placeholder="搜索标题、简介或标签..."
            class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            @input="onSearchInput"
            @keydown="onSearchKeydown"
          />
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-6xl px-4 py-6">
      <GroupList
        :groups="groups"
        :loading="loading"
        :error="error"
        :liked-ids="likedIds"
        :load-more="loadMore"
        @toggle-like="onToggleLike"
        @copy-number="onCopyNumber"
      />
    </div>

    <SubmissionDialog v-model:open="showSubmission" />
    <Toast :message="toastMessage" :type="toastType" />
  </main>
</template>
