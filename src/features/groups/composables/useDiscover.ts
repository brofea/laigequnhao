import { ref, onUnmounted } from "vue";
import type { PublicGroupDto } from "@shared/contracts/group";
import { fetchDiscover } from "../api";

/** 发现新群：独立请求与错误，区域失败不影响其他区域 */
export function useDiscover() {
  const items = ref<PublicGroupDto[]>([]);
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
      const result = await fetchDiscover(controller.signal);
      if (result.ok) {
        items.value = result.data.items;
        loaded.value = true;
      } else {
        error.value = result.error.message;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      error.value = "发现新群加载失败";
    } finally {
      loading.value = false;
    }
  }

  onUnmounted(() => controller?.abort());

  return { items, loading, error, loaded, retry: load, load };
}
