import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import siteConfig from "../site.config";
import App from "./app/App.vue";
import { routes } from "./app/router";
import "./features/theme/bootstrap";
import "./styles/index.css";

document.title = siteConfig.title;

const faviconType = siteConfig.faviconUrl.endsWith(".svg")
  ? "image/svg+xml"
  : siteConfig.faviconUrl.endsWith(".png")
    ? "image/png"
    : "image/jpeg";
const faviconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
if (faviconLink) {
  faviconLink.href = siteConfig.faviconUrl;
  faviconLink.type = faviconType;
}

const app = createApp(App);
const router = createRouter({ history: createWebHistory(), routes });

app.use(router).mount("#app");
