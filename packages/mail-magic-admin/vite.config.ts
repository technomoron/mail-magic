import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

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
