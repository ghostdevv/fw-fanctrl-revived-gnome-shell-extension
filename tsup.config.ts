import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/extension.ts'],
	format: ['esm'],
	dts: false,
	minify: false,
	clean: true,
});
