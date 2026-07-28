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
      },
    },
  },
  plugins: [forms],
} satisfies Config;
