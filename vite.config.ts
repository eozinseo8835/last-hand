/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  // Fewer test workers at once: on a laptop, too many busy workers can make vitest time out talking to them
  // ("Timeout calling onTaskUpdate") even though every test passes.
  test: { maxWorkers: 3, minWorkers: 1 },
});
