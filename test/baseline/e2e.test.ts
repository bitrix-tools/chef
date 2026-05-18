import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';

import { runChef } from '../cli/run-chef';

function createBaselineRepo(): string
{
	const tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'chef-baseline-e2e-')));

	// Chef detects "source" repository roots by the presence of `main`, `ui`,
	// AND `crm` directories at the same level. Create empty placeholders for
	// the indicators not used by the fixture extension.
	for (const dir of ['main', 'ui', 'crm'])
	{
		fs.mkdirSync(path.join(tmp, dir), { recursive: true });
	}

	// Minimal Bitrix-style repository: one extension under ui/install/js/ui.
	const extDir = path.join(tmp, 'ui', 'install', 'js', 'ui', 'baseline-fixture');
	fs.mkdirSync(path.join(extDir, 'src'), { recursive: true });

	fs.writeFileSync(path.join(extDir, 'bundle.config.js'), [
		'module.exports = {',
		'\tinput: "./src/index.js",',
		'\toutput: "./dist/index.bundle.js",',
		'\tnamespace: "BX.Test.Baseline",',
		'\tbrowserslist: true,',
		'\tadjustConfigPhp: false,',
		'};',
		'',
	].join('\n'));

	fs.writeFileSync(path.join(extDir, 'config.php'), [
		'<?',
		'return [',
		'\t"js" => "./dist/index.bundle.js",',
		'\t"rel" => [],',
		'\t"skip_core" => true,',
		'];',
		'',
	].join('\n'));

	// Browserslist forcing targets below RegExp.escape (Chrome 136+).
	fs.writeFileSync(path.join(tmp, '.browserslistrc'), [
		'Chrome >= 109',
		'Edge >= 109',
		'Firefox >= 115',
		'Safari >= 16.4',
		'',
	].join('\n'));

	return tmp;
}

function cleanup(tmp: string): void
{
	if (fs.existsSync(tmp))
	{
		fs.rmSync(tmp, { recursive: true, force: true });
	}
}

describe('baseline / e2e', () => {
	let tmp: string;

	beforeEach(() => {
		tmp = createBaselineRepo();
	});

	afterEach(() => {
		cleanup(tmp);
	});

	const extDir = (root: string) => path.join(root, 'ui', 'install', 'js', 'ui', 'baseline-fixture');

	const writeSource = (root: string, code: string) => {
		fs.writeFileSync(path.join(extDir(root), 'src', 'index.js'), code);
	};

	describe('chef diag baseline', () => {
		it('reports RegExp.escape on legacy targets', async () => {
			writeSource(tmp, 'console.log(RegExp.escape("x"));\n');

			const result = await runChef(['diag', 'baseline', 'ui.baseline-fixture'], { cwd: tmp });

			assert.include(result.output, 'RegExp.escape', `stdout: ${result.output}`);
		});

		it('reports new WeakRef on Safari 13 targets', async () => {
			writeSource(tmp, 'const ref = new WeakRef({});\n');
			// Override targets temporarily.
			fs.writeFileSync(path.join(tmp, '.browserslistrc'), 'Safari >= 13\n');

			const result = await runChef(['diag', 'baseline', 'ui.baseline-fixture'], { cwd: tmp });

			assert.include(result.output, 'WeakRef');
		});

		it('reports CSS container-type on Chrome 100 targets', async () => {
			fs.mkdirSync(path.join(extDir(tmp), 'src'), { recursive: true });
			fs.writeFileSync(path.join(extDir(tmp), 'src', 'index.js'), 'import "./styles.css";\nconst noop = 1;\n');
			fs.writeFileSync(path.join(extDir(tmp), 'src', 'styles.css'), '.x {\n\tcontainer-type: inline-size;\n}\n');
			fs.writeFileSync(path.join(tmp, '.browserslistrc'), 'Chrome >= 100\nFirefox >= 90\nSafari >= 14\n');

			const result = await runChef(['diag', 'baseline', 'ui.baseline-fixture'], { cwd: tmp });

			assert.include(result.output, 'container-type');
		});

		it('reports nothing when code is clean for targets', async () => {
			writeSource(tmp, 'const a = 1 + 2;\nconsole.log(a);\n');

			const result = await runChef(['diag', 'baseline', 'ui.baseline-fixture'], { cwd: tmp });

			assert.notInclude(result.output, 'RegExp.escape');
			assert.include(result.output.toLowerCase(), 'no issues');
		});

		it('honours @chef-ignore', async () => {
			writeSource(tmp, [
				'// @chef-ignore',
				'console.log(RegExp.escape("x"));',
				'',
			].join('\n'));

			const result = await runChef(['diag', 'baseline', 'ui.baseline-fixture'], { cwd: tmp });

			assert.notInclude(result.output, 'RegExp.escape');
		});
	});

	describe('chef build with baseline enabled in bundle.config', () => {
		it('emits baseline warnings during build when baseline:true is set', async () => {
			// Switch bundle.config to enable baseline checking for the build.
			fs.writeFileSync(path.join(extDir(tmp), 'bundle.config.js'), [
				'module.exports = {',
				'\tinput: "./src/index.js",',
				'\toutput: "./dist/index.bundle.js",',
				'\tnamespace: "BX.Test.Baseline",',
				'\tbrowserslist: true,',
				'\tadjustConfigPhp: false,',
				'\tbaseline: true,',
				'};',
				'',
			].join('\n'));

			writeSource(tmp, 'console.log(RegExp.escape("x"));\n');

			const result = await runChef(['build', 'ui.baseline-fixture'], { cwd: tmp });

			// Build should succeed (warnings, not errors) but the message must surface.
			assert.include(result.output, 'RegExp.escape', `stdout: ${result.output}`);
		});

		it('honours @chef-ignore inside build output too', async () => {
			fs.writeFileSync(path.join(extDir(tmp), 'bundle.config.js'), [
				'module.exports = {',
				'\tinput: "./src/index.js",',
				'\toutput: "./dist/index.bundle.js",',
				'\tnamespace: "BX.Test.Baseline",',
				'\tbrowserslist: true,',
				'\tadjustConfigPhp: false,',
				'\tbaseline: true,',
				'};',
				'',
			].join('\n'));

			writeSource(tmp, [
				'// @chef-ignore',
				'console.log(RegExp.escape("x"));',
				'',
			].join('\n'));

			const result = await runChef(['build', 'ui.baseline-fixture'], { cwd: tmp });

			assert.notInclude(result.output, 'RegExp.escape');
		});
	});
});
