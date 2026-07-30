import { ref, computed, watch, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { api } from "@/shared/api/client";
import {
  adminGroupDtoSchema,
  adminGroupListResponseSchema,
  type AdminGroupDto,
  type AdminSortField,
  type AdminSortDir,
} from "@shared/contracts/group";
import { groupStatusSchema, normalizeSearchQuery, type GroupStatus } from "@shared/domain";
import { z } from "zod";

const deleteResponseSchema = z.object({ id: z.string() });
const allStatuses = [...groupStatusSchema.options];

function parseStatuses(raw: string | string[] | undefined): GroupStatus[] {
  if (!raw) return [...allStatuses];
  const values = Array.isArray(raw) ? raw : [raw];
  const parsed = [
    ...new Set(
      values.filter((value): value is GroupStatus =>
        groupStatusSchema.options.includes(value as GroupStatus),
      ),
    ),
  ];
  return parsed.length > 0 ? parsed : [...allStatuses];
}

export function useAdminGroups(csrfToken: () => string) {
  const route = useRoute();
  const router = useRouter();

  // ── Reactive state ──
  const groups = ref<AdminGroupDto[]>([]);
  const loading = ref(false);
  const error = ref("");
  const total = ref(0);
  const nextCursor = ref<string | null>(null);

  let controller: AbortController | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let immediateSearchRequested = false;

  // ── CSRF headers factory ──
  const csrfHeaders = (): Record<string, string> => ({
    "X-CSRF-Token": csrfToken(),
  });

  // ── URL-derived reactive state ──

  /** Multi-status filter: derived from URL query param "status" (repeatable) */
  const statuses = computed<GroupStatus[]>(() =>
    parseStatuses(
      Array.isArray(route.query.status)
        ? route.query.status.filter((value): value is string => value !== null)
        : (route.query.status ?? undefined),
    ),
  );

  const deleted = computed(() => route.query.deleted === "true");

  const searchQuery = computed(() => String(route.query.q ?? ""));

  const sortBy = computed<AdminSortField | undefined>(() => {
    const v = route.query.sortBy as string | undefined;
    return v && ["title", "kind", "status", "platform", "tags", "likeCount"].includes(v)
      ? (v as AdminSortField)
      : undefined;
  });

  const sortDir = computed<AdminSortDir | undefined>(() => {
    if (!sortBy.value) return undefined;
    const v = route.query.sortDir as string | undefined;
    return v === "asc" ? "asc" : "desc";
  });

  // ── URL mutation helpers ──

  function updateQuery(patch: Record<string, string | string[] | undefined>) {
    const next: Record<string, unknown> = {};
    // Copy existing query, then apply patch (skip undefined/empty-array removals)
    for (const [k, v] of Object.entries(route.query)) {
      next[k] = v;
    }
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined || (Array.isArray(v) && v.length === 0)) {
        Reflect.deleteProperty(next, k);
      } else {
        next[k] = v;
      }
    }
    void router.replace({ query: next as Record<string, string | string[]> });
  }

  function toggleStatus(status: GroupStatus) {
    if (deleted.value) return;
    const current = [...statuses.value];

    if (current.includes(status)) {
      if (current.length <= 1) return; // must keep at least one
      updateQuery({ status: current.filter((s) => s !== status) });
    } else {
      updateQuery({ status: [...current, status] });
    }
  }

  function toggleDeleted() {
    if (deleted.value) {
      // 退出回收站：读取 URL 中保存的状态组合
      const rawSaved = route.query.saved as string | string[] | undefined;
      const restore = parseStatuses(rawSaved);
      updateQuery({ deleted: undefined, saved: undefined, status: restore });
    } else {
      // 进入回收站：将当前状态组合保存到 URL
      updateQuery({
        deleted: "true",
        status: undefined,
        saved: statuses.value.length > 0 ? statuses.value : undefined,
      });
    }
  }

  function setSearch(q: string) {
    updateQuery({ q: normalizeSearchQuery(q) ?? undefined });
  }

  function setSort(field: AdminSortField) {
    if (sortBy.value === field) {
      if (sortDir.value === "asc") {
        updateQuery({ sortDir: "desc" });
      } else {
        updateQuery({ sortBy: undefined, sortDir: undefined });
      }
    } else {
      updateQuery({ sortBy: field, sortDir: "asc" });
    }
  }

  // ── Data fetching ──

  async function fetchGroups(cursor?: string | null, append = false) {
    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    error.value = "";

    try {
      const qs = new URLSearchParams();
      if (!deleted.value) {
        for (const s of statuses.value) qs.append("status", s);
      } else {
        qs.set("deleted", "true");
      }
      if (searchQuery.value) qs.set("q", searchQuery.value);
      if (sortBy.value) {
        qs.set("sortBy", sortBy.value);
        qs.set("sortDir", sortDir.value ?? "asc");
      } else {
        qs.set("sortBy", "status");
        qs.set("sortDir", "asc");
      }
      if (cursor) qs.set("cursor", cursor);
      qs.set("limit", "50");

      const result = await api.get(
        `/admin?${qs.toString()}`,
        adminGroupListResponseSchema,
        csrfHeaders(),
        controller.signal,
      );

      if (result.ok) {
        if (append) {
          groups.value = [...groups.value, ...result.data.items];
        } else {
          groups.value = result.data.items;
        }
        total.value = result.data.total;
        nextCursor.value = result.data.nextCursor;
      } else {
        error.value = result.error.message;
      }
    } catch (e: unknown) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      if (e instanceof Error && e.name === "AbortError") return;
      error.value = "加载失败";
    } finally {
      loading.value = false;
    }
  }

  // ── Watchers: fetch on filter/sort change ──

  watch([statuses, deleted, sortBy, sortDir], () => {
    void fetchGroups(null, false);
  });

  // Debounced search watch
  watch(searchQuery, (newQ, oldQ) => {
    if (newQ === oldQ) return;
    if (immediateSearchRequested) return;
    if (debounceTimer) clearTimeout(debounceTimer);
    if (!newQ) {
      void fetchGroups(null, false);
    } else {
      debounceTimer = setTimeout(() => {
        void fetchGroups(null, false);
      }, 300);
    }
  });

  /** Immediate search (Enter key or clear) */
  async function searchImmediate(q = searchQuery.value) {
    if (debounceTimer) clearTimeout(debounceTimer);
    immediateSearchRequested = true;
    try {
      await router.replace({
        query: {
          ...route.query,
          q: normalizeSearchQuery(q) ?? undefined,
        },
      });
    } finally {
      immediateSearchRequested = false;
    }
    await fetchGroups(null, false);
  }

  /** Load more (cursor pagination) */
  async function loadMore() {
    if (loading.value || !nextCursor.value) return;
    await fetchGroups(nextCursor.value, true);
  }

  async function refetchLoadedWindow(previouslyLoaded: number) {
    await fetchGroups(null, false);
    while (
      groups.value.length < Math.min(previouslyLoaded, total.value) &&
      nextCursor.value !== null
    ) {
      const cursor = nextCursor.value;
      await fetchGroups(cursor, true);
      if (nextCursor.value === cursor) break;
    }
  }

  function activeSortKey(dto: AdminGroupDto): string | number | null {
    switch (sortBy.value) {
      case "title":
        return dto.title.toLocaleLowerCase("en");
      case "kind":
        return dto.kind;
      case "status":
        return dto.status;
      case "platform":
        return dto.platform.toLocaleLowerCase("en");
      case "tags":
        return dto.tags[0]?.toLocaleLowerCase("en") ?? null;
      case "likeCount":
        return dto.likeCount;
      default:
        return null;
    }
  }

  // ── CRUD operations (in-place update, no full refresh) ──

  async function createGroup(
    fields: Record<string, unknown>,
  ): Promise<{ ok: boolean; dto?: AdminGroupDto; fieldErrors?: Record<string, string[]> }> {
    const result = await api.post(`/admin`, adminGroupDtoSchema, fields, csrfHeaders());
    if (result.ok) {
      // 创建成功：补取原已加载窗口，保持服务端排序与游标一致。
      await refetchLoadedWindow(groups.value.length);
      return { ok: true, dto: result.data };
    }
    error.value = result.error.message;
    return {
      ok: false,
      fieldErrors: (result.error as Record<string, unknown>).fieldErrors as
        Record<string, string[]> | undefined,
    };
  }

  async function updateGroup(
    id: string,
    fields: Record<string, unknown>,
  ): Promise<{
    ok: boolean;
    dto?: AdminGroupDto;
    versionConflict?: boolean;
    fieldErrors?: Record<string, string[]>;
  }> {
    const result = await api.patch(`/admin/${id}`, adminGroupDtoSchema, fields, csrfHeaders());
    if (result.ok) {
      // 用权威 DTO 替换列表中的项
      const dto = result.data;
      if (matchesCurrentFilter(dto)) {
        const idx = groups.value.findIndex((g) => g.id === id);
        if (idx !== -1) {
          const previouslyLoaded = groups.value.length;
          const previous = groups.value[idx];
          if (!previous) {
            await refetchLoadedWindow(previouslyLoaded);
            return { ok: true, dto };
          }
          const sortKeyChanged =
            sortBy.value !== undefined && !Object.is(activeSortKey(previous), activeSortKey(dto));
          groups.value[idx] = dto;
          if (sortKeyChanged) {
            await refetchLoadedWindow(previouslyLoaded);
          }
        } else {
          await refetchLoadedWindow(groups.value.length);
        }
      } else {
        // 不匹配当前筛选，移除
        groups.value = groups.value.filter((g) => g.id !== id);
        total.value -= 1;
      }
      return { ok: true, dto };
    }

    const errCode = (result.error as Record<string, unknown>).code as string | undefined;
    if (errCode === "VERSION_CONFLICT") {
      // 重新获取权威 DTO 以便用户对比修改
      try {
        const singleResult = await api.get(`/admin/${id}`, adminGroupDtoSchema, csrfHeaders());
        if (singleResult.ok) {
          const idx = groups.value.findIndex((g) => g.id === id);
          if (idx !== -1) {
            groups.value[idx] = singleResult.data;
          }
        }
      } catch {
        /* 获取失败不影响版本冲突提示 */
      }
      return { ok: false, versionConflict: true };
    }

    error.value = result.error.message;
    return {
      ok: false,
      fieldErrors: (result.error as Record<string, unknown>).fieldErrors as
        Record<string, string[]> | undefined,
    };
  }

  /** 检查 DTO 是否匹配当前筛选条件（状态、回收站、搜索词） */
  function matchesCurrentFilter(dto: AdminGroupDto): boolean {
    // 回收站模式：只显示软删除记录
    if (deleted.value) {
      return dto.deletedAt !== null;
    }
    // 正常模式：状态匹配 + 非软删除
    if (!statuses.value.includes(dto.status)) return false;
    if (dto.deletedAt !== null) return false;
    // 搜索词匹配
    const q = normalizeSearchQuery(searchQuery.value);
    if (q) {
      const inTitle = dto.title.toLocaleLowerCase("en").includes(q);
      const inDesc = dto.description.toLocaleLowerCase("en").includes(q);
      const inTags = dto.tags.some((tag) => tag.toLocaleLowerCase("en").includes(q));
      if (!inTitle && !inDesc && !inTags) return false;
    }
    return true;
  }

  async function softDelete(id: string): Promise<boolean> {
    const result = await api.delete(`/admin/${id}`, deleteResponseSchema, csrfHeaders());
    if (result.ok) {
      groups.value = groups.value.filter((g) => g.id !== id);
      total.value = Math.max(0, total.value - 1);
      return true;
    }
    return false;
  }

  async function restore(id: string): Promise<boolean> {
    const result = await api.post(`/admin/${id}/restore`, adminGroupDtoSchema, {}, csrfHeaders());
    if (result.ok) {
      const dto = result.data;
      // 恢复后记录可能不匹配当前筛选（如回收站中恢复 → 不应留在这里）
      if (deleted.value) {
        // 当前是回收站视图：恢复的记录应该移除
        groups.value = groups.value.filter((g) => g.id !== id);
        total.value = Math.max(0, total.value - 1);
      } else if (matchesCurrentFilter(dto)) {
        // 匹配当前筛选：替换
        const idx = groups.value.findIndex((g) => g.id === id);
        if (idx !== -1) {
          groups.value[idx] = dto;
        } else {
          groups.value = [...groups.value, dto];
          total.value += 1;
        }
      } else {
        // 不匹配当前筛选：移除
        groups.value = groups.value.filter((g) => g.id !== id);
        total.value = Math.max(0, total.value - 1);
      }
      return true;
    }
    return false;
  }

  async function permanentDelete(id: string): Promise<boolean> {
    const result = await api.delete(
      `/admin/trash/groups/${id}`,
      deleteResponseSchema,
      csrfHeaders(),
    );
    if (result.ok) {
      groups.value = groups.value.filter((g) => g.id !== id);
      total.value = Math.max(0, total.value - 1);
      return true;
    }
    error.value = (result.error as { message?: string }).message ?? "永久删除失败";
    return false;
  }

  // ── Cleanup ──
  onUnmounted(() => {
    controller?.abort();
    if (debounceTimer) clearTimeout(debounceTimer);
  });

  // ── Public API ──
  return {
    // state
    groups,
    loading,
    error,
    total,
    nextCursor,
    // URL-derived
    statuses,
    deleted,
    searchQuery,
    sortBy,
    sortDir,
    // actions
    toggleStatus,
    toggleDeleted,
    setSearch,
    setSort,
    searchImmediate,
    loadMore,
    fetchGroups,
    // CRUD
    createGroup,
    updateGroup,
    softDelete,
    restore,
    permanentDelete,
  };
}
