import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative base: the same build works at a domain root or in a subfolder (e.g. Hostinger public_html/health).
  base: './',
  plugins: [react()],
  server: { port: 5173 },
  test: { environment: 'node', include: ['tests/**/*.test.js'] },
});
