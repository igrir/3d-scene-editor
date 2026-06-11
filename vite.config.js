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
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name.endsWith('.css')) return '3d-primitive-builder.css';
          return assetInfo.name;
        },
      },
    },
    cssCodeSplit: false,
    outDir: 'dist',
  },
});
