import { ref } from "vue";
import { api } from "@/shared/api/client";
import { adminGroupDtoSchema, type AdminGroupDto } from "@shared/contracts/group";
import { z } from "zod";

const listResponseSchema = z.object({
  items: z.array(adminGroupDtoSchema),
  nextCursor: z.string().nullable(),
  rotationWindow: z.string(),
});

export function useAdminGroups(_csrfToken: () => string) {
  const groups = ref<AdminGroupDto[]>([]);
  const loading = ref(false);
  const error = ref("");

  const statusFilter = ref<string>("");
  const deletedFilter = ref(false);

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
    const result = await api.patch(`/admin/${id}`, adminGroupDtoSchema, fields);
    if (result.ok) {
      const idx = groups.value.findIndex((g) => g.id === id);
      if (idx !== -1) groups.value[idx] = result.data;
      return true;
    }
    error.value = result.error.message;
    return false;
  }

  async function softDelete(id: string): Promise<boolean> {
    const result = await api.delete(`/admin/${id}`, adminGroupDtoSchema);
    if (result.ok) {
      await fetchGroups();
      return true;
    }
    return false;
  }

  async function restore(id: string): Promise<boolean> {
    const result = await api.post(`/admin/${id}/restore`, adminGroupDtoSchema, {});
    if (result.ok) {
      await fetchGroups();
      return true;
    }
    return false;
  }

  async function permanentDelete(id: string): Promise<boolean> {
    const result = await api.delete(`/admin/trash/groups/${id}`, adminGroupDtoSchema);
    if (result.ok) {
      await fetchGroups();
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
