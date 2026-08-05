import { onBeforeUnmount, readonly, ref, toValue, watch, type MaybeRefOrGetter } from "vue";

export const DEFAULT_LOADING_DELAY_MS = 150;

/**
 * Separates immediate interaction locking from the visual loading state.
 *
 * Consumers should use the source value for `aria-busy` and event guards, and
 * use `visualLoading` only for mounting a Spinner or other visible progress
 * indicator. A request that finishes before the delay never mounts one.
 */
export function useDelayedLoading(
  source: MaybeRefOrGetter<boolean>,
  delayMs = DEFAULT_LOADING_DELAY_MS,
) {
  const visualLoading = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
  }

  function updateVisualLoading(loading: boolean) {
    clearTimer();
    if (!loading) {
      visualLoading.value = false;
      return;
    }

    timer = setTimeout(() => {
      timer = null;
      if (toValue(source)) visualLoading.value = true;
    }, delayMs);
  }

  watch(() => toValue(source), updateVisualLoading, { immediate: true });

  onBeforeUnmount(() => {
    clearTimer();
  });

  return { visualLoading: readonly(visualLoading) };
}
