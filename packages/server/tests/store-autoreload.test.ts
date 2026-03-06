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

const ctx = (overrides: { DB_AUTO_RELOAD?: boolean; DB_RELOAD_DEBOUNCE_MS?: number } = {}) => ({
	vars: { DB_AUTO_RELOAD: true, DB_RELOAD_DEBOUNCE_MS: 300, ...overrides },
	config_filename: (name: string) => `/tmp/config/${name}`,
	print_debug: vi.fn()
});

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
		const reloadSpy = vi.fn();

		const handle = enableInitDataAutoReload(ctx(), reloadSpy);

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
		const c = ctx();
		const reloadSpy = vi.fn();

		const handle = enableInitDataAutoReload(c, reloadSpy);

		expect(handle).toBeTruthy();
		expect(watchSpy).toHaveBeenCalledTimes(1);
		expect(watchFileSpy).toHaveBeenCalledTimes(1);

		// reload is debounced
		expect(reloadSpy).not.toHaveBeenCalled();
		vi.advanceTimersByTime(300);
		expect(reloadSpy).toHaveBeenCalledTimes(1);
		expect(c.print_debug).toHaveBeenCalledWith(expect.stringContaining('falling back to fs.watchFile'));

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

		const handle = enableInitDataAutoReload(ctx({ DB_AUTO_RELOAD: false }), reloadSpy);

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
		const c = ctx();

		const handle = enableInitDataAutoReload(c, reloadSpy, reloadForceSpy);

		expect(handle).toBeTruthy();
		expect(chokidarWatch).toHaveBeenCalledWith(
			expect.stringContaining('*.njk'),
			expect.objectContaining({ persistent: false, ignoreInitial: true })
		);
		expect(mockChokidarOn).toHaveBeenCalledWith('add', expect.any(Function));
		expect(mockChokidarOn).toHaveBeenCalledWith('change', expect.any(Function));
		expect(c.print_debug).toHaveBeenCalledWith(expect.stringContaining('template files'));

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

		enableInitDataAutoReload(ctx(), vi.fn());

		expect(chokidarWatch).not.toHaveBeenCalled();

		vi.mocked(fs.watch).mockRestore();
	});

	test('respects DB_RELOAD_DEBOUNCE_MS from context', () => {
		vi.spyOn(fs, 'watch').mockImplementation(((
			_path: fs.PathLike,
			_options: unknown,
			listener: fs.WatchListener<string>
		) => {
			listener('change', 'init-data.json');
			return { close: vi.fn() } as unknown as fs.FSWatcher;
		}) as typeof fs.watch);

		const reloadSpy = vi.fn();
		enableInitDataAutoReload(ctx({ DB_RELOAD_DEBOUNCE_MS: 1000 }), reloadSpy);

		vi.advanceTimersByTime(300);
		expect(reloadSpy).not.toHaveBeenCalled(); // not yet

		vi.advanceTimersByTime(700);
		expect(reloadSpy).toHaveBeenCalledTimes(1); // fires at 1000ms

		vi.mocked(fs.watch).mockRestore();
	});
});
