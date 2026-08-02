import { ref, watch, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { PublicGroupDto } from "@shared/contracts/group";
import { fetchGroupDetail } from "../api";

/**
 * 群组详情深链（?group=）。
 *
 * 读取 URL group 参数并请求真实公开详情；不可公开（不存在/下架/回收站）
 * 由服务端统一返回 404，这里只呈现非敏感错误。关闭弹窗只移除 group 参数，
 * 保留 q 等其他查询参数。
 */
export function useGroupDetail() {
  const route = useRoute();
  const router = useRouter();

  const group = ref<PublicGroupDto | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const requestedId = ref<string | null>(null);

  let controller: AbortController | null = null;

  async function load(id: string) {
    controller?.abort();
    controller = new AbortController();
    requestedId.value = id;
    loading.value = true;
    error.value = null;
    group.value = null;
    try {
      const result = await fetchGroupDetail(id, controller.signal);
      if (result.ok) {
        group.value = result.data;
      } else {
        error.value = result.error.message;
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return;
      error.value = "详情加载失败";
    } finally {
      loading.value = false;
    }
  }

  watch(
    () => route.query.group as string | undefined,
    (id) => {
      if (id) void load(id);
    },
    { immediate: true },
  );

  function close() {
    controller?.abort();
    group.value = null;
    error.value = null;
    const { group: _group, ...rest } = route.query;
    void router.replace({ query: rest });
  }

  onUnmounted(() => controller?.abort());

  return { group, loading, error, requestedId, close };
}
