import { readonly, ref } from "vue";

/**
 * Tracks user-triggered asynchronous actions by resource/action key.
 *
 * A key can only be started once until it is finished. This keeps duplicate
 * clicks for the same resource from issuing another request while allowing
 * independent resources to continue in parallel.
 */
export function usePendingActions() {
  const pendingKeys = ref<ReadonlySet<string>>(new Set<string>());

  function isPending(key: string): boolean {
    return pendingKeys.value.has(key);
  }

  /** Start an action, returning false when the same key is already pending. */
  function start(key: string): boolean {
    if (pendingKeys.value.has(key)) return false;
    const next = new Set(pendingKeys.value);
    next.add(key);
    pendingKeys.value = next;
    return true;
  }

  function finish(key: string): void {
    if (!pendingKeys.value.has(key)) return;
    const next = new Set(pendingKeys.value);
    next.delete(key);
    pendingKeys.value = next;
  }

  /**
   * Run an action at most once for its key and always clear pending state.
   * Duplicate calls resolve to undefined without invoking the operation.
   */
  async function run<T>(key: string, operation: () => Promise<T> | T): Promise<T | undefined> {
    if (!start(key)) return undefined;
    try {
      return await operation();
    } finally {
      finish(key);
    }
  }

  return {
    pendingKeys: readonly(pendingKeys),
    isPending,
    start,
    finish,
    run,
  };
}
