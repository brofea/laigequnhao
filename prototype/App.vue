<script setup lang="ts">
import { computed, ref } from "vue";
import PrototypeAdminTable from "./components/PrototypeAdminTable.vue";
import PrototypeBadge from "./components/PrototypeBadge.vue";
import PrototypeBoardAddGroupForm from "./components/PrototypeBoardAddGroupForm.vue";
import PrototypeBoardManagement from "./components/PrototypeBoardManagement.vue";
import PrototypeBoardEditForm from "./components/PrototypeBoardEditForm.vue";
import PrototypeButton from "./components/PrototypeButton.vue";
import PrototypeCarousel from "./components/PrototypeCarousel.vue";
import PrototypeDialog from "./components/PrototypeDialog.vue";
import PrototypeGroupCard from "./components/PrototypeGroupCard.vue";
import PrototypeIcon from "./components/PrototypeIcon.vue";
import PrototypeInput from "./components/PrototypeInput.vue";
import PrototypeSelect from "./components/PrototypeSelect.vue";
import PrototypeStatsPage from "./components/PrototypeStatsPage.vue";
import PrototypeAdminEditForm from "./components/PrototypeAdminEditForm.vue";
import PrototypeToast, { type ToastItem } from "./components/PrototypeToast.vue";
import {
  demoBoards,
  demoGroups,
  demoTags,
  getGroupById,
  groupStatusLabels,
  type DemoBoard,
  type DemoGroup,
} from "./data/fixtures";
import { useTheme, type ThemePreference } from "./composables/useTheme";

type ViewName = "home" | "admin" | "tokens";
type AdminTab = "groups" | "boards" | "stats";
type PreviewState = "ready" | "loading" | "empty" | "error";
type AdminSortField = "title" | "status" | "tags" | "kind" | "likes" | "platform";
type AdminSortDirection = "asc" | "desc" | null;

const { preference: themePreference, resolvedTheme } = useTheme();
const view = ref<ViewName>("home");
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
const publicSubmitGroup = ref<DemoGroup | null>(null);
const adminCreateGroup = ref<DemoGroup | null>(null);
const adminQuery = ref("");
const adminFilter = ref("全部状态");
const showRecycleBin = ref(false);
const adminSortField = ref<AdminSortField | null>(null);
const adminSortDirection = ref<AdminSortDirection>(null);
const toastItems = ref<ToastItem[]>([]);
let toastId = 0;

const publishedGroups = computed(() =>
  demoGroups.filter((group) => group.status === "published" && !group.inRecycleBin),
);
const selectedGroup = computed(() =>
  selectedGroupId.value ? getGroupById(selectedGroupId.value) : undefined,
);
const selectedAdminGroup = computed(() =>
  selectedAdminGroupId.value ? getGroupById(selectedAdminGroupId.value) : undefined,
);
const selectedBoard = computed(() =>
  selectedBoardId.value
    ? demoBoards.find((board) => board.id === selectedBoardId.value)
    : undefined,
);
const selectedBoardAddGroup = computed(() =>
  selectedBoardAddGroupId.value
    ? demoBoards.find((board) => board.id === selectedBoardAddGroupId.value)
    : undefined,
);
let boardCreateSequence = 0;

function requiredGroup(id: string): DemoGroup {
  const group = getGroupById(id);
  if (!group) throw new Error(`Missing fixed fixture group: ${id}`);
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
  const filtered = demoGroups.filter((group) => {
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
}

function useTag(tag: string) {
  activeTag.value = activeTag.value === tag ? "" : tag;
  searchQuery.value = activeTag.value;
  previewState.value = "ready";
}

function toggleLike(group: DemoGroup) {
  group.liked = !group.liked;
  group.likes += group.liked ? 1 : -1;
  showToast(group.liked ? "已模拟点赞，不会打开详情" : "已模拟取消点赞", "info");
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
    platform: "微信",
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
    platform: "微信",
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

function submitPublicGroup() {
  publicSubmitGroup.value = null;
  showToast("提交成功，等待审核", "success");
}

function chooseView(nextView: ViewName) {
  view.value = nextView;
  if (nextView !== "admin") closeAdminGroupEdit();
  publicSubmitGroup.value = null;
  adminCreateGroup.value = null;
  selectedBoardId.value = null;
  boardCreateDraft.value = null;
  selectedBoardAddGroupId.value = null;
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
  themePreference.value = next;
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
  demoBoards.splice(0, demoBoards.length, ...next);
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
  showToast(`已模拟删除“${group.title}”，未产生真实变更`, "warning");
}

function saveAdminGroup(next: DemoGroup) {
  const current = getGroupById(next.id);
  if (current) Object.assign(current, next);
  closeAdminGroupEdit();
  showToast("群组修改已保存（样例状态）");
}

function deleteAdminGroup(group: DemoGroup) {
  const index = demoGroups.findIndex((item) => item.id === group.id);
  if (index >= 0) demoGroups.splice(index, 1);
  closeAdminGroupEdit();
  showToast(`已删除“${group.title}”（样例状态）`, "success");
}

function removeGroupFromBoard() {
  const context = selectedAdminGroupContext.value;
  if (!context) return;
  const board = demoBoards.find((item) => item.id === context.boardId);
  if (board) {
    board.members = board.members.filter((memberId) => memberId !== context.groupId);
    board.memberCount = board.members.length;
    boardListVersion.value += 1;
  }
  const group = getGroupById(context.groupId);
  closeAdminGroupEdit();
  showToast(`已将“${group?.title ?? "该群组"}”移出板块`, "success");
}

function saveAdminCreateGroup(next: DemoGroup) {
  demoGroups.push(next);
  adminCreateGroup.value = null;
  showToast("新群组已保存（样例状态）");
}

function saveBoard(next: DemoBoard) {
  const current = demoBoards.find((board) => board.id === next.id);
  if (current) Object.assign(current, next);
  selectedBoardId.value = null;
  showToast("板块信息已保存（样例状态）");
}

function saveBoardCreate(next: DemoBoard) {
  demoBoards.push({ ...next, memberCount: next.members.length });
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
  <div class="prototype-app" :data-theme="resolvedTheme">
    <header class="proto-header">
      <a
        class="proto-brand"
        href="#"
        aria-label="回到公开首页"
        @click.prevent="
          chooseView('home');
          setSearch('');
        "
      >
        <span class="proto-brand__mark">群</span>
        <strong>找一个值得加入的群</strong>
      </a>
      <nav class="proto-nav" aria-label="样例导航">
        <button
          type="button"
          :class="{ 'proto-nav__item--active': view === 'home' }"
          @click="chooseView('home')"
        >
          公开发现
        </button>
        <button
          type="button"
          :class="{ 'proto-nav__item--active': view === 'admin' }"
          @click="chooseView('admin')"
        >
          管理端
        </button>
        <button
          type="button"
          :class="{ 'proto-nav__item--active': view === 'tokens' }"
          @click="chooseView('tokens')"
        >
          设计系统
        </button>
      </nav>
      <div class="proto-header__actions">
        <button class="theme-control" type="button" aria-label="切换主题偏好" @click="cycleTheme">
          <PrototypeIcon :name="themeIcon()" size="16" />
          <span class="theme-control__label">{{ themeLabels[themePreference] }}</span>
        </button>
        <a
          class="github-control"
          href="https://github.com"
          target="_blank"
          rel="noreferrer"
          aria-label="GitHub 支持"
        >
          <PrototypeIcon name="github" size="17" /><span>GitHub</span>
        </a>
        <PrototypeButton variant="normal" size="sm" icon="plus" @click="openPublicSubmitDialog"
          ><span class="add-group-label">添加新群</span></PrototypeButton
        >
      </div>
    </header>

    <main class="proto-main">
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
          <PrototypeInput
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
          <section class="proto-section proto-section--carousel" aria-labelledby="discover-title">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Curated rotation</p>
                <h2 id="discover-title">发现新群</h2>
              </div>
              <span class="section-heading__hint">拖动卡片探索</span>
            </div>
            <PrototypeCarousel
              :groups="publishedGroups.slice(0, 5)"
              @open="openGroup"
              @like="toggleLike"
            />
          </section>
          <section class="proto-section" aria-labelledby="tag-title">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Browse by mood</p>
                <h2 id="tag-title">所有标签</h2>
              </div>
              <PrototypeButton
                variant="quiet"
                size="sm"
                @click="showToast('标签聚合页仍是视觉样例')"
                >查看全部</PrototypeButton
              >
            </div>
            <div class="tag-grid">
              <button
                v-for="tag in demoTags"
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
            v-for="board in demoBoards"
            :key="board.id"
            class="proto-section proto-section--carousel"
            :class="{ 'proto-section--empty-board': !board.enabled }"
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
              <PrototypeCarousel
                :groups="boardGroups(board)"
                @open="openGroup"
                @like="toggleLike"
              />
            </div>
            <div v-else class="proto-empty">
              <span class="proto-empty__icon">○</span><strong>这个板块正在整理中</strong
              ><span>暂时没有公开群组，稍后再来看看。</span>
            </div>
          </section>
        </template>

        <section class="proto-section" aria-labelledby="groups-title">
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
            <span v-for="index in 4" :key="index" class="proto-skeleton-card"></span>
          </div>
          <div
            v-else-if="previewState === 'error'"
            class="proto-alert proto-alert--danger"
            role="alert"
          >
            <PrototypeIcon name="warning" size="19" /><span
              ><strong>样例搜索暂时不可用</strong
              ><small>这条错误只用于查看反馈层级，不会发出 API 请求。</small></span
            ><PrototypeButton variant="quiet" size="sm" @click="setPreviewState('ready')"
              >重试样例</PrototypeButton
            >
          </div>
          <div
            v-else-if="previewState === 'empty' || filteredGroups.length === 0"
            class="proto-empty"
          >
            <span class="proto-empty__icon">⌁</span><strong>还没有匹配的群组</strong
            ><span>换一个关键词，或浏览上面的标签。</span
            ><PrototypeButton variant="normal" size="sm" @click="setSearch('')"
              >清除筛选</PrototypeButton
            >
          </div>
          <div v-else class="group-grid">
            <PrototypeGroupCard
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
          <PrototypeBadge tone="warning" dot>仅视觉样例</PrototypeBadge>
        </section>
        <div class="admin-layout">
          <aside class="admin-sidebar" aria-label="管理端导航">
            <button
              type="button"
              :class="{ 'is-active': adminTab === 'groups' }"
              @click="adminTab = 'groups'"
            >
              <PrototypeIcon name="menu" size="17" />群组管理</button
            ><button
              type="button"
              :class="{ 'is-active': adminTab === 'boards' }"
              @click="adminTab = 'boards'"
            >
              <PrototypeIcon name="grip" size="17" />板块管理
            </button>
            <button
              type="button"
              :class="{ 'is-active': adminTab === 'stats' }"
              @click="adminTab = 'stats'"
            >
              <PrototypeIcon name="system" size="17" />运行数据
            </button>
            <div class="admin-sidebar__note">
              <strong>表面规则</strong
              ><span>表格、弹窗和导航保持低阴影，状态用文字、边框和图标共同表达。</span>
            </div>
          </aside>
          <div class="admin-content">
            <template v-if="adminTab === 'groups'">
              <div class="admin-toolbar">
                <PrototypeInput
                  :model-value="adminQuery"
                  label="管理端搜索"
                  placeholder="按标题查找"
                  clearable
                  @update:model-value="adminQuery = $event"
                  @clear="adminQuery = ''"
                /><PrototypeSelect
                  v-model="adminFilter"
                  label="状态"
                  :options="[
                    { value: '全部状态', label: '全部状态' },
                    { value: '已发布', label: '已发布' },
                    { value: '已下架', label: '已下架' },
                    { value: '待审核', label: '待审核' },
                    { value: '已拒绝', label: '已拒绝' },
                  ]"
                /><PrototypeButton
                  variant="normal"
                  size="md"
                  icon="trash"
                  :aria-pressed="showRecycleBin"
                  @click="showRecycleBin = !showRecycleBin"
                >
                  回收站
                </PrototypeButton>
                <PrototypeButton
                  variant="normal"
                  size="md"
                  icon="plus"
                  @click="openAdminCreateDialog"
                >
                  添加新群
                </PrototypeButton>
              </div>
              <div class="admin-summary">
                <strong>群组列表</strong
                ><span>共 {{ filteredAdminGroups.length }} 条，第 1 / 1 页</span
                ><span class="admin-summary__sort"
                  >更新时间 <PrototypeIcon name="chevron-down" size="14"
                /></span>
              </div>
              <PrototypeAdminTable
                :groups="filteredAdminGroups"
                :sort-field="adminSortField"
                :sort-direction="adminSortDirection"
                @open="openAdminGroupEdit"
                @remove="removeAdminGroup"
                @sort="cycleSort"
              />
              <div class="pagination">
                <PrototypeButton
                  variant="quiet"
                  size="sm"
                  icon="arrow-left"
                  icon-only
                  aria-label="上一页"
                  disabled
                /><span class="pagination__current">1</span
                ><button type="button" @click="showToast('分页仅用于视觉演示', 'info')">2</button
                ><button type="button" @click="showToast('分页仅用于视觉演示', 'info')">3</button
                ><PrototypeButton
                  variant="quiet"
                  size="sm"
                  icon="arrow-right"
                  icon-only
                  aria-label="下一页"
                  @click="showToast('分页仅用于视觉演示', 'info')"
                />
              </div>
            </template>
            <PrototypeBoardManagement
              v-else-if="adminTab === 'boards'"
              :key="boardListVersion"
              :boards="demoBoards"
              :groups="demoGroups"
              @reorder="applyBoards"
              @edit="openBoardEdit"
              @edit-group="openBoardMemberEdit"
              @add-board="openBoardCreateDialog"
              @add-group="openBoardAddGroupDialog"
              @toast="showToast($event, 'info')"
            />
            <PrototypeStatsPage v-else />
          </div>
        </div>
      </template>

      <template v-else>
        <section class="token-hero">
          <p class="eyebrow">Design language / candidate tokens</p>
          <h1>组件要清晰，表面要克制。</h1>
          <p>
            这里集中展示当前 T02 候选 Token 与状态规则。具体品牌色和数值仍需经过四轮评审后冻结。
          </p>
        </section>
        <section class="token-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Primitive → semantic</p>
              <h2>颜色与层级</h2>
            </div>
            <span class="section-heading__hint"
              >当前主题：{{ resolvedTheme === "dark" ? "深色" : "浅色" }}</span
            >
          </div>
          <div class="color-token-grid">
            <div
              v-for="token in [
                'background',
                'surface',
                'surface-raised',
                'accent',
                'success',
                'warning',
                'danger',
                'focus',
              ]"
              :key="token"
              class="color-token"
            >
              <span :class="`color-token__swatch color-token__swatch--${token}`"></span
              ><strong>--{{ token }}</strong
              ><small>{{
                token === "background"
                  ? "页面主背景"
                  : token === "surface"
                    ? "普通表面"
                    : token === "surface-raised"
                      ? "轻微抬升"
                      : token === "focus"
                        ? "高对比焦点"
                        : "语义状态"
              }}</small>
            </div>
          </div>
        </section>
        <section class="token-section token-section--split">
          <div>
            <div class="section-heading">
              <div>
                <p class="eyebrow">States</p>
                <h2>按钮与输入</h2>
              </div>
            </div>
            <div class="token-stack">
              <div class="token-row">
                <PrototypeButton variant="normal">正常</PrototypeButton
                ><PrototypeButton variant="quiet">低强调</PrototypeButton
                ><PrototypeButton variant="normal" aria-pressed="true">Pressed</PrototypeButton
                ><PrototypeButton variant="normal" tone="danger">危险语义</PrototypeButton>
              </div>
              <div class="token-row">
                <PrototypeButton variant="normal" loading>加载中</PrototypeButton
                ><PrototypeButton variant="quiet" disabled>不可用</PrototypeButton
                ><PrototypeButton variant="normal" icon="plus" icon-only aria-label="添加" />
              </div>
              <PrototypeInput
                model-value="聚焦时有独立环"
                label="输入框"
                placeholder="输入内容"
              /><PrototypeInput
                model-value=""
                label="错误状态"
                status="error"
                help-text="错误状态同时使用文字和边框表达。"
              /><PrototypeSelect
                model-value="light"
                label="自定义 Neumorphism 下拉"
                :options="[
                  { value: 'system', label: '跟随系统' },
                  { value: 'light', label: '浅色' },
                  { value: 'dark', label: '深色' },
                ]"
              />
            </div>
          </div>
          <div>
            <div class="section-heading">
              <div>
                <p class="eyebrow">Surfaces</p>
                <h2>表面状态</h2>
              </div>
            </div>
            <div class="surface-demo-grid">
              <div class="surface-demo surface-demo--raised">
                <strong>默认外凸</strong><span>Card / Button / Input</span>
              </div>
              <div class="surface-demo surface-demo--pressed">
                <strong>Pressed / Selected</strong><span>内嵌阴影 + 边框</span>
              </div>
              <div class="surface-demo surface-demo--low">
                <strong>功能优先</strong><span>Table / Dialog / Nav</span>
              </div>
            </div>
          </div>
        </section>
        <section class="token-section token-section--split">
          <div>
            <div class="section-heading">
              <div>
                <p class="eyebrow">Detail / Dialog</p>
                <h2>详情页表面</h2>
              </div>
            </div>
            <div class="token-detail-preview">
              <div class="group-dialog-summary">
                <span class="group-avatar group-avatar--large">设</span>
                <div>
                  <PrototypeBadge tone="accent">QQ</PrototypeBadge>
                  <p>兴趣 · UI 设计 · 作品交流</p>
                </div>
              </div>
              <p>
                详情页保留完整简介、加入方式和分享动作。关闭、分享、头像与输入控件共用轻量
                Neumorphism 表面。
              </p>
              <div class="token-detail-preview__actions">
                <PrototypeButton variant="quiet" size="sm">关闭</PrototypeButton
                ><PrototypeButton variant="normal" size="sm" icon="external">分享</PrototypeButton>
              </div>
            </div>
          </div>
          <div>
            <div class="section-heading">
              <div>
                <p class="eyebrow">Table / dense</p>
                <h2>功能优先表格</h2>
              </div>
            </div>
            <div class="token-table-preview">
              <table>
                <thead>
                  <tr>
                    <th>
                      <button type="button">
                        标题 <PrototypeIcon name="chevron-down" size="12" />
                      </button>
                    </th>
                    <th>
                      <button type="button">
                        状态 <PrototypeIcon name="chevron-down" size="12" />
                      </button>
                    </th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <th>设计师交换站</th>
                    <td><PrototypeBadge tone="success" dot>已发布</PrototypeBadge></td>
                    <td><button class="table-link-button" type="button">编辑</button></td>
                  </tr>
                  <tr>
                    <th>Indie Makers ᵔᴥᵔ</th>
                    <td><PrototypeBadge tone="danger" dot>已下架</PrototypeBadge></td>
                    <td>
                      <button class="table-link-button table-link-button--danger" type="button">
                        删除
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section class="token-section">
          <div class="section-heading">
            <div>
              <p class="eyebrow">Feedback</p>
              <h2>状态、骨架与空白</h2>
            </div>
          </div>
          <div class="feedback-demo">
            <div class="proto-alert proto-alert--success">
              <PrototypeIcon name="check" size="19" /><span
                ><strong>操作已完成</strong><small>成功状态不只依靠绿色。</small></span
              >
            </div>
            <div class="proto-alert proto-alert--danger">
              <PrototypeIcon name="warning" size="19" /><span
                ><strong>需要注意</strong><small>错误状态保留明确文字和高对比边框。</small></span
              >
            </div>
            <div class="proto-empty proto-empty--compact">
              <span class="proto-empty__icon">○</span><strong>空状态</strong
              ><span>给出下一步，而不是只说没有数据。</span>
            </div>
            <div
              class="proto-skeleton-card proto-skeleton-card--single"
              aria-label="加载骨架"
            ></div>
          </div>
        </section>
      </template>
    </main>

    <footer class="proto-footer">
      <span>Prototype only · fixed fixtures · no production API</span
      ><span
        >当前主题 <strong>{{ resolvedTheme }}</strong> · reduced motion ready</span
      >
    </footer>

    <PrototypeDialog
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
          <PrototypeBadge tone="accent">{{ selectedGroup.platform }}</PrototypeBadge>
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
            ><PrototypeButton
              v-if="method.type !== 'qr'"
              variant="quiet"
              size="sm"
              :icon="method.type === 'link' ? 'external' : 'copy'"
              @click="
                method.type === 'link'
                  ? showToast('已打开邀请链接（样例）', 'info')
                  : copyDemoLink()
              "
              >{{ method.type === "link" ? "访问" : "复制" }}</PrototypeButton
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
        ><PrototypeButton
          variant="quiet"
          icon="heart"
          :aria-pressed="selectedGroup.liked"
          @click="toggleLike(selectedGroup)"
          >{{ selectedGroup.liked ? "已点赞" : "点赞" }} ·
          {{ selectedGroup.likes }}</PrototypeButton
        ><PrototypeButton variant="normal" icon="external" @click="copyDemoLink"
          >分享</PrototypeButton
        ></template
      >
    </PrototypeDialog>

    <PrototypeDialog
      v-if="publicSubmitGroup"
      title="提交新群"
      labelled-by="public-submit-dialog-title"
      size="form"
      test-id="public-submit-dialog"
      @close="publicSubmitGroup = null"
    >
      <PrototypeAdminEditForm
        :group="publicSubmitGroup"
        :deletable="false"
        public-mode
        @save="submitPublicGroup"
        @cancel="publicSubmitGroup = null"
        @toast="showToast($event, 'info')"
      />
    </PrototypeDialog>

    <PrototypeDialog
      v-if="adminCreateGroup"
      title="添加新群 · 管理编辑"
      labelled-by="admin-create-dialog-title"
      size="form"
      test-id="admin-create-dialog"
      @close="adminCreateGroup = null"
    >
      <PrototypeAdminEditForm
        :group="adminCreateGroup"
        :deletable="false"
        @save="saveAdminCreateGroup"
        @cancel="adminCreateGroup = null"
        @toast="showToast($event, 'info')"
      />
    </PrototypeDialog>

    <PrototypeDialog
      v-if="selectedAdminGroup"
      title="编辑群组 · 窄屏抽屉样例"
      labelled-by="admin-dialog-title"
      size="form"
      test-id="admin-edit-dialog"
      @close="closeAdminGroupEdit"
    >
      <PrototypeAdminEditForm
        :group="selectedAdminGroup"
        :deletable="!selectedAdminGroupContext"
        :removable="Boolean(selectedAdminGroupContext)"
        @save="saveAdminGroup"
        @cancel="closeAdminGroupEdit"
        @delete="deleteAdminGroup(selectedAdminGroup)"
        @remove="removeGroupFromBoard"
        @toast="showToast($event, 'info')"
      />
    </PrototypeDialog>

    <PrototypeDialog
      v-if="selectedBoard"
      title="编辑板块详细信息"
      labelled-by="board-edit-dialog-title"
      size="form"
      test-id="board-edit-dialog"
      @close="selectedBoardId = null"
    >
      <PrototypeBoardEditForm
        :board="selectedBoard"
        @save="saveBoard"
        @cancel="selectedBoardId = null"
      />
    </PrototypeDialog>

    <PrototypeDialog
      v-if="boardCreateDraft"
      title="新增板块"
      labelled-by="board-create-dialog-title"
      size="form"
      test-id="board-create-dialog"
      @close="boardCreateDraft = null"
    >
      <PrototypeBoardEditForm
        :board="boardCreateDraft"
        create-mode
        @save="saveBoardCreate"
        @cancel="boardCreateDraft = null"
      />
    </PrototypeDialog>

    <PrototypeDialog
      v-if="selectedBoardAddGroup"
      title="板块内添加新群"
      labelled-by="board-add-group-dialog-title"
      size="form"
      test-id="board-add-group-dialog"
      @close="selectedBoardAddGroupId = null"
    >
      <PrototypeBoardAddGroupForm
        :board="selectedBoardAddGroup"
        :groups="demoGroups"
        @add="addGroupToBoard"
        @cancel="selectedBoardAddGroupId = null"
      />
    </PrototypeDialog>

    <PrototypeToast :items="toastItems" @close="closeToast" />
  </div>
</template>
