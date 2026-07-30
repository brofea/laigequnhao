import { flushPromises, mount } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMemoryHistory, createRouter } from "vue-router";
import type { AdminGroupDto } from "@shared/contracts/group";
import AdminGroupDrawer from "./AdminGroupDrawer.vue";
import AdminGroupFields from "./AdminGroupFields.vue";
import AdminJoinMethodEditor from "./AdminJoinMethodEditor.vue";

const routeLeave = vi.hoisted(() => ({
  guard: null as null | (() => boolean | Promise<boolean>),
}));

vi.mock("vue-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("vue-router")>();
  return {
    ...actual,
    onBeforeRouteLeave: vi.fn((guard: () => boolean | Promise<boolean>) => {
      routeLeave.guard = guard;
    }),
  };
});

const readyAssetId = "11111111-1111-4111-8111-111111111111";
const stagedAssetId = "22222222-2222-4222-8222-222222222222";
const replacementAssetId = "44444444-4444-4444-8444-444444444444";

const group: AdminGroupDto = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  title: "已有二维码群",
  description: "测试",
  kind: "interest",
  platform: "qq",
  tags: ["测试"],
  status: "published",
  logoUrl: null,
  logoMeta: null,
  joinMethods: [
    {
      type: "qr_code",
      assetId: readyAssetId,
      assetUrl: "https://assets.example/ready.webp",
      qrCodeUrl: "https://assets.example/ready.webp",
    },
    { type: "group_number", value: "123456" },
  ],
  likeCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  submissionContact: null,
  auditNotes: null,
  deletedAt: null,
  deleteProgress: "none",
  logoR2Key: null,
  version: 1,
};

async function mountDrawer(attachToDocument = false) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/", component: { template: "<div />" } }],
  });
  await router.push("/");
  await router.isReady();
  const options = {
    props: {
      group,
      open: true,
      saving: false,
      saved: false,
      csrfToken: "csrf-token",
    },
    global: {
      plugins: [router],
      stubs: { Teleport: true },
    },
  };
  return attachToDocument
    ? mount(AdminGroupDrawer, { ...options, attachTo: document.body })
    : mount(AdminGroupDrawer, options);
}

afterEach(() => {
  routeLeave.guard = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AdminGroupDrawer staged asset ownership", () => {
  it("does not purge a ready asset, but purges a tracked staged asset exactly once", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        data: { id: stagedAssetId },
        requestId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = await mountDrawer();
    const editor = wrapper.getComponent(AdminJoinMethodEditor);
    expect(editor.get('img[alt="二维码预览"]').attributes("src")).toBe(
      "https://assets.example/ready.webp",
    );

    editor.vm.$emit("cleanup-asset", readyAssetId);
    await flushPromises();
    expect(fetchMock).not.toHaveBeenCalled();

    editor.vm.$emit("asset-uploaded", null, stagedAssetId);
    editor.vm.$emit("cleanup-asset", stagedAssetId);
    editor.vm.$emit("cleanup-asset", stagedAssetId);
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/admin/assets/${stagedAssetId}?mode=purge`,
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("stores the uploaded asset ID and public URL in the draft", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const wrapper = await mountDrawer();
    const editor = wrapper.getComponent(AdminJoinMethodEditor);
    const readyMethod = editor.props("methods")[0];
    expect(readyMethod).toBeDefined();
    if (!readyMethod) throw new Error("Expected an existing QR method.");

    editor.vm.$emit(
      "update:assetId",
      readyMethod.clientKey,
      "33333333-3333-4333-8333-333333333333",
      "http://localhost:5173/assets/qr_code/replacement.webp",
    );
    await flushPromises();

    const updatedMethod = wrapper.getComponent(AdminJoinMethodEditor).props("methods")[0];
    expect(updatedMethod).toBeDefined();
    if (!updatedMethod) throw new Error("Expected the QR draft method to remain.");
    expect(updatedMethod.assetId).toBe("33333333-3333-4333-8333-333333333333");
    expect(updatedMethod.assetUrl).toBe("http://localhost:5173/assets/qr_code/replacement.webp");
  });

  it("clears both asset ID and stale remote URL when the editor removes an asset", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const wrapper = await mountDrawer();
    const editor = wrapper.getComponent(AdminJoinMethodEditor);
    const readyMethod = editor.props("methods")[0];
    expect(readyMethod).toBeDefined();
    if (!readyMethod) throw new Error("Expected an existing QR method.");

    editor.vm.$emit("update:assetId", readyMethod.clientKey, "", null);
    await flushPromises();

    const updatedMethod = wrapper.getComponent(AdminJoinMethodEditor).props("methods")[0];
    expect(updatedMethod).toBeDefined();
    if (!updatedMethod) throw new Error("Expected the QR draft method to remain.");
    expect(updatedMethod.assetId).toBeNull();
    expect(updatedMethod.assetUrl).toBeNull();
  });

  it("purges tracked staged assets when an unsaved drawer closes", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        data: { id: stagedAssetId },
        requestId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = await mountDrawer();
    wrapper.getComponent(AdminJoinMethodEditor).vm.$emit("asset-uploaded", null, stagedAssetId);

    await wrapper.setProps({ open: false });
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/assets/${stagedAssetId}?mode=purge`);
  });

  it("purges the previous staged asset on replacement and keeps tracking the replacement", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        ok: true,
        data: { id: stagedAssetId },
        requestId: "33333333-3333-4333-8333-333333333333",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const wrapper = await mountDrawer();
    const editor = wrapper.getComponent(AdminJoinMethodEditor);
    editor.vm.$emit("asset-uploaded", null, stagedAssetId);
    editor.vm.$emit("asset-uploaded", stagedAssetId, replacementAssetId);
    await flushPromises();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(`/api/v1/admin/assets/${stagedAssetId}?mode=purge`);

    await wrapper.setProps({ open: false });
    await flushPromises();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      `/api/v1/admin/assets/${replacementAssetId}?mode=purge`,
    );
  });

  it("asks before dirty route navigation and resolves the selected decision", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const wrapper = await mountDrawer();
    wrapper.getComponent(AdminGroupFields).vm.$emit("update:title", "未保存的新标题");
    await flushPromises();
    expect(routeLeave.guard).not.toBeNull();
    const guard = routeLeave.guard;
    if (!guard) throw new Error("Expected a registered route leave guard.");

    const stay = Promise.resolve(guard());
    await flushPromises();
    const continueButton = wrapper.findAll("button").find((button) => button.text() === "继续编辑");
    expect(continueButton).toBeDefined();
    if (!continueButton) throw new Error("Expected the continue editing button.");
    await continueButton.trigger("click");
    await expect(stay).resolves.toBe(false);

    const leave = Promise.resolve(guard());
    await flushPromises();
    const discardButton = wrapper.findAll("button").find((button) => button.text() === "放弃");
    expect(discardButton).toBeDefined();
    if (!discardButton) throw new Error("Expected the discard button.");
    await discardButton.trigger("click");
    await expect(leave).resolves.toBe(true);
  });

  it("submits exactly once when the footer save button is clicked", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const wrapper = await mountDrawer(true);

    const saveButton = wrapper.get('button[type="submit"]').element;
    if (!(saveButton instanceof HTMLButtonElement)) throw new Error("Expected a save button.");
    expect(saveButton.form?.id).toBe("admin-group-form");
    saveButton.click();
    await flushPromises();

    expect(wrapper.emitted("save")).toHaveLength(1);
    wrapper.unmount();
  });
});
