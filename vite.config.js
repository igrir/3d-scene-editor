import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  server: {
    allowedHosts: true,
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/lib.js'),
      name: 'PrimitiveBuilder',
      formats: ['umd', 'es'],
      fileName: (format) => `3d-primitive-builder.${format}.js`,
    },
    rollupOptions: {
      // Keep Three.js external for CDN use
      external: [],
      output: {
        globals: {},
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return '3d-primitive-builder.css';
          return assetInfo.name;
        },
      },
    },
    cssCodeSplit: false,
    outDir: 'dist',
  },
});
