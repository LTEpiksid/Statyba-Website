// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html', // Ensures index.html is built
        admin: 'admin.html' // Ensures admin.html is built and copied
      }
    }
  }
});
