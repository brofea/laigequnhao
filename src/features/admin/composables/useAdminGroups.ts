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
import type { GroupStatus } from "@shared/domain";
import { z } from "zod";

const deleteResponseSchema = z.object({ id: z.string() });

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

  // ── CSRF headers factory ──
  const csrfHeaders = (): Record<string, string> => ({
    "X-CSRF-Token": csrfToken(),
  });

  // ── URL-derived reactive state ──

  /** Multi-status filter: derived from URL query param "status" (repeatable) */
  const statuses = computed<GroupStatus[]>(() => {
    const raw = route.query.status;
    if (!raw) return ["pending", "published", "rejected", "delisted"];
    const arr = Array.isArray(raw) ? raw : [raw];
    return arr.filter((s): s is GroupStatus =>
      ["pending", "published", "rejected", "delisted"].includes(s as string),
    );
  });

  const deleted = computed(() => route.query.deleted === "true");

  const searchQuery = computed(() => String(route.query.q ?? ""));

  const sortBy = computed<AdminSortField | undefined>(() => {
    const v = route.query.sortBy as string | undefined;
    return v && ["title", "kind", "status", "platform", "tags", "likeCount"].includes(v)
      ? (v as AdminSortField)
      : undefined;
  });

  const sortDir = computed<AdminSortDir>(() => {
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
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete next[k];
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
      updateQuery({ deleted: undefined, status: undefined });
    } else {
      updateQuery({ deleted: "true", status: undefined });
    }
  }

  function setSearch(q: string) {
    updateQuery({ q: q || undefined });
  }

  function setSort(field: AdminSortField) {
    if (sortBy.value === field) {
      updateQuery({ sortDir: sortDir.value === "asc" ? "desc" : "asc" });
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
      for (const s of statuses.value) qs.append("status", s);
      if (deleted.value) qs.set("deleted", "true");
      if (searchQuery.value) qs.set("q", searchQuery.value);
      if (sortBy.value) qs.set("sortBy", sortBy.value);
      if (sortDir.value !== "desc") qs.set("sortDir", sortDir.value);
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
  function searchImmediate() {
    if (debounceTimer) clearTimeout(debounceTimer);
    void fetchGroups(null, false);
  }

  /** Load more (cursor pagination) */
  async function loadMore() {
    if (loading.value || !nextCursor.value) return;
    await fetchGroups(nextCursor.value, true);
  }

  // ── CRUD operations (in-place update, no full refresh) ──

  async function createGroup(
    fields: Record<string, unknown>,
  ): Promise<{ ok: boolean; dto?: AdminGroupDto; fieldErrors?: Record<string, string[]> }> {
    const result = await api.post(`/admin`, adminGroupDtoSchema, fields, csrfHeaders());
    if (result.ok) {
      // 如果当前筛选匹配，插入到列表
      const dto = result.data;
      if (matchesCurrentFilter(dto)) {
        groups.value = [dto, ...groups.value];
        total.value += 1;
      }
      return { ok: true, dto };
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
          groups.value[idx] = dto;
        } else {
          groups.value = [dto, ...groups.value];
          total.value += 1;
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
      return { ok: false, versionConflict: true };
    }

    error.value = result.error.message;
    return {
      ok: false,
      fieldErrors: (result.error as Record<string, unknown>).fieldErrors as
        Record<string, string[]> | undefined,
    };
  }

  /** 检查 DTO 是否匹配当前筛选条件 */
  function matchesCurrentFilter(dto: AdminGroupDto): boolean {
    // 回收站模式
    if (deleted.value) {
      return dto.deletedAt !== null;
    }
    // 正常模式：检查状态是否在筛选列表中
    if (!statuses.value.includes(dto.status)) return false;
    // 非软删除
    if (dto.deletedAt !== null) return false;
    return true;
  }

  async function softDelete(id: string): Promise<boolean> {
    const result = await api.delete(`/admin/${id}`, deleteResponseSchema, csrfHeaders());
    if (result.ok) {
      groups.value = groups.value.filter((g) => g.id !== id);
      return true;
    }
    return false;
  }

  async function restore(id: string): Promise<boolean> {
    const result = await api.post(`/admin/${id}/restore`, adminGroupDtoSchema, {}, csrfHeaders());
    if (result.ok) {
      const idx = groups.value.findIndex((g) => g.id === id);
      if (idx !== -1) {
        groups.value[idx] = result.data;
      } else {
        groups.value = [...groups.value, result.data];
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
      return true;
    }
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
