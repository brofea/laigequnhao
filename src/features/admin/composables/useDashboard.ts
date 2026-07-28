import { ref } from "vue";
import { api } from "@/shared/api/client";
import { z } from "zod";

const healthSchema = z.object({
  api: z.string(),
  d1: z.string(),
  r2: z.string(),
  version: z.string(),
  deployedAt: z.string(),
});

const dashboardSchema = z.object({
  statusCounts: z.object({
    pending: z.number(),
    published: z.number(),
    rejected: z.number(),
    delisted: z.number(),
  }),
  totalLikes: z.number(),
  recentSubmissions: z.number(),
  topLiked: z.array(z.object({ id: z.string(), title: z.string(), likeCount: z.number() })),
});

const analyticsSchema = z.object({
  range: z.string(),
  data: z.unknown(),
});

export function useDashboard() {
  const health = ref<z.infer<typeof healthSchema> | null>(null);
  const dashboard = ref<z.infer<typeof dashboardSchema> | null>(null);
  const analytics = ref<{ range: string; data: unknown } | null>(null);
  const loading = ref({ health: false, dashboard: false, analytics: false });

  async function fetchHealth() {
    loading.value.health = true;
    try {
      const result = await api.get("/admin/health", healthSchema);
      if (result.ok) health.value = result.data;
    } catch {
      /* ignore */
    }
    loading.value.health = false;
  }

  async function fetchDashboard() {
    loading.value.dashboard = true;
    try {
      const result = await api.get("/admin/dashboard", dashboardSchema);
      if (result.ok) dashboard.value = result.data;
    } catch {
      /* ignore */
    }
    loading.value.dashboard = false;
  }

  async function fetchAnalytics(range = "7d") {
    loading.value.analytics = true;
    try {
      const result = await api.get(`/admin/analytics?range=${range}`, analyticsSchema);
      if (result.ok) {
        analytics.value = result.data as { range: string; data: unknown };
      }
    } catch {
      /* ignore */
    }
    loading.value.analytics = false;
  }

  return { health, dashboard, analytics, loading, fetchHealth, fetchDashboard, fetchAnalytics };
}
