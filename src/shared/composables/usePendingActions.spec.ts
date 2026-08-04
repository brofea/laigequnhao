import { describe, expect, it, vi } from "vitest";
import { usePendingActions } from "./usePendingActions";

describe("usePendingActions", () => {
  it("starts and finishes a keyed action", () => {
    const actions = usePendingActions();

    expect(actions.isPending("group:one:like")).toBe(false);
    expect(actions.start("group:one:like")).toBe(true);
    expect(actions.isPending("group:one:like")).toBe(true);

    actions.finish("group:one:like");

    expect(actions.isPending("group:one:like")).toBe(false);
  });

  it("prevents duplicate starts for one key while isolating other keys", () => {
    const actions = usePendingActions();

    expect(actions.start("group:one:like")).toBe(true);
    expect(actions.start("group:one:like")).toBe(false);
    expect(actions.start("group:two:like")).toBe(true);
    expect(actions.isPending("group:one:like")).toBe(true);
    expect(actions.isPending("group:two:like")).toBe(true);
  });

  it("clears pending state after a successful run", async () => {
    const actions = usePendingActions();
    const operation = vi.fn().mockResolvedValue("authoritative result");

    await expect(actions.run("group:one:like", operation)).resolves.toBe("authoritative result");

    expect(operation).toHaveBeenCalledOnce();
    expect(actions.isPending("group:one:like")).toBe(false);
  });

  it("clears pending state and rethrows when a run fails", async () => {
    const actions = usePendingActions();
    const failure = new Error("network unavailable");
    const operation = vi.fn().mockRejectedValue(failure);

    await expect(actions.run("group:one:like", operation)).rejects.toBe(failure);

    expect(actions.isPending("group:one:like")).toBe(false);
    expect(actions.start("group:one:like")).toBe(true);
  });

  it("does not invoke a duplicate run while the first operation is pending", async () => {
    const actions = usePendingActions();
    let resolveFirst: ((value: string) => void) | undefined;
    const first = new Promise<string>((resolve) => {
      resolveFirst = resolve;
    });
    const firstOperation = vi.fn(() => first);
    const duplicateOperation = vi.fn().mockResolvedValue("duplicate");

    const firstRun = actions.run("group:one:like", firstOperation);
    const duplicateRun = actions.run("group:one:like", duplicateOperation);

    await expect(duplicateRun).resolves.toBeUndefined();
    expect(duplicateOperation).not.toHaveBeenCalled();
    expect(actions.isPending("group:one:like")).toBe(true);

    resolveFirst?.("first");
    await expect(firstRun).resolves.toBe("first");
    expect(actions.isPending("group:one:like")).toBe(false);
  });
});
