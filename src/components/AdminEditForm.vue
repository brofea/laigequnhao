<script setup lang="ts">
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import {
  groupStatusLabels,
  groupStatusTones,
  type DemoGroup,
  type JoinMethod,
} from "../data/fixtures";
import { fetchPublicConfig } from "@/features/groups/api";
import type { PendingAdminImages } from "@/features/admin/pending-images";
import { compressImage, revokeImagePreview } from "@/shared/browser/image-compression";
import { useDelayedLoading } from "@/shared/composables/useDelayedLoading";
import Badge from "./Badge.vue";
import Button from "./Button.vue";
import Icon from "./Icon.vue";
import Select from "./Select.vue";
import Spinner from "./Spinner.vue";

export type AdminEditBusyAction = "save" | "delete" | "remove";

const props = withDefaults(
  defineProps<{
    group: DemoGroup;
    deletable?: boolean;
    removable?: boolean;
    publicMode?: boolean;
    /** 保存/提交中的状态，防止同一份待上传图片被重复提交。 */
    busy?: boolean;
    /** 当前正在执行的动作；比 busy 更细粒度，便于只给对应按钮显示 spinner。 */
    busyAction?: AdminEditBusyAction | null;
    /** 禁止表单交互，但不表示组件正在执行异步动作。 */
    disabled?: boolean;
  }>(),
  {
    deletable: true,
    removable: false,
    publicMode: false,
    busy: false,
    busyAction: null,
    disabled: false,
  },
);
const emit = defineEmits<{
  save: [group: DemoGroup, pendingImages: PendingAdminImages];
  cancel: [];
  delete: [];
  remove: [];
  toast: [message: string];
}>();

const isBusy = computed(() => Boolean(props.busy || props.busyAction));
const isSaveBusy = computed(() => props.busyAction === "save" || (props.busy && !props.busyAction));
const isDeleteBusy = computed(() => props.busyAction === "delete");
const isRemoveBusy = computed(() => props.busyAction === "remove");
const isDisabled = computed(() => props.disabled || isBusy.value);

function cloneJoinMethods(methods: JoinMethod[]) {
  return methods.map((method) => ({ ...method }));
}

const draft = reactive({
  title: props.group.title,
  description: props.group.description,
  kind: props.group.kind,
  platform: props.group.platform,
  status: props.group.status,
  tags: [...props.group.tags],
  joinMethods: cloneJoinMethods(props.group.joinMethods),
  contact: props.publicMode ? (props.group.contact ?? "") : "提交者仅在私密审核区可见",
  auditNotes: "已完成基础内容审核，等待下一次公开复核。",
});
const newTag = ref("");
const newJoinMethodType = ref<JoinMethod["type"]>("link");
const dirty = ref(false);
const avatarPreview = ref<string | null>(null);
const avatarPreviewOwned = ref(false);
const avatarRemoved = ref(false);
const pendingLogoBlob = ref<Blob | null>(null);
const pendingQrBlobs = reactive(new Map<string, Blob>());
const avatarFailed = ref(false);
watch(
  () => props.group.logoUrl,
  () => {
    avatarFailed.value = false;
  },
);
const uploadMessage = ref("");
const uploading = ref(false);
const { visualLoading: visualUploading } = useDelayedLoading(() => uploading.value);
const activeUploadKey = ref<string | null>(null);
const submissionLimitPerHour = ref<number | null>(null);
const logoR2Key = ref<string | null>(props.group.logoR2Key ?? null);
const avatarInput = ref<HTMLInputElement | null>(null);
const kindOptions = [
  { value: "兴趣", label: "兴趣" },
  { value: "工具", label: "工具" },
  { value: "同城", label: "同城" },
];
const statusOptions = [
  { value: "published", label: "已发布" },
  { value: "delisted", label: "已下架" },
  { value: "pending", label: "待审核" },
  { value: "rejected", label: "已拒绝" },
];
const platformOptions = [
  { value: "QQ", label: "QQ" },
  { value: "微信群", label: "微信群" },
  { value: "Telegram", label: "Telegram" },
  { value: "Discord", label: "Discord" },
];
const joinMethodOptions = [
  { value: "link" as const, label: "链接" },
  { value: "number" as const, label: "群号" },
  { value: "qr" as const, label: "二维码" },
];
const visibleJoinMethodOptions = computed(() =>
  props.publicMode
    ? joinMethodOptions.filter((option) => option.value !== "qr")
    : joinMethodOptions,
);
const joinMethodConfig: Record<JoinMethod["type"], { label: string; value: string }> = {
  link: { label: "邀请链接", value: "https://sample.invalid/new-link" },
  number: { label: "群号", value: "待填写群号" },
  qr: { label: "二维码", value: "二维码占位区域" },
};

watch(
  draft,
  () => {
    dirty.value = true;
  },
  { deep: true },
);

const ownedPreviewUrls = new Set<string>();
const imageRequestVersions = new Map<string, number>();

function imageRequestKey(method?: JoinMethod): string {
  return method ? `join-method:${method.id}` : "logo";
}

function nextImageRequestVersion(key: string): number {
  const version = (imageRequestVersions.get(key) ?? 0) + 1;
  imageRequestVersions.set(key, version);
  return version;
}

function isCurrentImageRequest(key: string, version: number): boolean {
  return imageRequestVersions.get(key) === version;
}

function revokeOwnedPreview(previewUrl: string | null | undefined) {
  if (!previewUrl || !ownedPreviewUrls.has(previewUrl)) return;
  ownedPreviewUrls.delete(previewUrl);
  revokeImagePreview(previewUrl);
}

function replaceAvatarPreview(previewUrl: string | null, owned = false) {
  if (avatarPreviewOwned.value) revokeOwnedPreview(avatarPreview.value);
  avatarPreview.value = previewUrl;
  avatarPreviewOwned.value = owned && previewUrl !== null;
  if (avatarPreviewOwned.value && previewUrl) ownedPreviewUrls.add(previewUrl);
}

function replaceJoinPreview(method: JoinMethod, previewUrl: string | undefined, owned = false) {
  revokeOwnedPreview(method.imagePreviewUrl);
  method.imagePreviewUrl = previewUrl;
  if (owned && previewUrl) ownedPreviewUrls.add(previewUrl);
}

function invalidateImageRequests() {
  for (const key of imageRequestVersions.keys()) nextImageRequestVersion(key);
}

function clearLocalPreviews() {
  if (avatarPreviewOwned.value) revokeOwnedPreview(avatarPreview.value);
  avatarPreviewOwned.value = false;
  for (const previewUrl of ownedPreviewUrls) revokeImagePreview(previewUrl);
  ownedPreviewUrls.clear();
  pendingLogoBlob.value = null;
  pendingQrBlobs.clear();
  invalidateImageRequests();
}

onMounted(async () => {
  if (!props.publicMode) return;
  const result = await fetchPublicConfig();
  if (result.ok) submissionLimitPerHour.value = result.data.submissionLimitPerHour;
});

onUnmounted(() => {
  clearLocalPreviews();
});

function addTag() {
  const tag = newTag.value.trim();
  if (!tag || tag.length > 7 || draft.tags.length >= 5 || draft.tags.includes(tag)) return;
  draft.tags.push(tag);
  newTag.value = "";
}

function removeTag(tag: string) {
  draft.tags = draft.tags.filter((item) => item !== tag);
}

function addJoinMethod(type: JoinMethod["type"] = newJoinMethodType.value) {
  // 每种加群方式最多一个：已存在同类型则忽略
  if (props.publicMode && type === "qr") return;
  if (draft.joinMethods.some((method) => method.type === type)) return;
  const config = joinMethodConfig[type];
  draft.joinMethods.push({
    id: `method-${String(draft.joinMethods.length + 1)}`,
    type,
    label: config.label,
    value: config.value,
  });
}

function chooseJoinMethod(value: string) {
  if (value === "link" || value === "number" || value === "qr") addJoinMethod(value);
}

function removeJoinMethod(id: string) {
  const method = draft.joinMethods.find((item) => item.id === id);
  if (method) {
    nextImageRequestVersion(imageRequestKey(method));
    pendingQrBlobs.delete(method.id);
    replaceJoinPreview(method, undefined);
  }
  draft.joinMethods = draft.joinMethods.filter((item) => item.id !== id);
}

function updateJoinMethod(method: JoinMethod, value: string) {
  method.value = value;
}

async function readImage(event: Event, method?: JoinMethod) {
  const input = event.target;
  if (!(input instanceof HTMLInputElement)) return;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  if (props.publicMode && method) {
    uploadMessage.value = "公开投稿只支持一张头像图片。";
    return;
  }
  const requestKey = imageRequestKey(method);
  const requestVersion = nextImageRequestVersion(requestKey);
  activeUploadKey.value = requestKey;
  uploading.value = true;
  uploadMessage.value = "正在处理图片…";
  try {
    const compressed = await compressImage(file, method ? "qr_code" : "logo");
    if (!isCurrentImageRequest(requestKey, requestVersion)) {
      revokeImagePreview(compressed.previewUrl);
      return;
    }

    if (props.publicMode) {
      replaceAvatarPreview(compressed.previewUrl, true);
      pendingLogoBlob.value = compressed.blob;
      avatarRemoved.value = false;
      uploadMessage.value = "头像已准备好，提交时会与表单一起上传。";
      return;
    }

    if (method) {
      replaceJoinPreview(method, compressed.previewUrl, true);
      pendingQrBlobs.set(method.id, compressed.blob);
      uploadMessage.value = "二维码已准备好，保存时上传。";
    } else {
      replaceAvatarPreview(compressed.previewUrl, true);
      pendingLogoBlob.value = compressed.blob;
      avatarRemoved.value = false;
      uploadMessage.value = "头像已准备好，保存时上传。";
    }
  } catch {
    if (!isCurrentImageRequest(requestKey, requestVersion)) return;

    if (method) {
      pendingQrBlobs.delete(method.id);
      replaceJoinPreview(method, undefined);
    } else {
      pendingLogoBlob.value = null;
      replaceAvatarPreview(null);
    }

    const toastMessage = method ? "图像压缩失败，请考虑裁剪图像" : "图像压缩失败";
    uploadMessage.value = toastMessage;
    emit("toast", toastMessage);
  } finally {
    if (isCurrentImageRequest(requestKey, requestVersion)) {
      uploading.value = false;
      if (activeUploadKey.value === requestKey) activeUploadKey.value = null;
    }
  }
}

function isVisualUploadLoading(method: JoinMethod) {
  return visualUploading.value && activeUploadKey.value === imageRequestKey(method);
}

function removeAvatar() {
  nextImageRequestVersion("logo");
  logoR2Key.value = null;
  pendingLogoBlob.value = null;
  replaceAvatarPreview(null);
  avatarRemoved.value = true;
  uploadMessage.value = "已移除头像，保存后生效。";
}

function openAvatarPicker() {
  if (isDisabled.value) return;
  avatarInput.value?.click();
}

function cancel() {
  if (isDisabled.value) return;
  clearLocalPreviews();
  emit("cancel");
}

function requestDestructiveAction() {
  if (isDisabled.value) return;
  clearLocalPreviews();
  if (props.removable) emit("remove");
  else emit("delete");
}

function save() {
  if (isDisabled.value) return;
  if (uploading.value) {
    uploadMessage.value = "图片仍在处理中，请稍候。";
    return;
  }

  const next: DemoGroup = {
    ...props.group,
    title: draft.title,
    description: draft.description,
    kind: draft.kind,
    platform: draft.platform,
    status: draft.status,
    tags: [...draft.tags],
    joinMethods: cloneJoinMethods(draft.joinMethods),
    logoR2Key: logoR2Key.value,
    contact: props.publicMode ? draft.contact : props.group.contact,
  };
  const pendingImages: PendingAdminImages = {
    logo: pendingLogoBlob.value ?? undefined,
    qr: props.publicMode
      ? []
      : draft.joinMethods.flatMap((method) => {
          const blob = pendingQrBlobs.get(method.id);
          return blob ? [{ methodId: method.id, blob }] : [];
        }),
  };
  emit("save", next, pendingImages);
}
</script>

<template>
  <form class="admin-edit-form" :aria-busy="isBusy || undefined" @submit.prevent="save">
    <div v-if="!props.publicMode" class="admin-edit-form__status">
      <Badge :tone="props.publicMode ? 'warning' : groupStatusTones[draft.status]" dot>
        {{ props.publicMode ? "待审核" : groupStatusLabels[draft.status] }}
      </Badge>
      <span v-if="dirty" class="admin-edit-form__dirty"><i></i>有未保存修改</span>
    </div>

    <section class="admin-edit-section">
      <div class="admin-edit-section__heading">
        <div>
          <p class="eyebrow">Identity</p>
          <h3>头像与基本信息</h3>
        </div>
      </div>
      <div class="admin-edit-avatar-row">
        <span
          class="group-avatar group-avatar--large"
          :class="`group-avatar--${props.group.avatarState}`"
        >
          <img v-if="avatarPreview" :src="avatarPreview" alt="已上传的群组头像预览" />
          <img
            v-else-if="
              props.group.avatarState === 'ready' &&
              props.group.logoUrl &&
              !avatarFailed &&
              !avatarRemoved
            "
            :src="props.group.logoUrl"
            :alt="props.group.title"
            @error="avatarFailed = true"
          />
          <template v-else>{{
            props.group.avatarState === "ready" ? draft.title.slice(0, 1) : "◎"
          }}</template>
        </span>
        <div>
          <strong>群组头像</strong>
          <p>
            {{
              props.publicMode
                ? "原图支持 PNG、JPEG 或 WebP，提交时转为 PNG（最大 128KB）。"
                : "原图支持 PNG、JPEG 或 WebP，保存时转为 PNG（最大 128KB）。"
            }}
          </p>
        </div>
        <div class="admin-edit-inline-actions">
          <Button
            variant="normal"
            size="sm"
            :loading="uploading"
            :disabled="props.disabled || isBusy"
            @click="openAvatarPicker"
          >
            上传头像
          </Button>
          <Button variant="quiet" size="sm" :disabled="isDisabled" @click="removeAvatar">
            移除
          </Button>
          <input
            ref="avatarInput"
            class="app-sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
            aria-label="上传群组头像"
            @change="readImage"
          />
        </div>
      </div>
      <label class="admin-edit-field">
        <span>群组标题</span>
        <span class="admin-edit-field__control">
          <input v-model="draft.title" type="text" maxlength="80" required :disabled="isDisabled" />
        </span>
      </label>
      <label class="admin-edit-field">
        <span>群组简介</span>
        <span class="admin-edit-field__control admin-edit-field__control--textarea">
          <textarea
            v-model="draft.description"
            rows="4"
            maxlength="1000"
            :disabled="isDisabled"
          ></textarea>
        </span>
        <small>{{ draft.description.length }}/1000</small>
      </label>
      <div class="admin-edit-fields-grid">
        <Select
          v-model="draft.kind"
          label="群组性质"
          :options="kindOptions"
          :loading="isBusy"
          :disabled="props.disabled"
        /><Select
          v-model="draft.platform"
          label="平台"
          :options="platformOptions"
          :loading="isBusy"
          :disabled="props.disabled"
        /><Select
          v-if="!props.publicMode"
          v-model="draft.status"
          label="状态"
          :options="statusOptions"
          :loading="isBusy"
          :disabled="props.disabled"
        />
        <div v-else class="public-submit-status" aria-label="审核状态">
          <span class="app-field__label">状态</span>
          <div class="public-submit-status__value">
            <Badge tone="warning" dot>待审核</Badge><small>提交后由管理员审核</small>
          </div>
        </div>
      </div>
    </section>

    <section class="admin-edit-section">
      <div class="admin-edit-section__heading">
        <div>
          <p class="eyebrow">Tags</p>
          <h3>标签</h3>
        </div>
        <span class="table-muted">最多 5 个，每个最多 7 个字</span>
      </div>
      <div class="admin-edit-tags">
        <span v-for="tag in draft.tags" :key="tag" class="admin-edit-tag"
          ># {{ tag
          }}<button
            type="button"
            :aria-label="`移除标签 ${tag}`"
            :disabled="isDisabled"
            @click="removeTag(tag)"
          >
            <Icon name="close" size="13" /></button></span
        ><span v-if="!draft.tags.length" class="table-muted">尚未添加标签</span>
      </div>
      <div class="admin-edit-add-row">
        <span class="admin-edit-add-row__control">
          <input
            v-model="newTag"
            type="text"
            maxlength="7"
            aria-label="添加标签"
            placeholder="添加标签"
            :disabled="isDisabled"
            @keydown.enter.prevent="addTag"
          />
        </span>
        <Button
          variant="normal"
          size="sm"
          icon="plus"
          :disabled="isDisabled || draft.tags.length >= 5"
          @click="addTag"
        >
          添加
        </Button>
      </div>
    </section>

    <section class="admin-edit-section">
      <div class="admin-edit-section__heading">
        <div>
          <p class="eyebrow">Join methods</p>
          <h3>加群方式</h3>
        </div>
        <Select
          v-model="newJoinMethodType"
          label="加群方式"
          trigger-label="添加加群方式"
          trigger-icon="plus"
          :options="visibleJoinMethodOptions"
          :loading="isBusy"
          :disabled="props.disabled"
          @update:model-value="chooseJoinMethod"
        />
      </div>
      <div class="admin-edit-join-list">
        <div
          v-for="method in draft.joinMethods"
          :key="method.id"
          class="admin-edit-join-row"
          :class="{ 'admin-edit-join-row--qr': method.type === 'qr' }"
        >
          <span class="admin-edit-join-icon">{{
            method.type === "qr" ? "⌗" : method.type === "number" ? "#" : "↗"
          }}</span>
          <template v-if="method.type === 'qr'">
            <div v-if="!props.publicMode" class="admin-edit-qr-editor">
              <span class="admin-edit-join-label">{{ method.label }}</span>
              <div class="admin-edit-qr-preview">
                <img
                  v-if="method.imagePreviewUrl || method.imageData"
                  :src="method.imagePreviewUrl || method.imageData"
                  alt="已上传的二维码预览"
                />
                <span v-else>二维码图片占位</span>
              </div>
              <label
                class="app-button app-button--normal app-button--sm admin-edit-upload-button"
                :aria-busy="uploading ? 'true' : undefined"
              >
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  :disabled="uploading || isDisabled"
                  :aria-label="`上传${method.label}`"
                  @change="readImage($event, method)"
                />
                <Spinner v-if="isVisualUploadLoading(method)" class="app-field__spinner" />
                <Icon v-else name="upload" size="16" />
                <span class="app-button__label">上传图片</span>
              </label>
              <small>原图支持 PNG、JPEG 或 WebP，保存时转为 PNG，最大 1MB。</small>
            </div>
            <p v-else class="table-muted">公开投稿不支持二维码上传。</p>
          </template>
          <div v-else class="admin-edit-join-inputs">
            <span class="admin-edit-join-label">{{ method.label }}</span
            ><input
              :value="method.value"
              type="text"
              :aria-label="method.label"
              :disabled="isDisabled"
              @input="updateJoinMethod(method, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <Button
            variant="quiet"
            size="sm"
            icon="trash"
            icon-only
            aria-label="移除加群方式"
            :disabled="isDisabled"
            @click="removeJoinMethod(method.id)"
          />
        </div>
        <div v-if="!draft.joinMethods.length" class="app-empty app-empty--compact">
          <strong>还没有加群方式</strong><span>添加链接、群号或二维码。</span>
        </div>
      </div>
      <small v-if="uploadMessage" class="admin-edit-upload-message" role="status">{{
        uploadMessage
      }}</small>
    </section>

    <section v-if="!props.publicMode" class="admin-edit-section">
      <div class="admin-edit-section__heading">
        <div>
          <p class="eyebrow">Private review</p>
          <h3>私密审核信息</h3>
        </div>
        <span class="table-muted">不会公开展示</span>
      </div>
      <label class="admin-edit-field">
        <span>提交者联系方式</span>
        <span class="admin-edit-field__control">
          <input :value="draft.contact" type="text" readonly />
        </span>
      </label>
      <label class="admin-edit-field">
        <span>审核备注</span>
        <span class="admin-edit-field__control admin-edit-field__control--textarea">
          <textarea v-model="draft.auditNotes" rows="3" :disabled="isDisabled"></textarea>
        </span>
      </label>
    </section>

    <section v-if="props.publicMode" class="admin-edit-section">
      <div class="admin-edit-section__heading">
        <div>
          <p class="eyebrow">Private contact</p>
          <h3>私密联系方式</h3>
        </div>
        <span class="table-muted">仅管理员可见，不会公开展示</span>
      </div>
      <label class="admin-edit-field">
        <span>提交者联系方式</span>
        <span class="admin-edit-field__control">
          <input
            v-model="draft.contact"
            type="text"
            placeholder="邮箱、QQ 或微信号"
            :disabled="isDisabled"
          />
        </span>
      </label>
    </section>

    <div class="admin-edit-form__footer">
      <Button
        v-if="props.deletable || props.removable"
        variant="quiet"
        tone="danger"
        :icon="props.removable ? 'arrow-right' : 'trash'"
        :loading="props.removable ? isRemoveBusy : isDeleteBusy"
        :disabled="props.disabled || (isBusy && !(props.removable ? isRemoveBusy : isDeleteBusy))"
        @click="requestDestructiveAction"
      >
        {{ props.removable ? "移除群组" : "删除群组" }}
      </Button>
      <span class="admin-edit-form__footer-spacer"></span>
      <Button
        variant="quiet"
        :disabled="props.disabled || isBusy"
        :aria-busy="isBusy ? 'true' : undefined"
        @click="cancel"
      >
        取消
      </Button>
      <Button
        variant="normal"
        type="submit"
        icon="check"
        :loading="isSaveBusy"
        :disabled="props.disabled || (isBusy && !isSaveBusy)"
      >
        {{ props.publicMode ? "提交群组" : "保存修改" }}
      </Button>
    </div>
    <p v-if="props.publicMode && submissionLimitPerHour" class="admin-edit-rate-limit-note">
      单个 IP / 设备每小时只能提交 {{ submissionLimitPerHour }} 个群
    </p>
  </form>
</template>
