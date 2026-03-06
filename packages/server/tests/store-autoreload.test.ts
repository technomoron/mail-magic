import fs from 'fs';

import { watch as chokidarWatch } from 'chokidar';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { enableInitDataAutoReload } from '../src/store/store.js';

// Mock chokidar so tests don't touch the real filesystem.
const mockChokidarOn = vi.fn().mockReturnThis();
const mockChokidarClose = vi.fn().mockResolvedValue(undefined);
const mockChokidarWatcher = { on: mockChokidarOn, close: mockChokidarClose };
vi.mock('chokidar', () => ({
	watch: vi.fn(() => mockChokidarWatcher)
}));

describe('enableInitDataAutoReload', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

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

		// reload is debounced
		expect(reloadSpy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(300);
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

		// reload is debounced
		expect(reloadSpy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(300);
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

	test('watches *.njk files with chokidar when reloadForce is provided', () => {
		vi.spyOn(fs, 'watch').mockImplementation((() => ({
			close: vi.fn()
		})) as unknown as typeof fs.watch);

		const reloadSpy = vi.fn();
		const reloadForceSpy = vi.fn();
		const debugSpy = vi.fn();

		const handle = enableInitDataAutoReload(
			{
				vars: { DB_AUTO_RELOAD: true },
				config_filename: (name) => `/tmp/config/${name}`,
				print_debug: debugSpy
			},
			reloadSpy,
			reloadForceSpy
		);

		expect(handle).toBeTruthy();
		expect(chokidarWatch).toHaveBeenCalledWith(
			expect.stringContaining('*.njk'),
			expect.objectContaining({ persistent: false, ignoreInitial: true })
		);
		expect(mockChokidarOn).toHaveBeenCalledWith('add', expect.any(Function));
		expect(mockChokidarOn).toHaveBeenCalledWith('change', expect.any(Function));
		expect(debugSpy).toHaveBeenCalledWith(expect.stringContaining('template files'));

		// Simulate a .njk file change via the registered 'change' handler.
		const changeHandler = mockChokidarOn.mock.calls.find(([event]) => event === 'change')?.[1] as () => void;
		expect(changeHandler).toBeDefined();
		changeHandler();

		expect(reloadForceSpy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(300);
		expect(reloadForceSpy).toHaveBeenCalledTimes(1);
		expect(reloadSpy).not.toHaveBeenCalled();

		handle?.close();
		expect(mockChokidarClose).toHaveBeenCalledTimes(1);

		vi.mocked(fs.watch).mockRestore();
	});

	test('does not start chokidar watcher when reloadForce is not provided', () => {
		vi.spyOn(fs, 'watch').mockImplementation((() => ({
			close: vi.fn()
		})) as unknown as typeof fs.watch);

		enableInitDataAutoReload(
			{
				vars: { DB_AUTO_RELOAD: true },
				config_filename: (name) => `/tmp/config/${name}`,
				print_debug: vi.fn()
			},
			vi.fn()
			// no reloadForce
		);

		expect(chokidarWatch).not.toHaveBeenCalled();

		vi.mocked(fs.watch).mockRestore();
	});
});
