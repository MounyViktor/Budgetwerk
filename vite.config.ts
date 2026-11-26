import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // Relative Pfade: Die App läuft so auch in einem Unterordner, z. B. bei GitHub Pages.
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      includeAssets: ["apple-touch-icon.png", "icon-192.png", "icon-512.png", "banks/*"],
      manifest: {
        name: "Budgetwerk",
        short_name: "Budgetwerk",
        description: "Budget planen, sparen und Bargeld im Blick behalten – offline auf dem iPhone",
        lang: "de",
        display: "standalone",
        orientation: "portrait",
        start_url: "./",
        scope: "./",
        background_color: "#0B1B3F",
        theme_color: "#0B1B3F",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,svg,webmanifest,woff2}"],
        globIgnores: ["**/*vietnamese*"],
        navigateFallback: "index.html",
      },
    }),
  ],
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
  },
});
