import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    esbuildOptions: {
      resolveExtensions: [
        ".web.tsx",
        ".web.ts",
        ".web.jsx",
        ".web.js",
        ".tsx",
        ".ts",
        ".jsx",
        ".js",
        ".json",
      ],
    },
  },
  resolve: {
    extensions: [
      ".web.ts",
      ".web.tsx",
      ".web.js",
      ".web.jsx",
      ".ts",
      ".tsx",
      ".mjs",
      ".js",
      ".jsx",
      ".json",
    ],
    alias: { "react-native": "react-native-web" },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== "production"),
    "process.env.EXPO_PUBLIC_WECAPP_API_URL": JSON.stringify(""),
    "process.env.EXPO_PUBLIC_WECAPP_ENV": JSON.stringify(
      process.env.NODE_ENV || "development",
    ),
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: { "/api": "http://localhost:5174" },
  },
});
