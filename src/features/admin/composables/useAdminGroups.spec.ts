import { createApp, nextTick, reactive } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetchAdminGroupsPage: vi.fn(),
  useRoute: vi.fn(),
  useRouter: vi.fn(),
}));

vi.mock("../api", () => ({ fetchAdminGroupsPage: mocks.fetchAdminGroupsPage }));
vi.mock("vue-router", () => ({
  useRoute: mocks.useRoute,
  useRouter: mocks.useRouter,
}));

import { useAdminGroups } from "./useAdminGroups";

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

describe("useAdminGroups 请求生命周期", () => {
  const route = reactive({ query: {} });
  let cleanup: () => void = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
    route.query = {};
    mocks.useRoute.mockReturnValue(route);
    mocks.useRouter.mockReturnValue({ replace: vi.fn() });
  });

  afterEach(() => {
    cleanup();
  });

  it("过期请求返回时不会清掉新请求的 loading 或覆盖列表", async () => {
    const requests: Array<{
      signal: AbortSignal | undefined;
      deferred: Deferred<unknown>;
    }> = [];
    mocks.fetchAdminGroupsPage.mockImplementation((params: { signal?: AbortSignal }) => {
      const next = deferred<unknown>();
      requests.push({ signal: params.signal, deferred: next });
      return next.promise;
    });

    let groups!: ReturnType<typeof useAdminGroups>;
    const app = createApp({
      setup() {
        groups = useAdminGroups(() => "csrf-token");
        return () => null;
      },
    });
    const host = document.createElement("div");
    app.mount(host);
    cleanup = () => {
      app.unmount();
      host.remove();
    };

    expect(groups.loading.value).toBe(true);
    route.query = { q: "新查询" };
    await nextTick();
    expect(requests).toHaveLength(2);
    expect(requests[0]?.signal?.aborted).toBe(true);

    requests[0]?.deferred.resolve({
      ok: true,
      data: { items: [{ id: "旧群组" }], totalItems: 1, totalPages: 1, page: 1 },
    });
    await flushPromises();
    expect(groups.loading.value).toBe(true);
    expect(groups.groups.value).toEqual([]);

    requests[1]?.deferred.resolve({
      ok: true,
      data: { items: [{ id: "新群组" }], totalItems: 1, totalPages: 1, page: 1 },
    });
    await flushPromises();
    expect(groups.loading.value).toBe(false);
    expect(groups.groups.value).toEqual([{ id: "新群组" }]);
  });
});
