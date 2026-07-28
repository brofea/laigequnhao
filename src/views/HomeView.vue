<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import { ref } from "vue";
import { useRoute } from "vue-router";
import { useGroupDirectory } from "@/features/groups/composables/useGroupDirectory";
import { useLikedGroups } from "@/features/groups/composables/useLikedGroups";
import { useClipboard } from "@/features/groups/composables/useClipboard";
import GroupList from "@/features/groups/components/GroupList.vue";
import SubmissionDialog from "@/features/groups/components/SubmissionDialog.vue";
import Toast from "@/shared/components/Toast.vue";

const route = useRoute();
// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const searchQuery = ref((route.query.q as string) ?? "");
const showSubmission = ref(false);

// These are used in template via props
const { groups, loading, error, loadMore, search } = useGroupDirectory();
const { likedIds, toggle: toggleLike } = useLikedGroups();
const { toastMessage, toastType, copy } = useClipboard();

function onSearch() {
  search(searchQuery.value);
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
            placeholder="搜索群聊标题或标签..."
            class="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-primary"
            @input="onSearch"
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
