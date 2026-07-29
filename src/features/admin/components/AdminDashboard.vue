<script setup lang="ts">
import { onMounted } from "vue";
import { useDashboard } from "../composables/useDashboard";
import HealthPanel from "./HealthPanel.vue";
import BusinessPanel from "./BusinessPanel.vue";
import AnalyticsPanel from "./AnalyticsPanel.vue";

const { health, dashboard, analytics, loading, fetchHealth, fetchDashboard, fetchAnalytics } =
  useDashboard();

onMounted(() => {
  void fetchHealth();
  void fetchDashboard();
  void fetchAnalytics("7d");
});
</script>

<template>
  <div class="space-y-6">
    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <HealthPanel :health="health" :loading="loading.health" />
      <BusinessPanel :dashboard="dashboard" :loading="loading.dashboard" />
    </div>
    <AnalyticsPanel
      :analytics="analytics"
      :loading="loading.analytics"
      @range-change="(r: string) => fetchAnalytics(r)"
    />
  </div>
</template>
