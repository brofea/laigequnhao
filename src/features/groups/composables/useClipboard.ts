import { ref } from "vue";

export function useClipboard() {
  const toastMessage = ref("");
  const toastType = ref<"success" | "error">("success");

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      toastMessage.value = "已复制群号";
      toastType.value = "success";
      return true;
    } catch {
      toastMessage.value = "复制失败，请手动复制";
      toastType.value = "error";
      return false;
    }
  }

  return { toastMessage, toastType, copy };
}
