import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
	plugins: [vue()],
	base: './',
	build: {
		outDir: 'dist',
		assetsDir: 'assets',
		rollupOptions: {
			output: {
				entryFileNames: 'assets/admin.js',
				chunkFileNames: 'assets/chunk-[hash].js',
				assetFileNames: 'assets/admin.[ext]'
			}
		}
	}
});
