import fs from 'fs';

import { describe, expect, test, vi } from 'vitest';

import { enableInitDataAutoReload } from '../src/store/store.js';

describe('enableInitDataAutoReload', () => {
	test('uses fs.watch when available', () => {
		const closeSpy = vi.fn();
		const watchSpy = vi.spyOn(fs, 'watch').mockImplementation(((
			_path: fs.PathLike,
			_options: unknown,
			listener: fs.WatchListener<string>
		) => {
			listener('change', 'init-data.json');
			return { close: closeSpy } as unknown as fs.FSWatcher;
		}) as typeof fs.watch);
		const watchFileSpy = vi.spyOn(fs, 'watchFile');
		const debugSpy = vi.fn();
		const reloadSpy = vi.fn();

		const handle = enableInitDataAutoReload(
			{
				vars: { DB_AUTO_RELOAD: true },
				config_filename: (name) => `/tmp/${name}`,
				print_debug: debugSpy
			},
			reloadSpy
		);

		expect(handle).toBeTruthy();
		expect(watchSpy).toHaveBeenCalledTimes(1);
		expect(watchFileSpy).not.toHaveBeenCalled();
		expect(reloadSpy).toHaveBeenCalledTimes(1);

		handle?.close();
		expect(closeSpy).toHaveBeenCalledTimes(1);

		watchSpy.mockRestore();
		watchFileSpy.mockRestore();
	});

	test('falls back to fs.watchFile when fs.watch throws', () => {
		const watchSpy = vi.spyOn(fs, 'watch').mockImplementation((() => {
			throw new Error('watch unsupported');
		}) as typeof fs.watch);
		const watchFileSpy = vi.spyOn(fs, 'watchFile').mockImplementation(((
			_path: fs.PathLike,
			_options: unknown,
			listener: fs.StatWatcherListener
		) => {
			const stats = { mtimeMs: 1 } as fs.Stats;
			listener(stats, stats);
		}) as typeof fs.watchFile);
		const unwatchSpy = vi.spyOn(fs, 'unwatchFile').mockImplementation((() => undefined) as typeof fs.unwatchFile);
		const debugSpy = vi.fn();
		const reloadSpy = vi.fn();

		const handle = enableInitDataAutoReload(
			{
				vars: { DB_AUTO_RELOAD: true },
				config_filename: (name) => `/tmp/${name}`,
				print_debug: debugSpy
			},
			reloadSpy
		);

		expect(handle).toBeTruthy();
		expect(watchSpy).toHaveBeenCalledTimes(1);
		expect(watchFileSpy).toHaveBeenCalledTimes(1);
		expect(reloadSpy).toHaveBeenCalledTimes(1);
		expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('falling back to fs.watchFile'));

		handle?.close();
		expect(unwatchSpy).toHaveBeenCalledTimes(1);

		watchSpy.mockRestore();
		watchFileSpy.mockRestore();
		unwatchSpy.mockRestore();
	});

	test('does nothing when DB_AUTO_RELOAD is disabled', () => {
		const watchSpy = vi.spyOn(fs, 'watch');
		const watchFileSpy = vi.spyOn(fs, 'watchFile');
		const reloadSpy = vi.fn();

		const handle = enableInitDataAutoReload(
			{
				vars: { DB_AUTO_RELOAD: false },
				config_filename: (name) => `/tmp/${name}`,
				print_debug: vi.fn()
			},
			reloadSpy
		);

		expect(handle).toBeNull();
		expect(watchSpy).not.toHaveBeenCalled();
		expect(watchFileSpy).not.toHaveBeenCalled();
		expect(reloadSpy).not.toHaveBeenCalled();

		watchSpy.mockRestore();
		watchFileSpy.mockRestore();
	});
});
