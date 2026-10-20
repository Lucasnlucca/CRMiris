import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { crmApiBridgePlugin } from './server/vitePluginApiBridge';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), crmApiBridgePlugin()],
  server: {
    host: true,
    allowedHosts: true,
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
