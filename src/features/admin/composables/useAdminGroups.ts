import { ref, watch, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { AdminGroupDto, GroupCreateInput, GroupUpdateInput } from "@shared/contracts/group";
import type { GroupStatus } from "@shared/domain";
import { normalizeSearchQuery } from "@shared/domain";
import {
  createAdminGroup,
  fetchAdminGroupsPage,
  permanentDeleteGroup,
  restoreGroup,
  softDeleteGroup,
  updateAdminGroup,
  type AdminGroupsQuery,
} from "../api";

export const ADMIN_PAGE_SIZE = 50;

/** 服务端排序字段（T04 契约）与本地表头字段的映射 */
export const adminSortFieldMap: Record<string, string | undefined> = {
  title: "title",
  kind: "kind",
  status: "status",
  platform: "platform",
  tags: "tags",
  likes: "likeCount",
};

/**
 * 管理群组列表：T04 页码分页契约 + URL 状态同步。
 *
 * URL query 是恢复来源：page/status/deleted/q/sortBy/sortDir。
 * 筛选/排序/搜索变化回到第一页；删除当前页最后一项自动退页。
 */
export function useAdminGroups(getCsrf: () => string, isActive: () => boolean = () => true) {
  const route = useRoute();
  const router = useRouter();

  const groups = ref<AdminGroupDto[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const page = ref(1);
  const totalItems = ref(0);
  const totalPages = ref(0);
  const loaded = ref(false);

  const statuses = ref<GroupStatus[]>([]);
  const deleted = ref(false);
  const q = ref("");
  const sortBy = ref<string | undefined>(undefined);
  const sortDir = ref<"asc" | "desc">("desc");

  let controller: AbortController | null = null;
  let latestRequestId = 0;

  /** 从 URL query 恢复状态（前进/后退/刷新） */
  function readFromUrl() {
    const query = route.query;
    const rawStatuses = Array.isArray(query.status)
      ? query.status
      : query.status
        ? [query.status]
        : [];
    const nextStatuses = rawStatuses.filter(
      (s): s is GroupStatus =>
        s === "pending" || s === "published" || s === "rejected" || s === "delisted",
    );
    const nextDeleted = query.deleted === "true";
    const nextPage = Math.max(1, Number(query.page) || 1);
    const nextQ = typeof query.q === "string" ? query.q : "";
    const nextSortBy = typeof query.sortBy === "string" ? query.sortBy : undefined;
    const nextSortDir = query.sortDir === "asc" ? "asc" : "desc";

    statuses.value = nextDeleted ? [] : nextStatuses;
    deleted.value = nextDeleted;
    q.value = nextQ;
    page.value = nextPage;
    sortBy.value = nextSortBy;
    sortDir.value = nextSortDir;
  }

  /** 当前 URL 中与列表状态相关的规范化签名 */
  function queryKey(): string {
    const rawStatuses = Array.isArray(route.query.status)
      ? route.query.status
      : route.query.status
        ? [route.query.status]
        : [];
    return JSON.stringify({
      statuses: [...rawStatuses].sort(),
      deleted: route.query.deleted === "true",
      q: route.query.q ?? "",
      sortBy: route.query.sortBy ?? "",
      sortDir: route.query.sortDir ?? "",
      page: route.query.page ?? "1",
    });
  }

  let syncedKey = "";

  /** 状态同步到 URL（浏览器历史可前进/后退）；status 支持多值 */
  function syncToUrl() {
    const query: Record<string, string | string[]> = {};
    if (!deleted.value && statuses.value.length > 0) {
      query["status"] = [...statuses.value];
    }
    if (deleted.value) query["deleted"] = "true";
    if (q.value) query["q"] = q.value;
    if (sortBy.value) {
      query["sortBy"] = sortBy.value;
      query["sortDir"] = sortDir.value;
    }
    query["page"] = String(page.value);
    syncedKey = JSON.stringify({
      statuses: [...statuses.value].sort(),
      deleted: deleted.value,
      q: q.value,
      sortBy: sortBy.value ?? "",
      sortDir: sortDir.value,
      page: String(page.value),
    });
    void router.replace({ query });
  }

  function buildQuery(signal?: AbortSignal): AdminGroupsQuery {
    return {
      statuses: deleted.value ? [] : statuses.value,
      deleted: deleted.value,
      q: q.value || undefined,
      sortBy: sortBy.value,
      sortDir: sortDir.value,
      page: page.value,
      signal,
    };
  }

  async function fetchGroups() {
    // 非管理视图不请求管理接口（避免公开首页携带管理请求）
    if (!isActive()) return;
    const requestId = ++latestRequestId;
    controller?.abort();
    const requestController = new AbortController();
    controller = requestController;
    loading.value = true;
    error.value = null;

    // 回收站模式与状态筛选互斥：URL 恢复时不产生非法组合
    if (!deleted.value && statuses.value.length === 0) {
      statuses.value = ["published", "delisted", "pending", "rejected"];
    }

    try {
      const result = await fetchAdminGroupsPage(buildQuery(requestController.signal));
      if (requestId !== latestRequestId) return;

      if (result.ok) {
        groups.value = result.data.items;
        totalItems.value = result.data.totalItems;
        totalPages.value = result.data.totalPages;
        page.value = result.data.page;
        loaded.value = true;
      } else {
        error.value = result.error.message;
      }
    } catch (e) {
      if (requestId !== latestRequestId) return;
      if (e instanceof Error && e.name === "AbortError") return;
      error.value = "加载失败，请重试";
    } finally {
      if (requestId === latestRequestId) loading.value = false;
    }
  }

  function retry() {
    void fetchGroups();
  }

  function setSearch(value: string) {
    q.value = normalizeSearchQuery(value) ?? "";
    page.value = 1;
    syncToUrl();
    void fetchGroups();
  }

  function setStatuses(next: GroupStatus[]) {
    statuses.value = next;
    deleted.value = false;
    page.value = 1;
    syncToUrl();
    void fetchGroups();
  }

  function toggleDeleted() {
    deleted.value = !deleted.value;
    statuses.value = [];
    page.value = 1;
    syncToUrl();
    void fetchGroups();
  }

  function setSort(field: string | undefined, dir: "asc" | "desc") {
    sortBy.value = field ? adminSortFieldMap[field] : undefined;
    sortDir.value = dir;
    page.value = 1;
    syncToUrl();
    void fetchGroups();
  }

  function goToPage(next: number) {
    if (next < 1 || (totalPages.value > 0 && next > totalPages.value)) return;
    page.value = next;
    syncToUrl();
    void fetchGroups();
  }

  async function softDelete(id: string): Promise<boolean> {
    const result = await softDeleteGroup(id, getCsrf());
    if (!result.ok) return false;
    await fetchGroups();
    // 删除当前页最后一项且不是第一页时退到上一页
    if (groups.value.length === 0 && page.value > 1) {
      goToPage(page.value - 1);
    }
    return true;
  }

  async function restore(id: string): Promise<boolean> {
    const result = await restoreGroup(id, getCsrf());
    if (!result.ok) return false;
    void fetchGroups();
    return true;
  }

  async function purge(id: string): Promise<boolean> {
    const result = await permanentDeleteGroup(id, getCsrf());
    if (!result.ok) return false;
    void fetchGroups();
    return true;
  }

  async function createGroup(input: GroupCreateInput): Promise<{ ok: boolean }> {
    const result = await createAdminGroup(input, getCsrf());
    if (!result.ok) return { ok: false };
    void fetchGroups();
    return { ok: true };
  }

  async function updateGroup(
    id: string,
    input: GroupUpdateInput,
  ): Promise<{ ok: boolean; versionConflict?: boolean }> {
    const result = await updateAdminGroup(id, input, getCsrf());
    if (!result.ok) {
      return { ok: false, versionConflict: result.error.kind === "conflict" };
    }
    void fetchGroups();
    return { ok: true };
  }

  watch(
    () => route.query,
    () => {
      if (!isActive()) return;
      // 自己写入的 URL（syncedKey 匹配）不重复请求；外部导航（前进/后退）才恢复
      const key = queryKey();
      if (key === syncedKey) return;
      syncedKey = key;
      readFromUrl();
      void fetchGroups();
    },
    { immediate: true },
  );

  onUnmounted(() => controller?.abort());

  return {
    groups,
    loading,
    error,
    page,
    totalItems,
    totalPages,
    pageSize: ADMIN_PAGE_SIZE,
    loaded,
    statuses,
    deleted,
    q,
    sortBy,
    sortDir,
    fetchGroups,
    retry,
    setSearch,
    setStatuses,
    toggleDeleted,
    setSort,
    goToPage,
    softDelete,
    restore,
    purge,
    createGroup,
    updateGroup,
  };
}
