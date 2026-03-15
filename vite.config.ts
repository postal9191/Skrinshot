import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react({
      exclude: ['**/capture.html', '**/editor.html', '**/recording.html'],
    }),
  ],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'src/renderer/index.html'),
        editor: path.resolve(__dirname, 'src/renderer/editor.html'),
        capture: path.resolve(__dirname, 'src/renderer/capture.html'),
        recording: path.resolve(__dirname, 'src/renderer/recording.html'),
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/renderer'),
    },
  },
  server: {
    port: 3000,
  },
});
