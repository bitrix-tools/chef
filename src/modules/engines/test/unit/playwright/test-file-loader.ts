export type TestFileLoadError = {
	// Absolute path of the test file, or null for an error that escaped the loader
	// (a shared module that throws on load stops the rest of the bundle).
	file: string | null;
	message: string;
	stack?: string;
};

// Global the test bundle hands every test file's top-level code to (see isolateTestFilesPlugin).
export const TEST_FILE_LOADER = '__chefTestFiles.load';

/**
 * Page script that runs each test file in isolation: an error thrown while a file loads
 * is collected against that file, and the files after it still register their tests.
 * `__chefTestFiles.finish()` returns the collected errors.
 *
 * Kept as source text: a function passed to page.evaluate is serialized after tsx has
 * wrapped its named inner functions in a `__name(...)` helper the browser doesn't have.
 * Must run after mocha.setup(), which defines the describe globals it wraps. The
 * sourceURL keeps its stack frames apart from the bundle's anonymous ones, which are
 * mapped through the bundle's source map.
 */
export const TEST_FILE_LOADER_SCRIPT = `(() => {
	const errors = [];
	let currentFile = null;

	const report = (file, error) => {
		errors.push({
			file,
			message: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
	};

	const onError = (event) => report(null, event.error ?? event.message);

	// A throw inside a describe callback skips Mocha's own cleanup of its suite stack, so
	// every describe after it would nest into the broken suite. Catching it inside the
	// callback lets Mocha unwind as usual, and the rest of the file still loads.
	const guard = (callback) => {
		if (typeof callback !== 'function')
		{
			return callback;
		}

		return function () {
			try
			{
				return callback.call(this);
			}
			catch (error)
			{
				report(currentFile, error);
			}
		};
	};

	for (const name of ['describe', 'context', 'xdescribe', 'xcontext'])
	{
		const original = globalThis[name];
		if (typeof original !== 'function')
		{
			continue;
		}

		const guarded = (title, callback) => original(title, guard(callback));
		for (const variant of ['only', 'skip'])
		{
			if (typeof original[variant] === 'function')
			{
				guarded[variant] = (title, callback) => original[variant](title, guard(callback));
			}
		}

		globalThis[name] = guarded;
	}

	window.addEventListener('error', onError);

	globalThis.__chefTestFiles = {
		load(file, body)
		{
			currentFile = file;
			try
			{
				body();
			}
			catch (error)
			{
				report(file, error);
			}
			finally
			{
				currentFile = null;
			}
		},
		finish()
		{
			window.removeEventListener('error', onError);

			return errors;
		},
	};
})();
//# sourceURL=chef-test-file-loader.js`;
