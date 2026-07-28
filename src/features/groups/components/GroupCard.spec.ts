import { describe, it, expect } from "vitest";
import { mount } from "@vue/test-utils";
import GroupCard from "./GroupCard.vue";
import type { PublicGroupDto } from "@shared/contracts/group";

const baseGroup: PublicGroupDto = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  title: "测试群聊",
  description: "这是一个测试群",
  kind: "official",
  platform: "qq",
  tags: ["游戏", "编程"],
  status: "published",
  logoUrl: null,
  logoMeta: null,
  joinMethods: [{ type: "group_number" as const, value: "123456" }],
  likeCount: 42,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("GroupCard", () => {
  it("renders group title", () => {
    const wrapper = mount(GroupCard, { props: { group: baseGroup, liked: false } });
    expect(wrapper.text()).toContain("测试群聊");
  });

  it("renders platform name", () => {
    const wrapper = mount(GroupCard, { props: { group: baseGroup, liked: false } });
    expect(wrapper.text()).toContain("qq");
  });

  it("shows '官方群' badge for official kind", () => {
    const wrapper = mount(GroupCard, {
      props: { group: { ...baseGroup, kind: "official" }, liked: false },
    });
    expect(wrapper.text()).toContain("官方群");
  });

  it("shows '同好群' badge for interest kind", () => {
    const wrapper = mount(GroupCard, {
      props: { group: { ...baseGroup, kind: "interest" }, liked: false },
    });
    expect(wrapper.text()).toContain("同好群");
  });

  it("shows '已下架' badge when status is delisted", () => {
    const wrapper = mount(GroupCard, {
      props: { group: { ...baseGroup, status: "delisted" }, liked: false },
    });
    expect(wrapper.text()).toContain("已下架");
  });

  it("renders tags", () => {
    const wrapper = mount(GroupCard, { props: { group: baseGroup, liked: false } });
    expect(wrapper.text()).toContain("游戏");
    expect(wrapper.text()).toContain("编程");
  });

  it("renders like count", () => {
    const wrapper = mount(GroupCard, { props: { group: baseGroup, liked: false } });
    expect(wrapper.text()).toContain("42");
  });

  it("shows filled heart when liked", () => {
    const wrapper = mount(GroupCard, { props: { group: baseGroup, liked: true } });
    expect(wrapper.text()).toContain("❤️");
  });

  it("shows empty heart when not liked", () => {
    const wrapper = mount(GroupCard, { props: { group: baseGroup, liked: false } });
    expect(wrapper.text()).toContain("🤍");
  });

  it("emits toggleLike when heart clicked", async () => {
    const wrapper = mount(GroupCard, { props: { group: baseGroup, liked: false } });
    const btn = wrapper.find("button[aria-label='点赞']");
    await btn.trigger("click");
    expect(wrapper.emitted("toggleLike")).toBeTruthy();
    expect(wrapper.emitted("toggleLike")?.[0]).toEqual([baseGroup.id]);
  });

  it("renders copy button for group_number join method", () => {
    const wrapper = mount(GroupCard, { props: { group: baseGroup, liked: false } });
    expect(wrapper.text()).toContain("复制群号");
  });

  it("emits copyNumber when copy button clicked", async () => {
    const wrapper = mount(GroupCard, { props: { group: baseGroup, liked: false } });
    const btn = wrapper.findAll("button").find((b) => b.text().includes("复制群号"));
    await btn?.trigger("click");
    expect(wrapper.emitted("copyNumber")).toBeTruthy();
  });

  it("renders placeholder image when no logo", () => {
    const wrapper = mount(GroupCard, {
      props: { group: { ...baseGroup, logoUrl: null }, liked: false },
    });
    expect(wrapper.text()).toContain("无图");
  });

  it("does not show delisted badge when published", () => {
    const wrapper = mount(GroupCard, {
      props: { group: { ...baseGroup, status: "published" }, liked: false },
    });
    expect(wrapper.text()).not.toContain("已下架");
  });
});
