import { createApp } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAdminBoards: vi.fn(),
  fetchBoardMembers: vi.fn(),
}));

vi.mock("../api", () => ({
  fetchAdminBoards: mocks.fetchAdminBoards,
  fetchBoardMembers: mocks.fetchBoardMembers,
}));

import { useAdminBoards } from "./useAdminBoards";

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function flushPromises() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("useAdminBoards 请求生命周期", () => {
  let cleanup: () => void = () => {};

  beforeEach(() => vi.clearAllMocks());
  afterEach(() => {
    cleanup();
  });

  it("旧批次成员请求返回时不会清掉新批次的 loading 或覆盖板块", async () => {
    const boardRequests: Array<{
      signal: AbortSignal | undefined;
      deferred: Deferred<unknown>;
    }> = [];
    const memberRequests: Array<{
      boardId: string;
      deferred: Deferred<unknown>;
    }> = [];
    mocks.fetchAdminBoards.mockImplementation((signal?: AbortSignal) => {
      const next = deferred<unknown>();
      boardRequests.push({ signal, deferred: next });
      return next.promise;
    });
    mocks.fetchBoardMembers.mockImplementation((boardId: string) => {
      const next = deferred<unknown>();
      memberRequests.push({ boardId, deferred: next });
      return next.promise;
    });

    let boards!: ReturnType<typeof useAdminBoards>;
    const app = createApp({
      setup() {
        boards = useAdminBoards(() => "csrf-token");
        return () => null;
      },
    });
    const host = document.createElement("div");
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    const firstLoad = boards.load();
    expect(boards.loading.value).toBe(true);
    boardRequests[0]?.deferred.resolve({
      ok: true,
      data: { boards: [{ id: "旧板块" }] },
    });
    await flushPromises();
    expect(memberRequests).toHaveLength(1);

    const secondLoad = boards.load();
    expect(boardRequests).toHaveLength(2);
    expect(boardRequests[0]?.signal?.aborted).toBe(true);

    memberRequests[0]?.deferred.resolve({ ok: true, data: { members: [] } });
    await flushPromises();
    expect(boards.loading.value).toBe(true);
    expect(boards.membersByBoard.value).toEqual({});

    boardRequests[1]?.deferred.resolve({
      ok: true,
      data: { boards: [{ id: "新板块" }] },
    });
    await flushPromises();
    expect(memberRequests).toHaveLength(2);
    memberRequests[1]?.deferred.resolve({
      ok: true,
      data: { members: [{ groupId: "新群组" }] },
    });
    await expect(firstLoad).resolves.toBe(false);
    await expect(secondLoad).resolves.toBe(true);
    expect(boards.loading.value).toBe(false);
    expect(boards.boards.value).toEqual([{ id: "新板块" }]);
    expect(boards.membersByBoard.value).toEqual({
      新板块: [{ groupId: "新群组" }],
    });
  });
});
