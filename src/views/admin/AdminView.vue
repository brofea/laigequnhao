<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import { ref, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAdminAuth } from "@/features/admin/composables/useAdminAuth";
import { useAdminGroups } from "@/features/admin/composables/useAdminGroups";
import AdminGroupTable from "@/features/admin/components/AdminGroupTable.vue";
import AdminGroupForm from "@/features/admin/components/AdminGroupForm.vue";
import TrashConfirmDialog from "@/features/admin/components/TrashConfirmDialog.vue";
import type { AdminGroupDto } from "@shared/contracts/group";

const router = useRouter();
const { isAuthenticated, csrfToken, loading: authLoading, check, doLogout } = useAdminAuth();
const {
  groups,
  loading: groupsLoading,
  error: groupsError,
  statusFilter,
  deletedFilter,
  fetchGroups,
  updateGroup,
  softDelete,
  restore,
  permanentDelete,
} = useAdminGroups(() => csrfToken.value);

onMounted(async () => {
  await check();
  if (!isAuthenticated.value) {
    void router.push("/admin/login");
    return;
  }
  void fetchGroups();
});

watch([statusFilter, deletedFilter], () => {
  void fetchGroups();
});

// Form state
const formOpen = ref(false);
const editingGroup = ref<AdminGroupDto | null>(null);

function openCreate() {
  editingGroup.value = null;
  formOpen.value = true;
}

function openEdit(group: AdminGroupDto) {
  editingGroup.value = group;
  formOpen.value = true;
}

async function handleSave(data: Record<string, unknown>) {
  if (editingGroup.value) {
    await updateGroup(editingGroup.value.id, data);
  }
  void fetchGroups();
}

// Trash dialog
const trashOpen = ref(false);
const trashGroup = ref<AdminGroupDto | null>(null);

function confirmPermanentDelete(id: string) {
  const g = groups.value.find((g) => g.id === id);
  if (!g) return;
  trashGroup.value = g;
  trashOpen.value = true;
}

async function handlePermanentDelete() {
  if (trashGroup.value) {
    await permanentDelete(trashGroup.value.id);
  }
  trashOpen.value = false;
  trashGroup.value = null;
}

async function handleLogout() {
  await doLogout();
  void router.push("/admin/login");
}
</script>

<template>
  <main class="min-h-screen bg-gray-50">
    <header class="border-b bg-white">
      <div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <h1 class="text-xl font-bold text-gray-900">管理后台</h1>
        <div class="flex items-center gap-4">
          <span v-if="authLoading" class="text-sm text-gray-400">加载中...</span>
          <button
            v-else
            class="rounded bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200"
            @click="handleLogout"
          >
            退出
          </button>
        </div>
      </div>
    </header>

    <div class="mx-auto max-w-6xl px-4 py-6">
      <!-- 工具栏 -->
      <div class="mb-4 flex flex-wrap items-center gap-3">
        <select v-model="statusFilter" class="rounded border px-3 py-1.5 text-sm">
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="published">已发布</option>
          <option value="rejected">已拒绝</option>
          <option value="delisted">已下架</option>
        </select>

        <label class="flex items-center gap-1.5 text-sm">
          <input v-model="deletedFilter" type="checkbox" class="rounded" />
          回收站
        </label>

        <button
          v-if="!deletedFilter"
          class="ml-auto rounded bg-brand-primary px-4 py-1.5 text-sm text-white"
          @click="openCreate"
        >
          新建群聊
        </button>
      </div>

      <p v-if="groupsError" class="mb-4 text-sm text-red-500">{{ groupsError }}</p>

      <!-- 群聊表格 -->
      <AdminGroupTable
        :groups="groups"
        :loading="groupsLoading"
        :deleted-filter="deletedFilter"
        @edit="openEdit"
        @soft-delete="
          (id: string) => {
            void softDelete(id);
          }
        "
        @restore="
          (id: string) => {
            void restore(id);
          }
        "
        @permanent-delete="(id: string) => confirmPermanentDelete(id)"
      />

      <!-- 编辑表单 -->
      <AdminGroupForm
        :group="editingGroup"
        :open="formOpen"
        @update:open="formOpen = $event"
        @save="handleSave"
      />

      <!-- 永久删除确认 -->
      <TrashConfirmDialog
        :open="trashOpen"
        :group-title="trashGroup?.title ?? ''"
        @confirm="handlePermanentDelete"
        @cancel="trashOpen = false"
      />
    </div>
  </main>
</template>
