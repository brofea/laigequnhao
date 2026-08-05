<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import { submitGroup } from "@/features/groups/api";
import { useGroupDirectory } from "@/features/groups/composables/useGroupDirectory";
import { useLikedGroups } from "@/features/groups/composables/useLikedGroups";
import { useDiscover } from "@/features/groups/composables/useDiscover";
import { useTags } from "@/features/groups/composables/useTags";
import { usePublicBoards } from "@/features/groups/composables/usePublicBoards";
import { useGroupDetail } from "@/features/groups/composables/useGroupDetail";
import { toDemoGroup, toDemoBoardAdmin, toDemoBoardPublic } from "@/features/groups/adapters";
import { useAdminGroups } from "@/features/admin/composables/useAdminGroups";
import { useAdminBoards } from "@/features/admin/composables/useAdminBoards";
import { fetchAdminGroupsPage } from "@/features/admin/api";
import {
  purgePendingAdminImages,
  stagePendingAdminImages,
  type PendingAdminImages,
  type StagedAdminImages,
} from "@/features/admin/pending-images";
import siteConfig from "../../site.config";
import AdminTable from "./AdminTable.vue";
import Badge from "./Badge.vue";
import BoardAddGroupForm from "./BoardAddGroupForm.vue";
import BoardManagement from "./BoardManagement.vue";
import BoardEditForm from "./BoardEditForm.vue";
import Button from "./Button.vue";
import Carousel from "./Carousel.vue";
import Dialog from "./Dialog.vue";
import GroupCard from "./GroupCard.vue";
import Icon from "./Icon.vue";
import Input from "./Input.vue";
import Select from "./Select.vue";
import StatsPage from "./StatsPage.vue";
import AdminEditForm from "./AdminEditForm.vue";
import Toast, { type ToastItem } from "./Toast.vue";
import { groupStatusLabels, type DemoBoard, type DemoGroup } from "../data/fixtures";
import { useTheme, type ThemePreference } from "@/features/theme/useTheme";
import { usePendingActions } from "@/shared/composables/usePendingActions";

type ViewName = "home" | "admin";
type AdminTab = "groups" | "boards" | "stats";
type AdminSortField = "title" | "status" | "tags" | "kind" | "likes" | "platform";
type AdminSortDirection = "asc" | "desc" | null;
type AdminEditBusyAction = "save" | "delete" | "remove";
type AdminTablePendingAction = {
  groupId: string;
  action: "remove" | "restore" | "purge";
};
type BoardManagementPendingAction = {
  boardId?: string;
  action: "create" | "reorder" | "edit" | "delete" | "add-group" | "move-member" | "remove-member";
  groupId?: string;
  direction?: "up" | "down";
};

const { preference: themePreference, resolvedTheme, setPreference } = useTheme();
const props = defineProps<{ initialView: ViewName; csrfToken?: string }>();
const view = ref<ViewName>(props.initialView);
const route = useRoute();
const router = useRouter();
const publicDirectory = useGroupDirectory();
const likedGroups = useLikedGroups();
const adminDirectory = useAdminGroups(
  () => props.csrfToken ?? "",
  () => props.initialView === "admin",
);
const adminBoards = useAdminBoards(() => props.csrfToken ?? "");
// 模板顶层解包：分页与总数（Ref 从 composable 提升到 setup 顶层）
const adminPage = adminDirectory.page;
const adminTotalItems = adminDirectory.totalItems;
const adminTotalPages = adminDirectory.totalPages;
const discover = useDiscover();
const tags = useTags();
const publicBoards = usePublicBoards();
const groupDetail = useGroupDetail();
const adminTab = ref<AdminTab>("groups");
const searchQuery = ref("");
const activeTag = ref("");
const selectedGroupId = ref<string | null>(null);
const selectedAdminGroupId = ref<string | null>(null);
const selectedAdminGroupContext = ref<{ boardId: string; groupId: string } | null>(null);
const selectedBoardId = ref<string | null>(null);
const boardCreateDraft = ref<DemoBoard | null>(null);
const selectedBoardAddGroupId = ref<string | null>(null);
const boardAddGroupPendingGroupId = ref<string | null>(null);
const boardListVersion = ref(0);
const adminGroupPool = ref<DemoGroup[]>([]);
const publicSubmitGroup = ref<DemoGroup | null>(null);
const publicSubmitBusy = ref(false);
const publicSubmitSuccess = ref(false);
const adminCreateGroup = ref<DemoGroup | null>(null);
const adminCreateSaveBusy = ref(false);
const adminSaveBusy = ref(false);
const adminQuery = ref("");
const adminFilter = ref("全部状态");
const showRecycleBin = ref(false);
const adminSortField = ref<AdminSortField | null>(null);
const adminSortDirection = ref<AdminSortDirection>(null);
const toastItems = ref<ToastItem[]>([]);
let toastId = 0;
const pendingActions = usePendingActions();
const isPending = pendingActions.isPending;

function groupActionKey(groupId: string, action: string) {
  return `group:${groupId}:${action}`;
}

function boardActionKey(boardId: string, action: string, memberId?: string, detail?: string) {
  return ["board", boardId, action, memberId, detail].filter(Boolean).join(":");
}

const adminTablePendingActions = computed<AdminTablePendingAction[]>(() =>
  adminDirectory.groups.value.flatMap((group) =>
    (["remove", "restore", "purge"] as const)
      .filter((action) =>
        isPending(groupActionKey(group.id, action === "remove" ? "delete" : action)),
      )
      .map((action) => ({ groupId: group.id, action })),
  ),
);

const boardPendingActions = computed<BoardManagementPendingAction[]>(() => {
  const actions: BoardManagementPendingAction[] = [];
  for (const board of boards.value) {
    for (const action of ["edit", "delete", "add-group"] as const) {
      if (isPending(boardActionKey(board.id, action))) actions.push({ boardId: board.id, action });
    }
    if (isPending(boardActionKey(board.id, "reorder"))) {
      actions.push({ boardId: board.id, action: "reorder" });
    }
    for (const memberId of board.members) {
      for (const direction of ["up", "down"] as const) {
        if (isPending(boardActionKey(board.id, "move-member", memberId, direction))) {
          actions.push({ boardId: board.id, groupId: memberId, action: "move-member", direction });
        }
      }
      if (isPending(boardActionKey(board.id, "remove-member", memberId))) {
        actions.push({ boardId: board.id, groupId: memberId, action: "remove-member" });
      }
    }
  }
  if (isPending("board:create")) actions.push({ action: "create" });
  return actions;
});

/** 点赞本地状态来源（adapter 依赖注入） */
const likeStateSource = {
  get(groupId: string) {
    return localLikeState.value[groupId];
  },
  isLiked(groupId: string) {
    return likedGroups.likedIds.value.has(groupId);
  },
};

onMounted(() => {
  if (props.initialView === "home") {
    void discover.load();
    void tags.load();
    void publicBoards.load();
    window.addEventListener("scroll", onWindowScroll, { passive: true });
  } else {
    void adminBoards.load();
    void loadAdminGroupPool();
  }
});

onUnmounted(() => {
  removeScrollListener();
});

const localLikeState = ref<Record<string, { liked: boolean; likes: number }>>({});

const publicVisualGroups = computed(() =>
  publicDirectory.groups.value.map((group) => toDemoGroup(group, likeStateSource)),
);
const adminVisualGroups = computed(() =>
  adminDirectory.groups.value.map((group) => toDemoGroup(group, likeStateSource)),
);
const discoverGroups = computed(() =>
  discover.items.value.map((group) => toDemoGroup(group, likeStateSource)),
);
/** 板块：公开端取启用板块（已发布成员），管理端取全部板块（全部成员） */
const boards = computed<DemoBoard[]>(() => {
  if (view.value === "admin") {
    return adminBoards.boards.value.map((board) =>
      toDemoBoardAdmin(board, adminBoards.membersByBoard.value[board.id] ?? []),
    );
  }
  return publicBoards.boards.value.map(toDemoBoardPublic);
});
/** 板块添加群组选择器的候选池：管理端优先取已发布+已下架群组（前 50 条） */
const boardGroupPool = computed(() =>
  adminGroupPool.value.length > 0 ? adminGroupPool.value : publicVisualGroups.value,
);
const publishedGroups = computed(() =>
  publicVisualGroups.value.filter((group) => group.status === "published" && !group.inRecycleBin),
);
const visibleTags = computed(() =>
  tags.tags.value.map((item) => ({ label: item.tag, count: item.count })),
);
const selectedGroup = computed(() => {
  if (groupDetail.group.value) return toDemoGroup(groupDetail.group.value, likeStateSource);
  return selectedGroupId.value
    ? publishedGroups.value.find((group) => group.id === selectedGroupId.value)
    : undefined;
});
const dialogAvatarFailed = ref(false);
watch(
  () => selectedGroup.value?.logoUrl,
  () => {
    dialogAvatarFailed.value = false;
  },
);
const selectedAdminGroup = computed(() =>
  selectedAdminGroupId.value
    ? adminVisualGroups.value.find((group) => group.id === selectedAdminGroupId.value)
    : undefined,
);
const selectedBoard = computed(() =>
  selectedBoardId.value
    ? boards.value.find((board) => board.id === selectedBoardId.value)
    : undefined,
);
const selectedBoardAddGroup = computed(() =>
  selectedBoardAddGroupId.value
    ? boards.value.find((board) => board.id === selectedBoardAddGroupId.value)
    : undefined,
);
const selectedAdminGroupBusyAction = computed<AdminEditBusyAction | null>(() => {
  const group = selectedAdminGroup.value;
  if (!group) return null;
  if (adminSaveBusy.value || isPending(groupActionKey(group.id, "save"))) return "save";
  if (isPending(groupActionKey(group.id, "delete"))) return "delete";
  const context = selectedAdminGroupContext.value;
  if (context && isPending(boardActionKey(context.boardId, "remove-member", context.groupId))) {
    return "remove";
  }
  return null;
});
let boardCreateSequence = 0;

const isSearchMode = computed(() => Boolean(searchQuery.value.trim()) || Boolean(activeTag.value));
const filteredGroups = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  return publishedGroups.value.filter((group) => {
    const matchesQuery =
      !query ||
      [group.title, group.description, group.platform, ...group.tags]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query);
    const matchesTag = !activeTag.value || group.tags.includes(activeTag.value);
    return matchesQuery && matchesTag;
  });
});
const filteredAdminGroups = computed(() => {
  const filtered = adminVisualGroups.value.filter((group) => {
    const query = adminQuery.value.trim().toLocaleLowerCase();
    const matchesQuery = !query || group.title.toLocaleLowerCase().includes(query);
    const matchesRecycleBin = showRecycleBin.value || !group.inRecycleBin;
    // 回收站模式忽略状态筛选（服务端 deleted=true 返回全部状态）
    const matchesFilter =
      showRecycleBin.value ||
      adminFilter.value === "全部状态" ||
      groupStatusLabels[group.status] === adminFilter.value;
    return matchesQuery && matchesRecycleBin && matchesFilter;
  });
  if (!adminSortField.value || !adminSortDirection.value) return filtered;
  const field = adminSortField.value;
  const direction = adminSortDirection.value === "asc" ? 1 : -1;
  return [...filtered].sort((left, right) => {
    const leftValue = field === "tags" ? left.tags.join(" ") : String(left[field]);
    const rightValue = field === "tags" ? right.tags.join(" ") : String(right[field]);
    if (field === "likes") return (left.likes - right.likes) * direction;
    return leftValue.localeCompare(rightValue, "zh-Hans") * direction;
  });
});

function showToast(message: string, tone: ToastItem["tone"] = "success") {
  const id = ++toastId;
  toastItems.value = [...toastItems.value, { id, tone, message }];
  window.setTimeout(() => {
    closeToast(id);
  }, 3200);
}

function closeToast(id: number) {
  toastItems.value = toastItems.value.filter((item) => item.id !== id);
}

function setSearch(value: string) {
  searchQuery.value = value;
  activeTag.value = "";
  publicDirectory.search(value);
}

function setAdminSearch(value: string) {
  adminQuery.value = value;
  adminDirectory.setSearch(value);
}

function toggleRecycleBin() {
  showRecycleBin.value = !showRecycleBin.value;
  adminDirectory.toggleDeleted();
}

function useTag(tag: string) {
  activeTag.value = activeTag.value === tag ? "" : tag;
  searchQuery.value = activeTag.value;
  publicDirectory.searchImmediate(activeTag.value);
}

async function toggleLike(group: DemoGroup) {
  const actionKey = `like:${group.id}`;
  if (!pendingActions.start(actionKey)) return;
  try {
    const result = await likedGroups.toggle(group.id, group.liked);
    if (result === null) {
      showToast("点赞失败，请稍后重试", "warning");
      return;
    }
    localLikeState.value = {
      ...localLikeState.value,
      [group.id]: { liked: result.liked, likes: result.likeCount },
    };
    showToast(result.liked ? "点赞成功" : "已取消点赞", "success");
  } finally {
    pendingActions.finish(actionKey);
  }
}

function openGroup(group: DemoGroup) {
  selectedGroupId.value = group.id;
  // 详情统一走 ?group= 深链接：路由变化驱动真实详情请求与浏览器历史
  void router.replace({ query: { ...route.query, group: group.id } });
}

function closeGroupDialog() {
  selectedGroupId.value = null;
  groupDetail.close();
}

function openBoardEdit(board: DemoBoard) {
  selectedBoardId.value = board.id;
}

function openAdminGroupEdit(group: DemoGroup) {
  selectedAdminGroupContext.value = null;
  selectedAdminGroupId.value = group.id;
}

function openBoardMemberEdit(group: DemoGroup, board: DemoBoard) {
  selectedAdminGroupContext.value = { boardId: board.id, groupId: group.id };
  selectedAdminGroupId.value = group.id;
}

function closeAdminGroupEdit() {
  selectedAdminGroupId.value = null;
  selectedAdminGroupContext.value = null;
}

function openBoardCreateDialog() {
  boardCreateDraft.value = {
    id: `board-new-${String(++boardCreateSequence)}`,
    title: "",
    description: "",
    enabled: true,
    memberCount: 0,
    members: [],
  };
}

function openBoardAddGroupDialog(board: DemoBoard) {
  selectedBoardAddGroupId.value = board.id;
}

function openPublicSubmitDialog() {
  publicSubmitSuccess.value = false;
  publicSubmitGroup.value = {
    id: "public-submit-sample",
    title: "",
    platform: "微信群",
    kind: "兴趣",
    description: "",
    tags: [],
    likes: 0,
    liked: false,
    avatarState: "missing",
    status: "published",
    inRecycleBin: false,
    joinMethods: [],
    contact: "",
  };
}

function closePublicSubmitDialog() {
  if (publicSubmitBusy.value) return;
  publicSubmitGroup.value = null;
  publicSubmitSuccess.value = false;
}

function openAdminCreateDialog() {
  adminCreateGroup.value = {
    id: "admin-create-sample",
    title: "待编辑的新群组",
    platform: "微信群",
    kind: "兴趣",
    description: "这是管理工作台添加入口的本地编辑样例。",
    tags: ["待审核"],
    likes: 0,
    liked: false,
    avatarState: "missing",
    status: "published",
    inRecycleBin: false,
    joinMethods: [{ id: "admin-create-number", type: "number", label: "群号", value: "待填写" }],
  };
}

async function submitPublicGroup(next: DemoGroup, pendingImages: PendingAdminImages) {
  if (publicSubmitBusy.value || !pendingActions.start("public:submit")) return;
  publicSubmitBusy.value = true;
  try {
    const groupNumber = next.joinMethods.find((method) => method.type === "number")?.value;
    const url = next.joinMethods.find((method) => method.type === "link")?.value;
    const result = await submitGroup(
      {
        title: next.title,
        kind: next.kind === "工具" ? "official" : "interest",
        platform: next.platform,
        groupNumber: groupNumber || undefined,
        url: url || undefined,
        tags: next.tags.length ? next.tags : undefined,
        description: next.description || undefined,
        contact: next.contact?.trim() || undefined,
      },
      pendingImages.logo,
    );
    if (!result.ok) {
      showToast(result.error.message, "warning");
      return;
    }
    publicSubmitSuccess.value = true;
  } catch {
    showToast("提交失败，请稍后重试", "warning");
  } finally {
    publicSubmitBusy.value = false;
    pendingActions.finish("public:submit");
  }
}

const themeOptions: ThemePreference[] = ["system", "light", "dark"];
const themeLabels: Record<ThemePreference, string> = {
  system: "系统",
  light: "浅色",
  dark: "深色",
};

function cycleTheme() {
  const currentIndex = themeOptions.indexOf(themePreference.value);
  const next = themeOptions[(currentIndex + 1) % themeOptions.length] ?? "system";
  setPreference(next);
  showToast(`已切换为${themeLabels[next]}主题`, "info");
}

function themeIcon() {
  return themePreference.value === "dark"
    ? "moon"
    : themePreference.value === "light"
      ? "sun"
      : "system";
}

async function copyText(text: string, successMessage: string) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage, "success");
  } catch {
    showToast("复制失败，请手动复制", "warning");
  }
}

function copyJoinMethod(method: DemoGroup["joinMethods"][number]) {
  if (method.type === "number") {
    void copyText(method.value, "群号已复制");
  } else if (method.type === "link") {
    window.open(method.value, "_blank", "noopener");
  } else {
    void copyText(method.value, "二维码链接已复制");
  }
}

/** 是否为 iOS（iOS Safari 不支持直接下载到相册，需引导长按保存） */
function isIOSDevice() {
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua));
}

function saveQrCode(method: DemoGroup["joinMethods"][number]) {
  if (method.type !== "qr" || !method.value) return;
  if (isIOSDevice()) {
    // iOS：系统弹窗由长按图片触发（存储图像→选择保存位置/相册）
    showToast("长按二维码图片即可保存到相册", "info");
    return;
  }
  // 网页端：触发图片下载
  const link = document.createElement("a");
  link.href = method.value;
  link.download = "group-qr-code.jpg";
  document.body.appendChild(link);
  link.click();
  link.remove();
  showToast("二维码已保存", "success");
}

async function shareGroup() {
  if (!selectedGroup.value) return;
  await copyText(`${window.location.origin}/?group=${selectedGroup.value.id}`, "分享链接已复制");
}

/** 板块顺序批量更新（服务端原子写入；失败时重新拉取服务端顺序） */
async function applyBoards(next: DemoBoard[]) {
  const changedBoard = next.find(
    (board, index) => adminBoards.boards.value[index]?.id !== board.id,
  );
  if (!changedBoard) return;
  const actionKey = boardActionKey(changedBoard.id, "reorder");
  if (!pendingActions.start(actionKey)) return;
  try {
    const result = await adminBoards.reorder(next.map((board) => board.id));
    if (!result.ok) {
      showToast(
        result.conflict ? "板块列表已变化，请刷新后重试" : "板块顺序保存失败，请稍后重试",
        "warning",
      );
      void adminBoards.load();
    }
  } finally {
    pendingActions.finish(actionKey);
  }
}

function boardGroups(board: DemoBoard) {
  const real = publicBoards.boards.value.find((item) => item.id === board.id);
  return (real?.groups ?? []).map((group) => toDemoGroup(group, likeStateSource));
}

function cycleSort(field: AdminSortField) {
  if (adminSortField.value !== field) {
    adminSortField.value = field;
    adminSortDirection.value = "asc";
  } else if (adminSortDirection.value === "asc") {
    adminSortDirection.value = "desc";
  } else {
    adminSortField.value = null;
    adminSortDirection.value = null;
  }
  // 服务端排序同步：字段映射 + 回第一页
  if (adminSortField.value === null) {
    adminDirectory.setSort(undefined, "desc");
  } else {
    adminDirectory.setSort(
      adminSortField.value,
      adminSortDirection.value === "desc" ? "desc" : "asc",
    );
  }
}

/** 状态筛选（Select）变化 → 服务端状态集合并回第一页 */
watch(adminFilter, (label) => {
  const map: Record<string, import("@shared/domain").GroupStatus[]> = {
    全部状态: ["published", "delisted", "pending", "rejected"],
    已发布: ["published"],
    已下架: ["delisted"],
    待审核: ["pending"],
    已拒绝: ["rejected"],
  };
  adminDirectory.setStatuses(map[label] ?? ["published", "delisted", "pending", "rejected"]);
});

async function removeAdminGroup(group: DemoGroup) {
  const actionKey = groupActionKey(group.id, "delete");
  if (!pendingActions.start(actionKey)) return;
  try {
    const ok = await adminDirectory.softDelete(group.id);
    showToast(ok ? `已删除“${group.title}”` : "删除失败，请稍后重试", ok ? "success" : "warning");
  } finally {
    pendingActions.finish(actionKey);
  }
}

async function restoreAdminGroup(group: DemoGroup) {
  const actionKey = groupActionKey(group.id, "restore");
  if (!pendingActions.start(actionKey)) return;
  try {
    const ok = await adminDirectory.restore(group.id);
    showToast(ok ? `已恢复“${group.title}”` : "恢复失败，请稍后重试", ok ? "success" : "warning");
  } finally {
    pendingActions.finish(actionKey);
  }
}

const purgeConfirmGroup = ref<DemoGroup | null>(null);

function purgeAdminGroup(group: DemoGroup) {
  purgeConfirmGroup.value = group;
}

async function confirmPurgeGroup() {
  const group = purgeConfirmGroup.value;
  if (!group) return;
  const actionKey = groupActionKey(group.id, "purge");
  if (!pendingActions.start(actionKey)) return;
  try {
    const ok = await adminDirectory.purge(group.id);
    showToast(
      ok ? `已永久删除“${group.title}”` : "永久删除失败，请稍后重试",
      ok ? "success" : "warning",
    );
    if (ok) purgeConfirmGroup.value = null;
  } finally {
    pendingActions.finish(actionKey);
  }
}

function toJoinMethodPayload(group: DemoGroup) {
  return group.joinMethods.map((method, index) =>
    method.type === "number"
      ? { type: "group_number" as const, value: method.value.trim(), sortOrder: index }
      : method.type === "link"
        ? { type: "url" as const, url: method.value.trim(), sortOrder: index }
        : {
            type: "qr_code" as const,
            assetId: method.assetId ?? method.value,
            sortOrder: index,
          },
  );
}

function toAdminPayload(
  group: DemoGroup,
  version?: number,
):
  | import("@shared/contracts/group").GroupCreateInput
  | import("@shared/contracts/group").GroupUpdateInput {
  const payload: {
    title: string;
    description: string;
    kind: "official" | "interest";
    platform: string;
    status: import("@shared/domain").GroupStatus;
    tags: string[];
    joinMethods: import("@shared/contracts/group").JoinMethodInput[];
    auditNotes: string | null;
    logoR2Key: string | null;
  } = {
    title: group.title.trim(),
    description: group.description,
    kind: group.kind === "工具" ? "official" : "interest",
    platform: group.platform,
    status: group.status,
    tags: group.tags,
    joinMethods: toJoinMethodPayload(group),
    auditNotes: null,
    logoR2Key: group.logoR2Key ?? null,
  };
  return version === undefined ? payload : { ...payload, version };
}

function applyStagedAdminImages(next: DemoGroup, staged: { ok: true; data: StagedAdminImages }) {
  return {
    ...next,
    logoR2Key: staged.data.logo?.r2Key ?? next.logoR2Key,
    joinMethods: next.joinMethods.map((method) => {
      const asset = method.type === "qr" ? staged.data.qr[method.id] : undefined;
      return asset
        ? { ...method, assetId: asset.id, value: asset.publicUrl, imagePreviewUrl: asset.publicUrl }
        : method;
    }),
  };
}

async function saveAdminGroup(next: DemoGroup, pendingImages: PendingAdminImages) {
  const actionKey = groupActionKey(next.id, "save");
  if (adminSaveBusy.value || !pendingActions.start(actionKey)) return;
  adminSaveBusy.value = true;
  const current = adminDirectory.groups.value.find((item) => item.id === next.id);
  const csrfToken = props.csrfToken ?? "";
  let stagedIds: string[] = [];
  try {
    if (!current) {
      showToast("群组已不存在，请刷新后重试", "warning");
      return;
    }
    const staged = await stagePendingAdminImages(pendingImages, csrfToken);
    if (!staged.ok) {
      showToast(staged.error.message, "warning");
      return;
    }
    stagedIds = staged.data.stagedIds;
    const committed = applyStagedAdminImages(next, staged);
    const result = await adminDirectory.updateGroup(
      next.id,
      toAdminPayload(
        committed,
        current.version,
      ) as import("@shared/contracts/group").GroupUpdateInput,
    );
    if (!result.ok) {
      await purgePendingAdminImages(staged.data.stagedIds, csrfToken);
      stagedIds = [];
      showToast(
        result.versionConflict ? "群组已被其他会话修改，请刷新后重试" : "保存失败，请检查表单内容",
        "warning",
      );
      return;
    }
    closeAdminGroupEdit();
    showToast("群组修改已保存");
    // 板块成员表标题来自服务端快照，保存后刷新以同步标题/状态
    void adminBoards.load();
    void loadAdminGroupPool();
  } catch {
    if (stagedIds.length) await purgePendingAdminImages(stagedIds, csrfToken);
    showToast("保存失败，请稍后重试", "warning");
  } finally {
    adminSaveBusy.value = false;
    pendingActions.finish(actionKey);
  }
}

async function deleteAdminGroup(group: DemoGroup) {
  const actionKey = groupActionKey(group.id, "delete");
  if (!pendingActions.start(actionKey)) return;
  try {
    const ok = await adminDirectory.softDelete(group.id);
    if (ok) closeAdminGroupEdit();
    showToast(ok ? `已删除“${group.title}”` : "删除失败，请稍后重试", ok ? "success" : "warning");
  } finally {
    pendingActions.finish(actionKey);
  }
}

async function removeGroupFromBoard() {
  const context = selectedAdminGroupContext.value;
  if (!context) return;
  const group = boardGroupPool.value.find((item) => item.id === context.groupId);
  const actionKey = boardActionKey(context.boardId, "remove-member", context.groupId);
  if (!pendingActions.start(actionKey)) return;
  try {
    const result = await adminBoards.removeMember(context.boardId, context.groupId);
    if (!result.ok) {
      showToast("移除成员失败，请稍后重试", "warning");
      return;
    }
    closeAdminGroupEdit();
    showToast(`已将“${group?.title ?? "该群组"}”移出板块`, "success");
  } finally {
    pendingActions.finish(actionKey);
  }
}

async function saveAdminCreateGroup(next: DemoGroup, pendingImages: PendingAdminImages) {
  if (adminCreateSaveBusy.value || !pendingActions.start("group:create")) return;
  adminCreateSaveBusy.value = true;
  const csrfToken = props.csrfToken ?? "";
  let stagedIds: string[] = [];
  try {
    const staged = await stagePendingAdminImages(pendingImages, csrfToken);
    if (!staged.ok) {
      showToast(staged.error.message, "warning");
      return;
    }
    stagedIds = staged.data.stagedIds;
    const committed = applyStagedAdminImages(next, staged);
    const result = await adminDirectory.createGroup(
      toAdminPayload(committed) as import("@shared/contracts/group").GroupCreateInput,
    );
    if (!result.ok) {
      await purgePendingAdminImages(staged.data.stagedIds, csrfToken);
      stagedIds = [];
      showToast("保存失败，请检查表单内容", "warning");
      return;
    }
    adminCreateGroup.value = null;
    showToast("新群组已保存");
  } catch {
    if (stagedIds.length) await purgePendingAdminImages(stagedIds, csrfToken);
    showToast("保存失败，请稍后重试", "warning");
  } finally {
    adminCreateSaveBusy.value = false;
    pendingActions.finish("group:create");
  }
}

/** 板块编辑保存 → 真实 PATCH（description 无服务端字段，仅提交标题/启停） */
async function saveBoard(next: DemoBoard) {
  const current = adminBoards.boards.value.find((board) => board.id === next.id);
  if (!current) {
    selectedBoardId.value = null;
    return;
  }
  const actionKey = boardActionKey(next.id, "edit");
  if (!pendingActions.start(actionKey)) return;
  try {
    const result = await adminBoards.updateBoard(next.id, {
      title: next.title,
      isEnabled: next.enabled,
      version: current.version,
    });
    if (!result.ok) {
      showToast(
        result.conflict ? "板块已被其他会话修改，请刷新后重试" : "板块保存失败，请稍后重试",
        "warning",
      );
      void adminBoards.load();
      return;
    }
    selectedBoardId.value = null;
    showToast("板块信息已保存");
  } finally {
    pendingActions.finish(actionKey);
  }
}

async function saveBoardCreate(next: DemoBoard) {
  if (!pendingActions.start("board:create")) return;
  try {
    const result = await adminBoards.createBoard(next.title);
    if (!result.ok) {
      showToast("创建板块失败，请稍后重试", "warning");
      return;
    }
    boardListVersion.value += 1;
    boardCreateDraft.value = null;
    showToast("新板块已保存");
  } finally {
    pendingActions.finish("board:create");
  }
}

async function deleteBoard(board: DemoBoard) {
  const actionKey = boardActionKey(board.id, "delete");
  if (!pendingActions.start(actionKey)) return;
  try {
    const result = await adminBoards.deleteBoard(board.id);
    if (!result.ok) {
      showToast("删除板块失败，请稍后重试", "warning");
      return;
    }
    boardListVersion.value += 1;
    showToast(`已删除“${board.title}”`);
  } finally {
    pendingActions.finish(actionKey);
  }
}

async function moveBoardMemberOp(board: DemoBoard, memberId: string, direction: "up" | "down") {
  const actionKey = boardActionKey(board.id, "move-member", memberId, direction);
  if (!pendingActions.start(actionKey)) return;
  try {
    const result = await adminBoards.moveMember(board.id, memberId, direction);
    if (!result.ok) {
      showToast("成员顺序更新失败，请稍后重试", "warning");
      void adminBoards.load();
    }
  } finally {
    pendingActions.finish(actionKey);
  }
}

async function removeBoardMemberOp(board: DemoBoard, memberId: string) {
  const group = boardGroupPool.value.find((item) => item.id === memberId);
  const actionKey = boardActionKey(board.id, "remove-member", memberId);
  if (!pendingActions.start(actionKey)) return;
  try {
    const result = await adminBoards.removeMember(board.id, memberId);
    if (!result.ok) {
      showToast("移除成员失败，请稍后重试", "warning");
      return;
    }
    showToast(`已将“${group?.title ?? "该群组"}”移出板块`, "success");
  } finally {
    pendingActions.finish(actionKey);
  }
}

async function addGroupToBoard(group: DemoGroup) {
  const board = selectedBoardAddGroup.value;
  if (!board || board.members.includes(group.id)) return;
  const actionKey = boardActionKey(board.id, "add-group");
  if (!pendingActions.start(actionKey)) return;
  boardAddGroupPendingGroupId.value = group.id;
  try {
    const result = await adminBoards.addMember(board.id, group.id);
    if (!result.ok) {
      showToast(result.reason ?? "添加失败，请稍后重试", "warning");
      return;
    }
    selectedBoardAddGroupId.value = null;
  } finally {
    boardAddGroupPendingGroupId.value = null;
    pendingActions.finish(actionKey);
  }
}

/** 板块添加群组候选池：已发布 + 已下架（前 50 条） */
async function loadAdminGroupPool() {
  const result = await fetchAdminGroupsPage({
    statuses: ["published", "delisted"],
    deleted: false,
    page: 1,
  });
  if (result.ok) {
    adminGroupPool.value = result.data.items.map((group) => toDemoGroup(group, likeStateSource));
  }
}

// 详情深链接口不可用时：非敏感提示并清理无效 group 参数
watch(
  () => groupDetail.error.value,
  (err) => {
    if (err) {
      showToast("群组不存在或不可公开", "warning");
      groupDetail.close();
    }
  },
);

// 无限滚动：接近页面底部且存在 cursor 时加载更多（公开目录）
function onWindowScroll() {
  if (view.value !== "home" || isSearchMode.value) return;
  if (publicDirectory.loading.value || !publicDirectory.nextCursor.value) return;
  if (window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 400) {
    void publicDirectory.loadMore();
  }
}

function removeScrollListener() {
  window.removeEventListener("scroll", onWindowScroll);
}
</script>

<template>
  <div class="app-shell" :data-theme="resolvedTheme">
    <header class="app-header">
      <RouterLink class="app-brand" to="/" aria-label="回到公开首页">
        <span class="app-brand__mark">{{ siteConfig.header.brandMark }}</span>
        <strong>{{ siteConfig.header.brandLabel }}</strong>
      </RouterLink>
      <div class="app-header__actions">
        <button class="theme-control" type="button" aria-label="切换主题偏好" @click="cycleTheme">
          <Icon :name="themeIcon()" size="16" />
          <span class="theme-control__label">{{ themeLabels[themePreference] }}</span>
        </button>
        <a
          class="github-control"
          :href="siteConfig.header.githubUrl"
          target="_blank"
          rel="noreferrer"
          :aria-label="siteConfig.header.githubLabel"
        >
          <Icon name="github" size="17" /><span>{{ siteConfig.header.githubLabel }}</span>
        </a>
        <Button
          v-if="view === 'home'"
          variant="normal"
          size="sm"
          icon="plus"
          @click="openPublicSubmitDialog()"
          ><span class="add-group-label">{{ siteConfig.header.addGroup.label }}</span></Button
        >
      </div>
    </header>

    <main class="app-main">
      <template v-if="view === 'home'">
        <section class="hero-section">
          <div class="hero-copy">
            <p class="eyebrow">A calmer way to find your people</p>
            <h1>找一个值得加入的群</h1>
            <p>用清晰的标签和真实的主题，发现下一场讨论、一次漫游，或一群同频的人。</p>
          </div>
          <div class="hero-orbit" aria-hidden="true">
            <span>发现</span><span>交流</span><span>同频</span>
          </div>
          <Input
            :model-value="searchQuery"
            label="搜索群组"
            placeholder="试试“设计”、城市或兴趣关键词"
            clearable
            :status="publicDirectory.error.value ? 'error' : 'default'"
            :help-text="publicDirectory.error.value ?? ''"
            @update:model-value="setSearch"
            @clear="setSearch('')"
          />
        </section>

        <template v-if="!isSearchMode">
          <section class="app-section app-section--carousel" aria-labelledby="discover-title">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Curated rotation</p>
                <h2 id="discover-title">发现新群</h2>
              </div>
              <span class="section-heading__hint">拖动卡片探索</span>
            </div>
            <Carousel
              :groups="discoverGroups"
              :like-loading="(groupId) => isPending(`like:${groupId}`)"
              @open="openGroup"
              @like="toggleLike"
            />
          </section>
          <section class="app-section" aria-labelledby="tag-title">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Browse by mood</p>
                <h2 id="tag-title">所有标签</h2>
              </div>
              <Button variant="quiet" size="sm" @click="showToast('标签聚合页仍是视觉样例')"
                >查看全部</Button
              >
            </div>
            <div class="tag-grid">
              <button
                v-for="tag in visibleTags"
                :key="tag.label"
                class="tag-card"
                type="button"
                :class="{ 'tag-card--active': activeTag === tag.label }"
                @click="useTag(tag.label)"
              >
                <span class="tag-card__hash">#</span><strong>{{ tag.label }}</strong
                ><span>{{ tag.count }} 个群</span>
              </button>
            </div>
          </section>
          <section
            v-for="board in boards"
            :key="board.id"
            class="app-section app-section--carousel"
            :class="{ 'app-section--empty-board': !board.enabled }"
            :aria-labelledby="`board-${board.id}`"
          >
            <div class="section-heading">
              <div>
                <p class="eyebrow">Collection / {{ board.enabled ? "公开板块" : "暂未启用" }}</p>
                <h2 :id="`board-${board.id}`">{{ board.title }}</h2>
              </div>
              <span class="section-heading__hint">{{ board.memberCount }} 个群</span>
            </div>
            <div v-if="board.enabled && boardGroups(board).length" class="board-carousel">
              <Carousel
                :groups="boardGroups(board)"
                :like-loading="(groupId) => isPending(`like:${groupId}`)"
                @open="openGroup"
                @like="toggleLike"
              />
            </div>
            <div v-else class="app-empty">
              <span class="app-empty__icon">○</span><strong>这个板块正在整理中</strong
              ><span>暂时没有公开群组，稍后再来看看。</span>
            </div>
          </section>
        </template>

        <section class="app-section" aria-labelledby="groups-title">
          <div class="section-heading">
            <div>
              <p class="eyebrow">
                {{ isSearchMode ? "Local search result" : "All published groups" }}
              </p>
              <h2 id="groups-title">{{ isSearchMode ? `搜索“${searchQuery}”` : "所有群组" }}</h2>
            </div>
            <span class="section-heading__hint">{{ filteredGroups.length }} 个结果</span>
          </div>
          <div
            v-if="publicDirectory.loading.value && filteredGroups.length === 0"
            class="skeleton-grid"
            aria-label="群组加载中"
          >
            <span v-for="index in 4" :key="index" class="app-skeleton-card"></span>
          </div>
          <div
            v-else-if="publicDirectory.error.value"
            class="app-alert app-alert--danger"
            role="alert"
          >
            <Icon name="warning" size="19" /><span
              ><strong>加载失败</strong><small>{{ publicDirectory.error.value }}</small></span
            ><Button variant="quiet" size="sm" @click="publicDirectory.retry()">重试</Button>
          </div>
          <div v-else-if="filteredGroups.length === 0" class="app-empty">
            <span class="app-empty__icon">⌁</span><strong>还没有匹配的群组</strong
            ><span>换一个关键词，或浏览上面的标签。</span
            ><Button variant="normal" size="sm" @click="setSearch('')">清除筛选</Button>
          </div>
          <div v-else class="group-grid">
            <GroupCard
              v-for="group in filteredGroups"
              :key="group.id"
              :group="group"
              :like-loading="isPending(`like:${group.id}`)"
              @open="openGroup"
              @like="toggleLike"
            />
          </div>
        </section>
      </template>

      <template v-else-if="view === 'admin'">
        <section class="admin-hero">
          <div>
            <p class="eyebrow">Workspace / local fixture</p>
            <h1>管理工作台</h1>
            <p>这里刻意把高密度信息放在清晰的表面上，验证表格与板块管理的功能优先级。</p>
          </div>
          <Badge tone="warning" dot>仅视觉样例</Badge>
        </section>
        <div class="admin-layout">
          <aside class="admin-sidebar" aria-label="管理端导航">
            <button
              type="button"
              :class="{ 'is-active': adminTab === 'groups' }"
              @click="adminTab = 'groups'"
            >
              <Icon name="menu" size="17" />群组管理</button
            ><button
              type="button"
              :class="{ 'is-active': adminTab === 'boards' }"
              @click="adminTab = 'boards'"
            >
              <Icon name="grip" size="17" />板块管理
            </button>
            <button
              type="button"
              :class="{ 'is-active': adminTab === 'stats' }"
              @click="adminTab = 'stats'"
            >
              <Icon name="system" size="17" />运行数据
            </button>
            <div class="admin-sidebar__note">
              <strong>表面规则</strong
              ><span>表格、弹窗和导航保持低阴影，状态用文字、边框和图标共同表达。</span>
            </div>
          </aside>
          <div class="admin-content">
            <template v-if="adminTab === 'groups'">
              <div class="admin-toolbar">
                <Input
                  :model-value="adminQuery"
                  label="管理端搜索"
                  placeholder="按标题查找"
                  clearable
                  :status="adminDirectory.error.value ? 'error' : 'default'"
                  :help-text="adminDirectory.error.value ?? ''"
                  @update:model-value="setAdminSearch"
                  @clear="setAdminSearch('')"
                /><Select
                  v-model="adminFilter"
                  label="状态"
                  :options="[
                    { value: '全部状态', label: '全部状态' },
                    { value: '已发布', label: '已发布' },
                    { value: '已下架', label: '已下架' },
                    { value: '待审核', label: '待审核' },
                    { value: '已拒绝', label: '已拒绝' },
                  ]"
                /><Button
                  variant="normal"
                  size="md"
                  icon="trash"
                  :aria-pressed="showRecycleBin"
                  @click="toggleRecycleBin"
                >
                  回收站
                </Button>
                <Button variant="normal" size="md" icon="plus" @click="openAdminCreateDialog">
                  添加新群
                </Button>
              </div>
              <div class="admin-summary">
                <strong>群组列表</strong
                ><span
                  >共 {{ adminTotalItems }} 条，第 {{ adminPage }} /
                  {{ adminTotalPages || 1 }} 页</span
                ><span class="admin-summary__sort"
                  >更新时间 <Icon name="chevron-down" size="14"
                /></span>
              </div>
              <AdminTable
                :groups="filteredAdminGroups"
                :sort-field="adminSortField"
                :sort-direction="adminSortDirection"
                :recycle-bin="showRecycleBin"
                :loading="adminDirectory.loading.value"
                :pending-actions="adminTablePendingActions"
                @open="openAdminGroupEdit"
                @remove="removeAdminGroup"
                @restore="restoreAdminGroup"
                @purge="purgeAdminGroup"
                @sort="cycleSort"
              />
              <div class="pagination">
                <Button
                  variant="quiet"
                  size="sm"
                  icon="arrow-left"
                  icon-only
                  aria-label="上一页"
                  :disabled="adminPage <= 1"
                  @click="adminDirectory.goToPage(adminPage - 1)"
                /><span class="pagination__current">{{ adminPage }}</span
                ><Button
                  variant="quiet"
                  size="sm"
                  v-if="adminTotalPages > adminPage"
                  type="button"
                  :disabled="false"
                  @click="adminDirectory.goToPage(adminPage + 1)"
                  >{{ adminPage + 1 }}</Button
                ><Button
                  variant="quiet"
                  size="sm"
                  v-if="adminTotalPages > adminPage + 1"
                  type="button"
                  :disabled="false"
                  @click="adminDirectory.goToPage(adminPage + 2)"
                  >{{ adminPage + 2 }}</Button
                ><Button
                  variant="quiet"
                  size="sm"
                  icon="arrow-right"
                  icon-only
                  aria-label="下一页"
                  :disabled="adminTotalPages > 0 && adminPage >= adminTotalPages"
                  @click="adminDirectory.goToPage(adminPage + 1)"
                />
              </div>
            </template>
            <BoardManagement
              v-else-if="adminTab === 'boards'"
              :key="boardListVersion"
              :boards="boards"
              :groups="boardGroupPool"
              :loading="adminBoards.loading.value"
              :create-busy="isPending('board:create')"
              :pending-actions="boardPendingActions"
              @reorder="applyBoards"
              @edit="openBoardEdit"
              @edit-group="openBoardMemberEdit"
              @add-board="openBoardCreateDialog"
              @add-group="openBoardAddGroupDialog"
              @delete="deleteBoard"
              @move-member="moveBoardMemberOp"
              @remove-member="removeBoardMemberOp"
              @toast="showToast($event, 'info')"
            />
            <StatsPage v-else />
          </div>
        </div>
      </template>
    </main>

    <footer class="app-footer">
      <span>{{ siteConfig.title }}</span
      ><span
        >当前主题 <strong>{{ resolvedTheme }}</strong> · reduced motion ready</span
      >
    </footer>

    <Dialog
      v-if="selectedGroup"
      :title="selectedGroup.title"
      labelled-by="group-dialog-title"
      test-id="group-detail-dialog"
      @close="closeGroupDialog"
    >
      <div class="group-dialog-summary">
        <span
          class="group-avatar group-avatar--large"
          :class="`group-avatar--${selectedGroup.avatarState}`"
          ><img
            v-if="
              selectedGroup.avatarState === 'ready' && selectedGroup.logoUrl && !dialogAvatarFailed
            "
            :src="selectedGroup.logoUrl"
            :alt="selectedGroup.title"
            @error="dialogAvatarFailed = true"
          /><span v-else-if="selectedGroup.avatarState === 'ready'">{{
            selectedGroup.title.slice(0, 1)
          }}</span
          ><span v-else>◎</span></span
        >
        <div>
          <Badge tone="accent">{{ selectedGroup.platform }}</Badge>
          <p>{{ selectedGroup.kind }} · {{ selectedGroup.tags.join(" · ") }}</p>
        </div>
      </div>
      <div class="group-dialog-scroll">
        <p class="group-dialog-description">{{ selectedGroup.description }}</p>
        <div class="join-methods">
          <h3>加入方式</h3>
          <div v-for="method in selectedGroup.joinMethods" :key="method.id" class="join-method">
            <span class="join-method__icon">{{
              method.type === "qr" ? "⌗" : method.type === "number" ? "#" : "↗"
            }}</span
            ><span
              ><strong>{{ method.label }}</strong
              ><small>{{ method.type === "qr" ? "扫描下方二维码" : method.value }}</small></span
            ><Button
              v-if="method.type === 'qr'"
              variant="quiet"
              size="sm"
              icon="download"
              @click="saveQrCode(method)"
              >保存</Button
            ><Button
              v-else
              variant="quiet"
              size="sm"
              :icon="method.type === 'link' ? 'external' : 'copy'"
              @click="copyJoinMethod(method)"
              >{{ method.type === "link" ? "访问" : "复制" }}</Button
            >
          </div>
        </div>
        <div
          v-if="selectedGroup.joinMethods.some((method) => method.type === 'qr')"
          class="qr-preview"
        >
          <div class="qr-placeholder">
            <img
              v-if="selectedGroup.joinMethods.find((m) => m.type === 'qr')?.value"
              :src="selectedGroup.joinMethods.find((m) => m.type === 'qr')?.value"
              alt="群组二维码"
              class="qr-placeholder__image"
            />
          </div>
          <span class="qr-placeholder__hint">扫码或长按图片保存</span>
        </div>
      </div>
      <template #footer
        ><Button
          variant="quiet"
          class="dialog-like-button"
          icon="heart"
          :aria-pressed="selectedGroup.liked"
          :loading="isPending(`like:${selectedGroup.id}`)"
          @click="toggleLike(selectedGroup)"
          >{{ selectedGroup.liked ? "已点赞" : "点赞" }} · {{ selectedGroup.likes }}</Button
        ><Button variant="normal" icon="external" @click="shareGroup">分享</Button></template
      >
    </Dialog>

    <Dialog
      v-if="publicSubmitGroup"
      title="提交新群"
      labelled-by="public-submit-dialog-title"
      size="form"
      test-id="public-submit-dialog"
      :busy="publicSubmitBusy"
      @close="closePublicSubmitDialog"
    >
      <div v-if="publicSubmitSuccess" class="app-alert app-alert--success" role="status">
        <Icon name="check" size="19" />
        <span>
          <strong>提交成功，等待审核</strong>
          <small>你的群组已提交，审核完成后会出现在公开目录中。</small>
        </span>
        <Button variant="normal" @click="closePublicSubmitDialog">完成</Button>
      </div>
      <AdminEditForm
        v-else
        :group="publicSubmitGroup"
        :deletable="false"
        public-mode
        :busy="publicSubmitBusy"
        :busy-action="publicSubmitBusy ? 'save' : null"
        @save="submitPublicGroup"
        @cancel="closePublicSubmitDialog"
        @toast="showToast($event, 'info')"
      />
    </Dialog>

    <Dialog
      v-if="adminCreateGroup"
      title="添加新群 · 管理编辑"
      labelled-by="admin-create-dialog-title"
      size="form"
      test-id="admin-create-dialog"
      :busy="adminCreateSaveBusy"
      @close="adminCreateGroup = null"
    >
      <AdminEditForm
        :group="adminCreateGroup"
        :deletable="false"
        :busy="adminCreateSaveBusy"
        :busy-action="adminCreateSaveBusy ? 'save' : null"
        @save="saveAdminCreateGroup"
        @cancel="adminCreateGroup = null"
        @toast="showToast($event, 'info')"
      />
    </Dialog>

    <Dialog
      v-if="selectedAdminGroup"
      title="编辑群组 · 窄屏抽屉样例"
      labelled-by="admin-dialog-title"
      size="form"
      test-id="admin-edit-dialog"
      :busy="Boolean(selectedAdminGroupBusyAction)"
      @close="closeAdminGroupEdit"
    >
      <AdminEditForm
        :group="selectedAdminGroup"
        :deletable="!selectedAdminGroupContext"
        :removable="Boolean(selectedAdminGroupContext)"
        :busy="Boolean(selectedAdminGroupBusyAction)"
        :busy-action="selectedAdminGroupBusyAction"
        @save="saveAdminGroup"
        @cancel="closeAdminGroupEdit"
        @delete="deleteAdminGroup(selectedAdminGroup)"
        @remove="removeGroupFromBoard"
        @toast="showToast($event, 'info')"
      />
    </Dialog>

    <Dialog
      v-if="selectedBoard"
      title="编辑板块详细信息"
      labelled-by="board-edit-dialog-title"
      size="form"
      test-id="board-edit-dialog"
      :busy="Boolean(selectedBoard && isPending(boardActionKey(selectedBoard.id, 'edit')))"
      @close="selectedBoardId = null"
    >
      <BoardEditForm
        :board="selectedBoard"
        :busy="Boolean(selectedBoard && isPending(boardActionKey(selectedBoard.id, 'edit')))"
        @save="saveBoard"
        @cancel="selectedBoardId = null"
      />
    </Dialog>

    <Dialog
      v-if="boardCreateDraft"
      title="新增板块"
      labelled-by="board-create-dialog-title"
      size="form"
      test-id="board-create-dialog"
      :busy="isPending('board:create')"
      @close="boardCreateDraft = null"
    >
      <BoardEditForm
        :board="boardCreateDraft"
        create-mode
        :busy="isPending('board:create')"
        @save="saveBoardCreate"
        @cancel="boardCreateDraft = null"
      />
    </Dialog>

    <Dialog
      v-if="selectedBoardAddGroup"
      title="板块内添加新群"
      labelled-by="board-add-group-dialog-title"
      size="form"
      test-id="board-add-group-dialog"
      :busy="
        Boolean(
          selectedBoardAddGroup && isPending(boardActionKey(selectedBoardAddGroup.id, 'add-group')),
        )
      "
      @close="selectedBoardAddGroupId = null"
    >
      <BoardAddGroupForm
        :board="selectedBoardAddGroup"
        :groups="boardGroupPool"
        :adding-group-id="boardAddGroupPendingGroupId"
        :busy="
          Boolean(
            selectedBoardAddGroup &&
            isPending(boardActionKey(selectedBoardAddGroup.id, 'add-group')),
          )
        "
        @add="addGroupToBoard"
        @cancel="selectedBoardAddGroupId = null"
      />
    </Dialog>

    <Dialog
      v-if="purgeConfirmGroup"
      :title="`永久删除「${purgeConfirmGroup.title}」？`"
      labelled-by="purge-confirm-dialog-title"
      size="form"
      test-id="purge-confirm-dialog"
      :busy="isPending(groupActionKey(purgeConfirmGroup.id, 'purge'))"
      @close="purgeConfirmGroup = null"
    >
      <div class="purge-confirm">
        <p>该操作将删除群组及其全部关联数据（板块成员、标签、加群方式、点赞），不可恢复。</p>
        <p>删除 R2 中的头像与二维码资源（若存在引用）。</p>
        <div class="purge-confirm__actions">
          <Button
            variant="quiet"
            :disabled="isPending(groupActionKey(purgeConfirmGroup.id, 'purge'))"
            :aria-busy="
              isPending(groupActionKey(purgeConfirmGroup.id, 'purge')) ? 'true' : undefined
            "
            @click="purgeConfirmGroup = null"
            >取消</Button
          >
          <Button
            variant="normal"
            tone="danger"
            icon="trash"
            :loading="isPending(groupActionKey(purgeConfirmGroup.id, 'purge'))"
            @click="confirmPurgeGroup"
          >
            确认永久删除
          </Button>
        </div>
      </div>
    </Dialog>

    <Toast :items="toastItems" @close="closeToast" />
  </div>
</template>
