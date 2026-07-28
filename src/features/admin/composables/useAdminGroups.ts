import { ref } from "vue";
import { api } from "@/shared/api/client";
import { adminGroupDtoSchema, type AdminGroupDto } from "@shared/contracts/group";
import { z } from "zod";

const listResponseSchema = z.object({
  items: z.array(adminGroupDtoSchema),
  nextCursor: z.string().nullable(),
  rotationWindow: z.string(),
});

const deleteResponseSchema = z.object({ id: z.string() });

export function useAdminGroups(csrfToken: () => string) {
  const groups = ref<AdminGroupDto[]>([]);
  const loading = ref(false);
  const error = ref("");

  const statusFilter = ref<string>("");
  const deletedFilter = ref(false);

  // 添加 CSRF token 到 headers
  const csrfHeaders = (): Record<string, string> => ({
    "X-CSRF-Token": csrfToken(),
  });

  async function fetchGroups() {
    loading.value = true;
    error.value = "";
    try {
      const qs = new URLSearchParams();
      if (statusFilter.value) qs.set("status", statusFilter.value);
      if (deletedFilter.value) qs.set("deleted", "true");
      qs.set("limit", "50");

      const result = await api.get(`/admin?${qs.toString()}`, listResponseSchema);
      if (result.ok) {
        groups.value = result.data.items;
      } else {
        error.value = result.error.message;
      }
    } catch {
      error.value = "加载失败";
    } finally {
      loading.value = false;
    }
  }

  async function updateGroup(id: string, fields: Record<string, unknown>): Promise<boolean> {
    const result = await api.patch(`/admin/${id}`, adminGroupDtoSchema, fields, csrfHeaders());
    if (result.ok) {
      const idx = groups.value.findIndex((g) => g.id === id);
      if (idx !== -1) groups.value[idx] = result.data;
      return true;
    }
    error.value = result.error.message;
    return false;
  }

  async function softDelete(id: string): Promise<boolean> {
    const result = await api.delete(`/admin/${id}`, deleteResponseSchema, csrfHeaders());
    if (result.ok) {
      // 就地移除，避免 fetchGroups 重新渲染导致滚动跳顶
      groups.value = groups.value.filter((g) => g.id !== id);
      return true;
    }
    return false;
  }

  async function restore(id: string): Promise<boolean> {
    const result = await api.post(`/admin/${id}/restore`, adminGroupDtoSchema, {}, csrfHeaders());
    if (result.ok) {
      // 恢复到原位：替换列表中对应项
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
    const result = await api.delete(`/admin/trash/groups/${id}`, deleteResponseSchema, csrfHeaders());
    if (result.ok) {
      // 就地移除
      groups.value = groups.value.filter((g) => g.id !== id);
      return true;
    }
    return false;
  }

  return {
    groups,
    loading,
    error,
    statusFilter,
    deletedFilter,
    fetchGroups,
    updateGroup,
    softDelete,
    restore,
    permanentDelete,
  };
}
