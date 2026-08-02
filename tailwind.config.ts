import type { Config } from "tailwindcss";
import forms from "@tailwindcss/forms";

export default {
  content: ["./index.html", "./src/**/*.{vue,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: "var(--color-primary)",
          accent: "var(--color-accent)",
        },
        page: "var(--background)",
        surface: "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-muted": "var(--surface-muted)",
        primary: "var(--text-primary)",
        secondary: "var(--text-secondary)",
        muted: "var(--text-muted)",
        link: "var(--text-link)",
        border: {
          DEFAULT: "var(--border-default)",
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        semantic: {
          success: "var(--success)",
          warning: "var(--warning)",
          danger: "var(--danger)",
          info: "var(--info)",
        },
      },
    },
  },
  plugins: [forms],
} satisfies Config;
