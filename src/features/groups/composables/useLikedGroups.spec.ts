import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLikedGroups } from "./useLikedGroups";
import { toggleLike } from "../api";

vi.mock("../api", () => ({
  toggleLike: vi.fn(),
}));

const mockedToggleLike = vi.mocked(toggleLike);
const storage = new Map<string, string>();

describe("useLikedGroups", () => {
  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    });
    mockedToggleLike.mockReset();
  });

  it("waits for the authoritative response before changing liked state", async () => {
    let resolveRequest:
      ((value: { ok: true; data: { liked: boolean; likeCount: number } }) => void) | undefined;
    mockedToggleLike.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const groups = useLikedGroups();

    const request = groups.toggle("group-1", false);
    expect(groups.likedIds.value.has("group-1")).toBe(false);

    resolveRequest?.({ ok: true, data: { liked: true, likeCount: 4 } });
    await expect(request).resolves.toEqual({ liked: true, likeCount: 4 });
    expect(groups.likedIds.value.has("group-1")).toBe(true);
  });

  it("keeps the prior state when the request fails", async () => {
    groupsWithLikedId("group-2");
    mockedToggleLike.mockResolvedValue({
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "暂时不可用",
        kind: "network",
        retryable: true,
      },
    });
    const groups = useLikedGroups();

    await expect(groups.toggle("group-2", true)).resolves.toBeNull();
    expect(groups.likedIds.value.has("group-2")).toBe(true);
  });
});

function groupsWithLikedId(groupId: string) {
  storage.set("likedIds", JSON.stringify([groupId]));
}
