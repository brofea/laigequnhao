<script setup lang="ts">
import { reactive, ref, watch } from "vue";
import {
  groupStatusLabels,
  groupStatusTones,
  type DemoGroup,
  type JoinMethod,
} from "../data/fixtures";
import { uploadLogoAsset, uploadQrAsset } from "@/features/admin/api";
import Badge from "./Badge.vue";
import Button from "./Button.vue";
import Icon from "./Icon.vue";
import Select from "./Select.vue";

const props = withDefaults(
  defineProps<{
    group: DemoGroup;
    deletable?: boolean;
    removable?: boolean;
    publicMode?: boolean;
    /** 管理模式下提供：图片上传走真实 asset API */
    csrfToken?: string;
  }>(),
  {
    deletable: true,
    removable: false,
    publicMode: false,
    csrfToken: "",
  },
);
const emit = defineEmits<{
  save: [group: DemoGroup];
  cancel: [];
  delete: [];
  remove: [];
  toast: [message: string];
}>();

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
  contact: "提交者仅在私密审核区可见",
  auditNotes: "已完成基础内容审核，等待下一次公开复核。",
});
const newTag = ref("");
const newJoinMethodType = ref<JoinMethod["type"]>("link");
const dirty = ref(false);
const avatarPreview = ref<string | null>(null);
const uploadMessage = ref("");
const uploading = ref(false);
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
  draft.joinMethods = draft.joinMethods.filter((method) => method.id !== id);
}

function updateJoinMethod(method: JoinMethod, value: string) {
  method.value = value;
}

async function readImage(event: Event, method?: JoinMethod) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    uploadMessage.value = "请选择图片文件。";
    return;
  }

  // 管理模式：走真实 asset API（服务端校验类型/大小/WebP 处理）
  if (props.csrfToken) {
    uploading.value = true;
    uploadMessage.value = "正在上传…";
    try {
      if (method) {
        const result = await uploadQrAsset(file, props.csrfToken);
        if (result.ok) {
          method.assetId = result.data.id;
          method.value = result.data.publicUrl;
          uploadMessage.value = "二维码已上传";
        } else {
          uploadMessage.value = result.error.message;
        }
      } else {
        const result = await uploadLogoAsset(file, props.csrfToken);
        if (result.ok) {
          logoR2Key.value = result.data.r2Key;
          avatarPreview.value = result.data.publicUrl;
          uploadMessage.value = "头像已上传";
        } else {
          uploadMessage.value = result.error.message;
        }
      }
    } finally {
      uploading.value = false;
    }
    return;
  }

  // 公开投稿/无凭证：保留本地预览（生产投稿不接受文件字段）
  const reader = new FileReader();
  reader.onload = () => {
    const data = typeof reader.result === "string" ? reader.result : "";
    if (method) {
      method.imageData = data;
      method.value = "已上传二维码图片";
    } else {
      avatarPreview.value = data;
    }
    uploadMessage.value = "已生成本地图片预览；正式上传受单个 IP/设备每小时 1 次限制。";
  };
  reader.readAsDataURL(file);
}

function removeAvatar() {
  logoR2Key.value = null;
  avatarPreview.value = null;
  uploadMessage.value = "已移除头像，保存后生效。";
}

function openAvatarPicker() {
  avatarInput.value?.click();
}

function save() {
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
  };
  emit("save", next);
}
</script>

<template>
  <form class="admin-edit-form" @submit.prevent="save">
    <div v-if="!props.publicMode" class="admin-edit-form__status">
      <Badge :tone="props.publicMode ? 'warning' : groupStatusTones[draft.status]" dot>{{
        props.publicMode ? "待审核" : groupStatusLabels[draft.status]
      }}</Badge>
      <span v-if="dirty" class="admin-edit-form__dirty"><i></i>有未保存修改</span>
    </div>

    <section class="admin-edit-section">
      <div class="admin-edit-section__heading">
        <div>
          <p class="eyebrow">Identity</p>
          <h3>头像与基本信息</h3>
        </div>
        <span class="table-muted">字段与 v1 抽屉一致</span>
      </div>
      <div class="admin-edit-avatar-row">
        <span
          class="group-avatar group-avatar--large"
          :class="`group-avatar--${props.group.avatarState}`"
        >
          <img v-if="avatarPreview" :src="avatarPreview" alt="已上传的群组头像预览" />
          <template v-else>{{
            props.group.avatarState === "ready" ? draft.title.slice(0, 1) : "◎"
          }}</template>
        </span>
        <div>
          <strong>群组头像</strong>
          <p>
            {{ props.publicMode ? "可上传图片作为群组头像。" : "支持替换、移除或保留缺失占位。" }}
          </p>
        </div>
        <div class="admin-edit-inline-actions">
          <Button variant="normal" size="sm" :disabled="uploading" @click="openAvatarPicker"
            >上传头像</Button
          ><Button variant="quiet" size="sm" @click="removeAvatar">移除</Button>
          <input
            ref="avatarInput"
            class="app-sr-only"
            type="file"
            accept="image/*"
            aria-label="上传群组头像"
            @change="readImage"
          />
        </div>
      </div>
      <label class="admin-edit-field">
        <span>群组标题</span>
        <span class="admin-edit-field__control">
          <input v-model="draft.title" type="text" maxlength="80" required />
        </span>
      </label>
      <label class="admin-edit-field">
        <span>群组简介</span>
        <span class="admin-edit-field__control admin-edit-field__control--textarea">
          <textarea v-model="draft.description" rows="4" maxlength="1000"></textarea>
        </span>
        <small>{{ draft.description.length }}/1000</small>
      </label>
      <div class="admin-edit-fields-grid">
        <Select v-model="draft.kind" label="群组性质" :options="kindOptions" /><Select
          v-model="draft.platform"
          label="平台"
          :options="platformOptions"
        /><Select
          v-if="!props.publicMode"
          v-model="draft.status"
          label="状态"
          :options="statusOptions"
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
          }}<button type="button" :aria-label="`移除标签 ${tag}`" @click="removeTag(tag)">
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
            @keydown.enter.prevent="addTag"
          />
        </span>
        <Button
          variant="normal"
          size="sm"
          icon="plus"
          :disabled="draft.tags.length >= 5"
          @click="addTag"
          >添加</Button
        >
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
          :options="joinMethodOptions"
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
            <div class="admin-edit-qr-editor">
              <span class="admin-edit-join-label">{{ method.label }}</span>
              <div class="admin-edit-qr-preview">
                <img v-if="method.imageData" :src="method.imageData" alt="已上传的二维码预览" />
                <span v-else>二维码图片占位</span>
              </div>
              <label class="app-button app-button--normal app-button--sm admin-edit-upload-button">
                <input
                  type="file"
                  accept="image/*"
                  :aria-label="`上传${method.label}`"
                  @change="readImage($event, method)"
                />
                <Icon name="upload" size="16" />
                <span class="app-button__label">上传图片</span>
              </label>
              <small>支持图片预览；单个 IP/设备每小时最多成功上传 1 次。</small>
            </div>
          </template>
          <div v-else class="admin-edit-join-inputs">
            <span class="admin-edit-join-label">{{ method.label }}</span
            ><input
              :value="method.value"
              type="text"
              :aria-label="method.label"
              @input="updateJoinMethod(method, ($event.target as HTMLInputElement).value)"
            />
          </div>
          <Button
            variant="quiet"
            size="sm"
            icon="trash"
            icon-only
            aria-label="移除加群方式"
            @click="removeJoinMethod(method.id)"
          />
        </div>
        <div v-if="!draft.joinMethods.length" class="app-empty app-empty--compact">
          <strong>还没有加群方式</strong><span>添加链接、群号或二维码。</span>
        </div>
      </div>
      <small v-if="uploadMessage" class="admin-edit-upload-message">{{ uploadMessage }}</small>
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
          <textarea v-model="draft.auditNotes" rows="3"></textarea>
        </span>
      </label>
    </section>

    <div class="admin-edit-form__footer">
      <Button
        v-if="props.deletable || props.removable"
        variant="quiet"
        tone="danger"
        :icon="props.removable ? 'arrow-right' : 'trash'"
        @click="props.removable ? emit('remove') : emit('delete')"
        >{{ props.removable ? "移除群组" : "删除群组" }}</Button
      >
      <span class="admin-edit-form__footer-spacer"></span>
      <Button variant="quiet" @click="emit('cancel')">取消</Button
      ><Button variant="normal" type="submit" icon="check">{{
        props.publicMode ? "提交群组" : "保存修改"
      }}</Button>
    </div>
  </form>
</template>
