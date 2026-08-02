<script setup lang="ts">
import { ref } from "vue";
import type { DemoGroup } from "../data/fixtures";
import PrototypeButton from "./PrototypeButton.vue";
import PrototypeGroupCard from "./PrototypeGroupCard.vue";

const props = defineProps<{ groups: DemoGroup[] }>();
const emit = defineEmits<{
  open: [group: DemoGroup];
  like: [group: DemoGroup];
}>();

const track = ref<HTMLElement | null>(null);
const dragging = ref(false);
const pointerActive = ref(false);
const suppressClick = ref(false);
let startX = 0;
let startScrollLeft = 0;

function scrollByCard(direction: number) {
  track.value?.scrollBy({ left: direction * 308, behavior: "smooth" });
}

function startDrag(event: PointerEvent) {
  if (!track.value) return;
  pointerActive.value = true;
  dragging.value = false;
  suppressClick.value = false;
  startX = event.clientX;
  startScrollLeft = track.value.scrollLeft;
}

function moveDrag(event: PointerEvent) {
  if (!pointerActive.value || !track.value) return;
  const distance = Math.abs(event.clientX - startX);
  if (distance > 8 && !dragging.value) {
    dragging.value = true;
    track.value.setPointerCapture(event.pointerId);
  }
  if (!dragging.value) return;
  event.preventDefault();
  track.value.scrollLeft = startScrollLeft - (event.clientX - startX);
}

function endDrag(event: PointerEvent) {
  if (dragging.value && track.value?.hasPointerCapture(event.pointerId)) {
    track.value.releasePointerCapture(event.pointerId);
  }
  suppressClick.value = dragging.value;
  pointerActive.value = false;
  dragging.value = false;
}

function handleTrackClick(event: MouseEvent) {
  if (!suppressClick.value) return;
  event.preventDefault();
  event.stopPropagation();
  suppressClick.value = false;
}
</script>

<template>
  <div class="carousel-shell">
    <div class="carousel-controls" aria-label="Carousel 控制">
      <PrototypeButton
        variant="normal"
        size="sm"
        icon="arrow-left"
        icon-only
        aria-label="向左滚动"
        @click="scrollByCard(-1)"
      />
      <PrototypeButton
        variant="normal"
        size="sm"
        icon="arrow-right"
        icon-only
        aria-label="向右滚动"
        @click="scrollByCard(1)"
      />
    </div>
    <div
      ref="track"
      class="carousel-track"
      :class="{ 'carousel-track--dragging': dragging }"
      tabindex="0"
      aria-label="发现新群，可横向滚动"
      @pointerdown="startDrag"
      @pointermove="moveDrag"
      @pointerup="endDrag"
      @pointercancel="endDrag"
      @click.capture="handleTrackClick"
    >
      <div v-for="group in props.groups" :key="group.id" class="carousel-slide">
        <PrototypeGroupCard
          :group="group"
          @open="emit('open', $event)"
          @like="emit('like', $event)"
        />
      </div>
    </div>
  </div>
</template>
