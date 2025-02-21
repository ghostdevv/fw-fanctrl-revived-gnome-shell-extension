import { existsSync } from 'node:fs';
import { defineConfig } from 'tsup';
import { isAbsolute, join, resolve } from 'node:path';
import { cp, rm } from 'node:fs/promises';
import { env } from 'node:process';

export default defineConfig({
	entry: ['src/extension.ts'],
	format: ['esm'],
	dts: false,
	minify: false,
	clean: true,
	async onSuccess() {
		const BUILD_PATH = join(import.meta.dirname, './dist');

		await cp(
			join(import.meta.dirname, './metadata.json'),
			join(BUILD_PATH, './metadata.json'),
		);

		await cp(
			join(import.meta.dirname, './LICENSE'),
			join(BUILD_PATH, './LICENSE'),
		);

		const HOME = env.HOME;

		if (!HOME || !isAbsolute(HOME)) {
			console.log('HOME environment variable not found, exiting early');
			return;
		}

		const DEST_PATH = join(
			HOME,
			'/.local/share/gnome-shell/extensions/fw-fan-ctrl@willow.sh',
		);

		if (existsSync(DEST_PATH)) {
			await rm(DEST_PATH, { recursive: true });
		}

		await cp(BUILD_PATH, DEST_PATH, { recursive: true });
	},
});
