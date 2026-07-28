<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import type { PublicGroupDto } from "@shared/contracts/group";
import GroupCard from "./GroupCard.vue";
import LoadingSkeleton from "@/shared/components/LoadingSkeleton.vue";
import ErrorBanner from "@/shared/components/ErrorBanner.vue";

defineProps<{
  groups: PublicGroupDto[];
  loading: boolean;
  error: string | null;
  likedIds: Set<string>;
  loadMore: () => void;
}>();

const emit = defineEmits<{
  loadMore: [];
  toggleLike: [groupId: string];
  copyNumber: [text: string];
}>();

const sentinel = ref<HTMLDivElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  if (!sentinel.value) return;
  observer = new IntersectionObserver(
    ([entry]) => {
      if (entry?.isIntersecting) emit("loadMore");
    },
    { rootMargin: "200px" },
  );
  observer.observe(sentinel.value);
});

onUnmounted(() => {
  observer?.disconnect();
});
</script>

<template>
  <ErrorBanner v-if="error" :message="error" />

  <div v-if="groups.length > 0" class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <GroupCard
      v-for="group in groups"
      :key="group.id"
      :group="group"
      :liked="likedIds.has(group.id)"
      @toggle-like="emit('toggleLike', $event)"
      @copy-number="emit('copyNumber', $event)"
    />
  </div>

  <p v-if="!loading && groups.length === 0 && !error" class="py-16 text-center text-gray-400">
    暂无群聊
  </p>

  <LoadingSkeleton v-if="loading" />

  <div ref="sentinel" class="h-4" />
</template>
