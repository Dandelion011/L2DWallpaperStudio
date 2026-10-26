import { defineConfig } from 'vite';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    outDir: 'dist/app',
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        native: resolve(root, 'native.html'),
        nativeInput: resolve(root, 'native-input.html'),
      },
    },
  },
});
