import { ref, watch, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { PublicGroupDto } from "@shared/contracts/group";
import { fetchGroups } from "../api";

export function useGroupDirectory() {
  const route = useRoute();
  const router = useRouter();

  const groups = ref<PublicGroupDto[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const nextCursor = ref<string | null>(null);
  const rotationWindow = ref("");

  let controller: AbortController | null = null;

  async function load(q?: string, _cursor?: string | null, append = false) {
    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    error.value = null;

    try {
      // 不传 cursor，limit 设大一点一次性加载全部
      const result = await fetchGroups({ q, cursor: null, limit: 200, signal: controller.signal });

      if (!result.ok) {
        error.value = result.error.message;
        return;
      }

      if (append) {
        groups.value = [...groups.value, ...result.data.items];
      } else {
        groups.value = result.data.items;
      }
      nextCursor.value = result.data.nextCursor;
      rotationWindow.value = result.data.rotationWindow;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      error.value = "加载失败，请重试";
    } finally {
      loading.value = false;
    }
  }

  async function loadMore() {
    if (loading.value || !nextCursor.value) return;
    const q = (route.query.q as string) || undefined;
    await load(q, nextCursor.value, true);
  }

  function search(q: string) {
    void router.replace({ query: { ...route.query, q: q || undefined } });
  }

  watch(
    () => route.query.q as string | undefined,
    (q) => {
      controller?.abort();
      void load(q, null, false);
    },
    { immediate: true },
  );

  onUnmounted(() => {
    controller?.abort();
  });

  return {
    groups,
    loading,
    error,
    nextCursor,
    rotationWindow,
    loadMore,
    search,
    retry: () => {
      const q = (route.query.q as string) || undefined;
      void load(q, null, false);
    },
  };
}
