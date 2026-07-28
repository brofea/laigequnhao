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

export function useLikedGroups() {
  const deviceId = getOrCreateDeviceId();
  const likedIds = ref<Set<string>>(new Set(getItem("likedIds", likedIdsSchema) ?? []));

  function save() {
    setItem("likedIds", [...likedIds.value]);
  }

  async function toggle(groupId: string, currentLiked: boolean): Promise<number | null> {
    const prevLiked = likedIds.value.has(groupId);

    // 乐观更新
    if (currentLiked) {
      likedIds.value.delete(groupId);
    } else {
      likedIds.value.add(groupId);
    }
    likedIds.value = new Set(likedIds.value);
    save();

    const result = await toggleLike(groupId, currentLiked);

    if (!result.ok) {
      // 回滚
      if (prevLiked) {
        likedIds.value.add(groupId);
      } else {
        likedIds.value.delete(groupId);
      }
      likedIds.value = new Set(likedIds.value);
      save();
      return null;
    }

    return result.data.likeCount;
  }

  return { deviceId, likedIds, toggle };
}
