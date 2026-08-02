import { ref, onUnmounted } from "vue";
import type { BoardDto, BoardMemberDto } from "@shared/contracts/board";
import {
  addBoardMember,
  createAdminBoard,
  deleteAdminBoard,
  fetchAdminBoards,
  fetchBoardMembers,
  moveBoardMember,
  removeBoardMember,
  reorderAdminBoards,
  updateAdminBoard,
} from "../api";

export type MemberOpResult = { ok: boolean; conflict?: boolean; reason?: string };

/**
 * 管理板块：列表 + 成员 + CRUD + 排序 + 成员操作（T04 契约）。
 *
 * 所有写操作以服务端响应为准刷新本地状态，失败时保持服务端顺序，
 * 由调用方（VisualShell）提示错误并恢复。
 */
export function useAdminBoards(getCsrf: () => string) {
  const boards = ref<BoardDto[]>([]);
  const membersByBoard = ref<Record<string, BoardMemberDto[]>>({});
  const loading = ref(false);
  const error = ref<string | null>(null);
  const loaded = ref(false);

  let controller: AbortController | null = null;

  async function load(): Promise<boolean> {
    controller?.abort();
    controller = new AbortController();
    loading.value = true;
    error.value = null;
    try {
      const result = await fetchAdminBoards(controller.signal);
      if (!result.ok) {
        error.value = result.error.message;
        return false;
      }
      boards.value = result.data.boards;
      const perBoard = await Promise.all(
        result.data.boards.map((board) => fetchBoardMembers(board.id)),
      );
      const next: Record<string, BoardMemberDto[]> = {};
      result.data.boards.forEach((board, index) => {
        const members = perBoard[index];
        next[board.id] = members && members.ok ? members.data.members : [];
      });
      membersByBoard.value = next;
      loaded.value = true;
      return true;
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return false;
      error.value = "板块加载失败";
      return false;
    } finally {
      loading.value = false;
    }
  }

  async function createBoard(title: string): Promise<MemberOpResult> {
    const result = await createAdminBoard({ title }, getCsrf());
    if (!result.ok) return { ok: false, conflict: result.error.kind === "conflict" };
    boards.value = result.data.boards;
    return { ok: true };
  }

  async function updateBoard(
    id: string,
    patch: {
      title?: string;
      isEnabled?: boolean;
      sortMode?: "manual_asc" | "manual_desc" | "hourly_random";
      version: number;
    },
  ): Promise<MemberOpResult> {
    const result = await updateAdminBoard(id, patch, getCsrf());
    if (!result.ok) return { ok: false, conflict: result.error.kind === "conflict" };
    boards.value = result.data.boards;
    return { ok: true };
  }

  async function deleteBoard(id: string): Promise<MemberOpResult> {
    const result = await deleteAdminBoard(id, getCsrf());
    if (!result.ok) return { ok: false, conflict: result.error.kind === "conflict" };
    boards.value = result.data.boards;
    membersByBoard.value = Object.fromEntries(
      Object.entries(membersByBoard.value).filter(([boardId]) => boardId !== id),
    );
    return { ok: true };
  }

  async function reorder(boardIds: string[]): Promise<MemberOpResult> {
    const result = await reorderAdminBoards({ boardIds }, getCsrf());
    if (!result.ok) return { ok: false, conflict: result.error.kind === "conflict" };
    boards.value = result.data.boards;
    return { ok: true };
  }

  /** 成员操作后同步板块 memberCount（服务端返回权威成员列表） */
  function syncMemberCount(boardId: string, members: BoardMemberDto[]) {
    boards.value = boards.value.map((board) =>
      board.id === boardId ? { ...board, memberCount: members.length } : board,
    );
  }

  async function addMember(boardId: string, groupId: string): Promise<MemberOpResult> {
    const result = await addBoardMember(boardId, { groupId }, getCsrf());
    if (!result.ok) {
      return {
        ok: false,
        conflict: result.error.kind === "conflict",
        reason: result.error.message,
      };
    }
    membersByBoard.value = { ...membersByBoard.value, [boardId]: result.data.members };
    syncMemberCount(boardId, result.data.members);
    return { ok: true };
  }

  async function removeMember(boardId: string, groupId: string): Promise<MemberOpResult> {
    const result = await removeBoardMember(boardId, groupId, getCsrf());
    if (!result.ok) return { ok: false };
    membersByBoard.value = { ...membersByBoard.value, [boardId]: result.data.members };
    syncMemberCount(boardId, result.data.members);
    return { ok: true };
  }

  async function moveMember(
    boardId: string,
    groupId: string,
    direction: "up" | "down",
  ): Promise<MemberOpResult> {
    const result = await moveBoardMember(boardId, groupId, { direction }, getCsrf());
    if (!result.ok) return { ok: false, conflict: result.error.kind === "conflict" };
    membersByBoard.value = { ...membersByBoard.value, [boardId]: result.data.members };
    syncMemberCount(boardId, result.data.members);
    return { ok: true };
  }

  onUnmounted(() => controller?.abort());

  return {
    boards,
    membersByBoard,
    loading,
    error,
    loaded,
    load,
    retry: load,
    createBoard,
    updateBoard,
    deleteBoard,
    reorder,
    addMember,
    removeMember,
    moveMember,
  };
}
