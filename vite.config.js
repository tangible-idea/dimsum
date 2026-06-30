import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,        // 0.0.0.0 바인딩 → 같은 WiFi망의 다른 기기/서버에서 접속 가능
    port: 5173,
    strictPort: false, // 포트가 점유돼 있으면 자동으로 다음 포트 사용
    allowedHosts: true, // LAN IP/커스텀 호스트명/터널(ngrok 등) 어떤 Host 헤더든 허용
  },
  preview: {
    host: true,
    port: 4173,
    allowedHosts: true,
  },
});
