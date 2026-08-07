import { ref } from "vue";
import { z } from "zod";
import { getItem, setItem } from "@/shared/browser/storage";
import { toggleLike } from "../api";

const likedIdsSchema = z.array(z.string());

function getOrCreateDeviceId(): string {
  let id = localStorage.getItem("deviceId");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("deviceId", id);
  }
  return id;
}

export type LikeToggleResult =
  { ok: true; data: { liked: boolean; likeCount: number } } | { ok: false; code: string };

export function useLikedGroups() {
  const deviceId = getOrCreateDeviceId();
  const likedIds = ref<Set<string>>(new Set(getItem("likedIds", likedIdsSchema) ?? []));

  function save() {
    setItem("likedIds", [...likedIds.value]);
  }

  async function toggle(groupId: string, currentLiked: boolean): Promise<LikeToggleResult> {
    const result = await toggleLike(groupId, currentLiked);

    if (!result.ok) return { ok: false, code: result.error.code };

    const next = new Set(likedIds.value);
    if (result.data.liked) next.add(groupId);
    else next.delete(groupId);
    likedIds.value = next;
    save();

    return { ok: true, data: result.data };
  }

  return { deviceId, likedIds, toggle };
}
