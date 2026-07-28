<script setup lang="ts">
/* eslint-disable no-useless-assignment */
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { useAdminAuth } from "@/features/admin/composables/useAdminAuth";
import { useAdminGroups } from "@/features/admin/composables/useAdminGroups";
import AdminGroupTable from "@/features/admin/components/AdminGroupTable.vue";
import AdminGroupDrawer from "@/features/admin/components/AdminGroupDrawer.vue";
import AdminStatusFilters from "@/features/admin/components/AdminStatusFilters.vue";
import AdminGroupSearch from "@/features/admin/components/AdminGroupSearch.vue";
import TrashConfirmDialog from "@/features/admin/components/TrashConfirmDialog.vue";
import AdminDashboard from "@/features/admin/components/AdminDashboard.vue";
import type { AdminGroupDto } from "@shared/contracts/group";
import type { AdminSortField } from "@shared/contracts/group";

const router = useRouter();
const { isAuthenticated, csrfToken, loading: authLoading, check, doLogout } = useAdminAuth();

const admin = useAdminGroups(() => csrfToken.value);

onMounted(async () => {
  await check();
  if (!isAuthenticated.value) {
    void router.push("/admin/login");
    return;
  }
  void admin.fetchGroups();
});

// Drawer state
const drawerOpen = ref(false);
const editingGroup = ref<AdminGroupDto | null>(null);
const saving = ref(false);
const drawerFieldErrors = ref<Record<string, string[]> | undefined>(undefined);
const drawerGlobalError = ref("");

function openCreate() {
  if (admin.deleted.value) return;
  editingGroup.value = null;
  drawerFieldErrors.value = undefined;
  drawerGlobalError.value = "";
  drawerOpen.value = true;
}

function openEdit(group: AdminGroupDto) {
  if (admin.deleted.value) return;
  editingGroup.value = group;
  drawerFieldErrors.value = undefined;
  drawerGlobalError.value = "";
  drawerOpen.value = true;
}

async function handleSave(data: Record<string, unknown>) {
  saving.value = true;
  drawerFieldErrors.value = undefined;
  drawerGlobalError.value = "";
  try {
    if (editingGroup.value) {
      const result = await admin.updateGroup(editingGroup.value.id, data);
      if (result.ok) {
        drawerOpen.value = false;
        editingGroup.value = null;
      } else if (result.versionConflict) {
        drawerGlobalError.value = "群聊已被其他会话修改，请刷新列表后重新编辑。";
      } else if (result.fieldErrors) {
        drawerFieldErrors.value = result.fieldErrors;
      }
    } else {
      const result = await admin.createGroup(data);
      if (result.ok) {
        drawerOpen.value = false;
        editingGroup.value = null;
      } else if (result.fieldErrors) {
        drawerFieldErrors.value = result.fieldErrors;
      }
    }
  } finally {
    saving.value = false;
  }
}

// Trash dialog
const trashOpen = ref(false);
const trashGroup = ref<AdminGroupDto | null>(null);

function confirmPermanentDelete(id: string) {
  const g = admin.groups.value.find((g) => g.id === id);
  if (!g) return;
  trashGroup.value = g;
  trashOpen.value = true;
}

async function handlePermanentDelete() {
  if (trashGroup.value) {
    await admin.permanentDelete(trashGroup.value.id);
  }
  trashOpen.value = false;
  trashGroup.value = null;
}

const activeTab = ref<"groups" | "dashboard">("groups");

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
          <button
            class="rounded px-3 py-1.5 text-sm"
            :class="
              activeTab === 'groups' ? 'bg-brand-primary text-white' : 'bg-gray-100 text-gray-600'
            "
            @click="activeTab = 'groups'"
          >
            群聊管理
          </button>
          <button
            class="rounded px-3 py-1.5 text-sm"
            :class="
              activeTab === 'dashboard'
                ? 'bg-brand-primary text-white'
                : 'bg-gray-100 text-gray-600'
            "
            @click="activeTab = 'dashboard'"
          >
            运行数据
          </button>
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
      <!-- 仪表盘 Tab -->
      <AdminDashboard v-if="activeTab === 'dashboard'" />

      <!-- 群聊管理 Tab -->
      <template v-if="activeTab === 'groups'">
        <!-- 工具栏 -->
        <div class="mb-4 flex flex-wrap items-center gap-3">
          <AdminStatusFilters
            :statuses="admin.statuses.value"
            :deleted="admin.deleted.value"
            @toggle-status="admin.toggleStatus"
            @toggle-deleted="admin.toggleDeleted"
          />
          <AdminGroupSearch
            v-if="!admin.deleted.value"
            :model-value="admin.searchQuery.value"
            :disabled="admin.deleted.value"
            @update:model-value="admin.setSearch"
            @search="admin.searchImmediate"
            @clear="admin.searchImmediate"
          />
          <button
            v-if="!admin.deleted.value"
            class="ml-auto rounded bg-brand-primary px-4 py-1.5 text-sm text-white"
            @click="openCreate"
          >
            新建群聊
          </button>
        </div>

        <p v-if="admin.error.value" class="mb-4 text-sm text-red-500">{{ admin.error.value }}</p>

        <!-- 群聊表格 -->
        <AdminGroupTable
          :groups="admin.groups.value"
          :loading="admin.loading.value"
          :deleted-filter="admin.deleted.value"
          :total="admin.total.value"
          :next-cursor="admin.nextCursor.value"
          :sort-by="admin.sortBy.value"
          :sort-dir="admin.sortDir.value"
          @edit="openEdit"
          @soft-delete="
            (id: string) => {
              void admin.softDelete(id);
            }
          "
          @restore="
            (id: string) => {
              void admin.restore(id);
            }
          "
          @permanent-delete="(id: string) => confirmPermanentDelete(id)"
          @sort="(field: AdminSortField) => admin.setSort(field)"
          @load-more="void admin.loadMore()"
        />

        <!-- 编辑抽屉 -->
        <AdminGroupDrawer
          :group="editingGroup"
          :open="drawerOpen"
          :saving="saving"
          :server-field-errors="drawerFieldErrors"
          :server-error="drawerGlobalError"
          @update:open="drawerOpen = $event"
          @save="handleSave"
        />

        <!-- 永久删除确认 -->
        <TrashConfirmDialog
          :open="trashOpen"
          :group-title="trashGroup?.title ?? ''"
          @confirm="handlePermanentDelete"
          @cancel="trashOpen = false"
        />
      </template>
    </div>
  </main>
</template>
