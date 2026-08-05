<script setup lang="ts">
import { ref, watch } from "vue";
import type { DemoGroup } from "../data/fixtures";
import Badge from "./Badge.vue";
import Button from "./Button.vue";
import Icon from "./Icon.vue";
import Spinner from "./Spinner.vue";

const props = withDefaults(
  defineProps<{
    group: DemoGroup;
    likeLoading?: boolean;
  }>(),
  { likeLoading: false },
);

const emit = defineEmits<{
  open: [group: DemoGroup];
  like: [group: DemoGroup];
}>();

const avatarFailed = ref(false);
watch(
  () => props.group.logoUrl,
  () => {
    avatarFailed.value = false;
  },
);

function onAvatarError() {
  avatarFailed.value = true;
}

function requestLike() {
  if (props.likeLoading) return;
  emit("like", props.group);
}
</script>

<template>
  <article class="group-card" :class="{ 'group-card--liked': props.group.liked }">
    <button class="group-card__body" type="button" @click="emit('open', props.group)">
      <span class="group-card__topline">
        <span
          class="group-avatar"
          :class="`group-avatar--${props.group.avatarState}`"
          aria-hidden="true"
        >
          <img
            v-if="props.group.avatarState === 'ready' && props.group.logoUrl && !avatarFailed"
            :src="props.group.logoUrl"
            :alt="props.group.title"
            loading="lazy"
            @error="onAvatarError"
          />
          <span v-else-if="props.group.avatarState === 'ready'">{{
            props.group.title.slice(0, 1)
          }}</span>
          <span v-else-if="props.group.avatarState === 'missing'">◎</span>
          <span v-else>!</span>
        </span>
        <span class="group-card__identity">
          <strong class="group-card__title" :title="props.group.title">{{
            props.group.title
          }}</strong>
          <span class="group-card__meta">
            <Badge tone="neutral">{{ props.group.kind }}</Badge>
            <span class="group-card__platform">{{ props.group.platform }}</span>
          </span>
        </span>
      </span>
      <span class="group-card__description">{{ props.group.description }}</span>
    </button>
    <span class="group-card__footer">
      <span class="group-card__tags" aria-label="群组标签">
        <span v-for="tag in props.group.tags.slice(0, 2)" :key="tag" class="group-card__tag"
          ># {{ tag }}</span
        >
      </span>
      <Button
        class="like-button"
        :class="{ 'like-button--active': props.group.liked }"
        :aria-pressed="props.group.liked"
        :aria-label="
          props.group.liked
            ? `取消赞，当前 ${props.group.likes} 个赞`
            : `点赞，当前 ${props.group.likes} 个赞`
        "
        :loading="props.likeLoading"
        @click.stop="requestLike"
      >
        <template #loading>
          <Icon name="heart" size="16" />
          <Spinner />
        </template>
        <Icon name="heart" size="16" />
        <span>{{ props.group.likes }}</span>
      </Button>
    </span>
  </article>
</template>
