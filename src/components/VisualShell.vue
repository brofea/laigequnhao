<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import type { AdminGroupDto, PublicGroupDto } from "@shared/contracts/group";
import { submitGroup } from "@/features/groups/api";
import { useGroupDirectory } from "@/features/groups/composables/useGroupDirectory";
import { useLikedGroups } from "@/features/groups/composables/useLikedGroups";
import { useAdminGroups } from "@/features/admin/composables/useAdminGroups";
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
import {
  demoBoards,
  demoTags,
  groupStatusLabels,
  type DemoBoard,
  type DemoGroup,
} from "../data/fixtures";
import { useTheme, type ThemePreference } from "@/features/theme/useTheme";

type ViewName = "home" | "admin";
type AdminTab = "groups" | "boards" | "stats";
type PreviewState = "ready" | "loading" | "empty" | "error";
type AdminSortField = "title" | "status" | "tags" | "kind" | "likes" | "platform";
type AdminSortDirection = "asc" | "desc" | null;

const { preference: themePreference, resolvedTheme, setPreference } = useTheme();
const props = defineProps<{ initialView: ViewName; csrfToken?: string }>();
const view = ref<ViewName>(props.initialView);
const publicDirectory = useGroupDirectory();
const likedGroups = useLikedGroups();
const adminDirectory = useAdminGroups(() => props.csrfToken ?? "");
const adminTab = ref<AdminTab>("groups");
const searchQuery = ref("");
const activeTag = ref("");
const previewState = ref<PreviewState>("ready");
const selectedGroupId = ref<string | null>(null);
const selectedAdminGroupId = ref<string | null>(null);
const selectedAdminGroupContext = ref<{ boardId: string; groupId: string } | null>(null);
const selectedBoardId = ref<string | null>(null);
const boardCreateDraft = ref<DemoBoard | null>(null);
const selectedBoardAddGroupId = ref<string | null>(null);
const boardListVersion = ref(0);
const boards = ref<DemoBoard[]>(
  demoBoards.map((board) => ({ ...board, memberCount: 0, members: [] })),
);
const publicSubmitGroup = ref<DemoGroup | null>(null);
const adminCreateGroup = ref<DemoGroup | null>(null);
const adminQuery = ref("");
const adminFilter = ref("全部状态");
const showRecycleBin = ref(false);
const adminSortField = ref<AdminSortField | null>(null);
const adminSortDirection = ref<AdminSortDirection>(null);
const toastItems = ref<ToastItem[]>([]);
let toastId = 0;

onMounted(() => {
  if (props.initialView === "admin") void adminDirectory.fetchGroups();
});

const localLikeState = ref<Record<string, { liked: boolean; likes: number }>>({});

function toDemoGroup(group: PublicGroupDto | AdminGroupDto): DemoGroup {
  const likeState = localLikeState.value[group.id];
  return {
    id: group.id,
    title: group.title,
    platform: group.platform,
    kind: group.kind === "official" ? "工具" : "兴趣",
    description: group.description,
    tags: group.tags,
    likes: likeState?.likes ?? group.likeCount,
    liked: likeState?.liked ?? likedGroups.likedIds.value.has(group.id),
    avatarState: group.logoUrl ? "ready" : "missing",
    status: group.status,
    inRecycleBin: "deletedAt" in group ? group.deletedAt !== null : false,
    joinMethods: group.joinMethods.map((method, index) => ({
      id: `${group.id}-method-${String(index)}`,
      type: method.type === "group_number" ? "number" : method.type === "url" ? "link" : "qr",
      label:
        method.type === "group_number" ? "群号" : method.type === "url" ? "邀请链接" : "二维码",
      value:
        method.type === "qr_code"
          ? "assetId" in method
            ? (method.assetId ?? method.qrCodeUrl ?? "")
            : (method.qrCodeUrl ?? "")
          : (method.value ?? method.url ?? ""),
    })),
  };
}

const publicVisualGroups = computed(() => publicDirectory.groups.value.map(toDemoGroup));
const adminVisualGroups = computed(() => adminDirectory.groups.value.map(toDemoGroup));
const boardGroupPool = computed(() => publicVisualGroups.value);
const publishedGroups = computed(() =>
  publicVisualGroups.value.filter((group) => group.status === "published" && !group.inRecycleBin),
);
const visibleTags = computed(() => {
  const counts = new Map<string, number>();
  for (const group of publishedGroups.value) {
    for (const tag of group.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return demoTags.map((tag) => ({ ...tag, count: counts.get(tag.label) ?? 0 }));
});
const selectedGroup = computed(() =>
  selectedGroupId.value
    ? publishedGroups.value.find((group) => group.id === selectedGroupId.value)
    : undefined,
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
let boardCreateSequence = 0;

function requiredGroup(id: string): DemoGroup {
  const group = boardGroupPool.value.find((item) => item.id === id);
  if (!group) throw new Error(`Missing published group: ${id}`);
  return group;
}
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
    const matchesFilter =
      adminFilter.value === "全部状态" || groupStatusLabels[group.status] === adminFilter.value;
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
  previewState.value = "ready";
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
  previewState.value = "ready";
  publicDirectory.searchImmediate(activeTag.value);
}

async function toggleLike(group: DemoGroup) {
  const nextLiked = !group.liked;
  const nextCount = await likedGroups.toggle(group.id, group.liked);
  if (nextCount === null) {
    showToast("点赞失败，请稍后重试", "warning");
    return;
  }
  localLikeState.value = {
    ...localLikeState.value,
    [group.id]: { liked: nextLiked, likes: nextCount },
  };
  showToast(nextLiked ? "已点赞，不会打开详情" : "已取消点赞", "info");
}

function openGroup(group: DemoGroup) {
  selectedGroupId.value = group.id;
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
  };
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

async function submitPublicGroup(next: DemoGroup) {
  const groupNumber = next.joinMethods.find((method) => method.type === "number")?.value;
  const url = next.joinMethods.find((method) => method.type === "link")?.value;
  const result = await submitGroup({
    title: next.title,
    kind: "interest",
    platform: next.platform,
    groupNumber: groupNumber || undefined,
    url: url || undefined,
    tags: next.tags.length ? next.tags : undefined,
    description: next.description || undefined,
    turnstileToken: "placeholder",
  });
  if (!result.ok) {
    showToast(result.error.message, "warning");
    return;
  }
  publicSubmitGroup.value = null;
  showToast("提交成功，等待审核", "success");
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

function copyDemoLink() {
  showToast("分享链接已复制（模拟反馈）", "success");
}

function setPreviewState(state: PreviewState) {
  previewState.value = state;
  if (state !== "ready") searchQuery.value = "";
}

function applyBoards(next: DemoBoard[]) {
  boards.value = next;
}

function boardGroups(board: DemoBoard) {
  return board.members
    .map(requiredGroup)
    .filter((group) => group.status === "published" && !group.inRecycleBin);
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
}

function removeAdminGroup(group: DemoGroup) {
  void adminDirectory.softDelete(group.id).then((ok) => {
    showToast(ok ? `已删除“${group.title}”` : "删除失败，请稍后重试", ok ? "success" : "warning");
  });
}

function toJoinMethodPayload(group: DemoGroup) {
  return group.joinMethods.map((method, index) =>
    method.type === "number"
      ? { type: "group_number" as const, value: method.value.trim(), sortOrder: index }
      : method.type === "link"
        ? { type: "url" as const, url: method.value.trim(), sortOrder: index }
        : { type: "qr_code" as const, assetId: method.value, sortOrder: index },
  );
}

function toAdminPayload(group: DemoGroup, version?: number) {
  return {
    title: group.title.trim(),
    description: group.description,
    kind: group.kind === "工具" ? "official" : "interest",
    platform: group.platform,
    status: group.status,
    tags: group.tags,
    joinMethods: toJoinMethodPayload(group),
    auditNotes: null,
    ...(version === undefined ? {} : { version }),
  };
}

async function saveAdminGroup(next: DemoGroup) {
  const current = adminDirectory.groups.value.find((item) => item.id === next.id);
  if (!current) return;
  const result = await adminDirectory.updateGroup(next.id, toAdminPayload(next, current.version));
  if (!result.ok) {
    showToast(
      result.versionConflict ? "群组已被其他会话修改" : "保存失败，请检查表单内容",
      "warning",
    );
    return;
  }
  closeAdminGroupEdit();
  showToast("群组修改已保存");
}

function deleteAdminGroup(group: DemoGroup) {
  void adminDirectory.softDelete(group.id).then((ok) => {
    if (ok) closeAdminGroupEdit();
    showToast(ok ? `已删除“${group.title}”` : "删除失败，请稍后重试", ok ? "success" : "warning");
  });
}

function removeGroupFromBoard() {
  const context = selectedAdminGroupContext.value;
  if (!context) return;
  const board = boards.value.find((item) => item.id === context.boardId);
  if (board) {
    board.members = board.members.filter((memberId) => memberId !== context.groupId);
    board.memberCount = board.members.length;
    boardListVersion.value += 1;
  }
  const group = boardGroupPool.value.find((item) => item.id === context.groupId);
  closeAdminGroupEdit();
  showToast(`已将“${group?.title ?? "该群组"}”移出板块`, "success");
}

async function saveAdminCreateGroup(next: DemoGroup) {
  const result = await adminDirectory.createGroup(toAdminPayload(next));
  if (!result.ok) {
    showToast("保存失败，请检查表单内容", "warning");
    return;
  }
  adminCreateGroup.value = null;
  showToast("新群组已保存");
}

function saveBoard(next: DemoBoard) {
  const current = boards.value.find((board) => board.id === next.id);
  if (current) Object.assign(current, next);
  selectedBoardId.value = null;
  showToast("板块信息已保存（样例状态）");
}

function saveBoardCreate(next: DemoBoard) {
  boards.value.push({ ...next, memberCount: next.members.length });
  boardListVersion.value += 1;
  boardCreateDraft.value = null;
  showToast("新板块已保存（样例状态）");
}

function addGroupToBoard(group: DemoGroup) {
  const board = selectedBoardAddGroup.value;
  if (!board || board.members.includes(group.id)) return;
  board.members.push(group.id);
  board.memberCount = board.members.length;
  boardListVersion.value += 1;
  selectedBoardAddGroupId.value = null;
  showToast(`已将“${group.title}”添加到“${board.title}”`);
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
          variant="normal"
          size="sm"
          icon="plus"
          @click="view === 'admin' ? openAdminCreateDialog() : openPublicSubmitDialog()"
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
            :status="
              previewState === 'loading'
                ? 'loading'
                : previewState === 'error'
                  ? 'error'
                  : 'default'
            "
            :help-text="previewState === 'error' ? '样例正在演示搜索失败状态。' : ''"
            @update:model-value="setSearch"
            @clear="setSearch('')"
          />
        </section>

        <section class="sample-state-bar" aria-label="样例状态切换">
          <span class="sample-state-bar__label">查看状态样例</span>
          <button
            v-for="state in ['ready', 'loading', 'empty', 'error'] as PreviewState[]"
            :key="state"
            type="button"
            :class="{ 'is-selected': previewState === state }"
            @click="setPreviewState(state)"
          >
            {{
              state === "ready"
                ? "默认"
                : state === "loading"
                  ? "加载"
                  : state === "empty"
                    ? "空状态"
                    : "错误"
            }}
          </button>
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
            <Carousel :groups="publishedGroups.slice(0, 5)" @open="openGroup" @like="toggleLike" />
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
              <Carousel :groups="boardGroups(board)" @open="openGroup" @like="toggleLike" />
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
          <div v-if="previewState === 'loading'" class="skeleton-grid" aria-label="群组加载中">
            <span v-for="index in 4" :key="index" class="app-skeleton-card"></span>
          </div>
          <div
            v-else-if="previewState === 'error'"
            class="app-alert app-alert--danger"
            role="alert"
          >
            <Icon name="warning" size="19" /><span
              ><strong>样例搜索暂时不可用</strong
              ><small>这条错误只用于查看反馈层级，不会发出 API 请求。</small></span
            ><Button variant="quiet" size="sm" @click="setPreviewState('ready')">重试样例</Button>
          </div>
          <div
            v-else-if="previewState === 'empty' || filteredGroups.length === 0"
            class="app-empty"
          >
            <span class="app-empty__icon">⌁</span><strong>还没有匹配的群组</strong
            ><span>换一个关键词，或浏览上面的标签。</span
            ><Button variant="normal" size="sm" @click="setSearch('')">清除筛选</Button>
          </div>
          <div v-else class="group-grid">
            <GroupCard
              v-for="group in filteredGroups"
              :key="group.id"
              :group="group"
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
                ><span>共 {{ filteredAdminGroups.length }} 条，第 1 / 1 页</span
                ><span class="admin-summary__sort"
                  >更新时间 <Icon name="chevron-down" size="14"
                /></span>
              </div>
              <AdminTable
                :groups="filteredAdminGroups"
                :sort-field="adminSortField"
                :sort-direction="adminSortDirection"
                @open="openAdminGroupEdit"
                @remove="removeAdminGroup"
                @sort="cycleSort"
              />
              <div class="pagination">
                <Button
                  variant="quiet"
                  size="sm"
                  icon="arrow-left"
                  icon-only
                  aria-label="上一页"
                  disabled
                /><span class="pagination__current">1</span
                ><button type="button" @click="showToast('分页仅用于视觉演示', 'info')">2</button
                ><button type="button" @click="showToast('分页仅用于视觉演示', 'info')">3</button
                ><Button
                  variant="quiet"
                  size="sm"
                  icon="arrow-right"
                  icon-only
                  aria-label="下一页"
                  @click="showToast('分页仅用于视觉演示', 'info')"
                />
              </div>
            </template>
            <BoardManagement
              v-else-if="adminTab === 'boards'"
              :key="boardListVersion"
              :boards="boards"
              :groups="boardGroupPool"
              @reorder="applyBoards"
              @edit="openBoardEdit"
              @edit-group="openBoardMemberEdit"
              @add-board="openBoardCreateDialog"
              @add-group="openBoardAddGroupDialog"
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
      @close="selectedGroupId = null"
    >
      <div class="group-dialog-summary">
        <span
          class="group-avatar group-avatar--large"
          :class="`group-avatar--${selectedGroup.avatarState}`"
          >{{ selectedGroup.avatarState === "ready" ? selectedGroup.title.slice(0, 1) : "◎" }}</span
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
              ><small>{{ method.type === "qr" ? "模拟二维码区域" : method.value }}</small></span
            ><Button
              v-if="method.type !== 'qr'"
              variant="quiet"
              size="sm"
              :icon="method.type === 'link' ? 'external' : 'copy'"
              @click="
                method.type === 'link'
                  ? showToast('已打开邀请链接（样例）', 'info')
                  : copyDemoLink()
              "
              >{{ method.type === "link" ? "访问" : "复制" }}</Button
            >
          </div>
        </div>
        <div
          v-if="selectedGroup.joinMethods.some((method) => method.type === 'qr')"
          class="qr-placeholder"
        >
          <span>⌗</span><small>二维码占位 · 不对应真实群组</small>
        </div>
      </div>
      <template #footer
        ><Button
          variant="quiet"
          icon="heart"
          :aria-pressed="selectedGroup.liked"
          @click="toggleLike(selectedGroup)"
          >{{ selectedGroup.liked ? "已点赞" : "点赞" }} · {{ selectedGroup.likes }}</Button
        ><Button variant="normal" icon="external" @click="copyDemoLink">分享</Button></template
      >
    </Dialog>

    <Dialog
      v-if="publicSubmitGroup"
      title="提交新群"
      labelled-by="public-submit-dialog-title"
      size="form"
      test-id="public-submit-dialog"
      @close="publicSubmitGroup = null"
    >
      <AdminEditForm
        :group="publicSubmitGroup"
        :deletable="false"
        public-mode
        @save="submitPublicGroup"
        @cancel="publicSubmitGroup = null"
        @toast="showToast($event, 'info')"
      />
    </Dialog>

    <Dialog
      v-if="adminCreateGroup"
      title="添加新群 · 管理编辑"
      labelled-by="admin-create-dialog-title"
      size="form"
      test-id="admin-create-dialog"
      @close="adminCreateGroup = null"
    >
      <AdminEditForm
        :group="adminCreateGroup"
        :deletable="false"
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
      @close="closeAdminGroupEdit"
    >
      <AdminEditForm
        :group="selectedAdminGroup"
        :deletable="!selectedAdminGroupContext"
        :removable="Boolean(selectedAdminGroupContext)"
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
      @close="selectedBoardId = null"
    >
      <BoardEditForm :board="selectedBoard" @save="saveBoard" @cancel="selectedBoardId = null" />
    </Dialog>

    <Dialog
      v-if="boardCreateDraft"
      title="新增板块"
      labelled-by="board-create-dialog-title"
      size="form"
      test-id="board-create-dialog"
      @close="boardCreateDraft = null"
    >
      <BoardEditForm
        :board="boardCreateDraft"
        create-mode
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
      @close="selectedBoardAddGroupId = null"
    >
      <BoardAddGroupForm
        :board="selectedBoardAddGroup"
        :groups="boardGroupPool"
        @add="addGroupToBoard"
        @cancel="selectedBoardAddGroupId = null"
      />
    </Dialog>

    <Toast :items="toastItems" @close="closeToast" />
  </div>
</template>
