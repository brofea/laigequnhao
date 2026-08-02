import { ref, onUnmounted } from "vue";
import type { BoardWithGroups } from "@shared/contracts/board";
import { fetchPublicBoards } from "../api";

/** 公开板块：只含启用板块与已发布成员；独立请求与错误 */
export function usePublicBoards() {
  const boards = ref<BoardWithGroups[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const loaded = ref(false);

  let controller: AbortController | null = null;

  async function load() {
    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    error.value = null;
    try {
      const result = await fetchPublicBoards(controller.signal);
      if (result.ok) {
        boards.value = result.data.boards;
        loaded.value = true;
      } else {
        error.value = result.error.message;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      error.value = "板块加载失败";
    } finally {
      loading.value = false;
    }
  }

  onUnmounted(() => controller?.abort());

  return { boards, loading, error, loaded, retry: load, load };
}
