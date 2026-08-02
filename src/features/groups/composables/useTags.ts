import { ref, onUnmounted } from "vue";
import type { TagStats } from "@shared/contracts/tags";
import { fetchTags } from "../api";

/** 标签聚合：独立请求与错误 */
export function useTags() {
  const tags = ref<TagStats[]>([]);
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
      const result = await fetchTags(controller.signal);
      if (result.ok) {
        tags.value = result.data.tags;
        loaded.value = true;
      } else {
        error.value = result.error.message;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      error.value = "标签加载失败";
    } finally {
      loading.value = false;
    }
  }

  onUnmounted(() => controller?.abort());

  return { tags, loading, error, loaded, retry: load, load };
}
