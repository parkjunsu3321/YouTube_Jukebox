import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 개발 중에는 백엔드(8000)로 API/WebSocket 을 프록시한다.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
      "/ws": {
        target: "ws://localhost:8000",
        ws: true,
      },
    },
  },
});
