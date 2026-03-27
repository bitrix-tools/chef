import { describe, it, beforeEach, afterEach } from 'mocha';
import { assert } from 'chai';
import * as sinon from 'sinon';

import { findCircularDependencies } from '../../src/utils/package/find-circular-dependencies';
import { PackageResolver } from '../../src/modules/packages/package-resolver';

import type { BasePackage } from '../../src/modules/packages/base-package';

type Dependency = { name: string };

function createMockPackage(name: string, dependencies: string[]): BasePackage
{
	return {
		getName: () => name,
		getDependencies: async () => dependencies.map((d) => ({ name: d })) as Dependency[],
	} as unknown as BasePackage;
}

describe('findCircularDependencies', () => {
	let sandbox: sinon.SinonSandbox;
	let resolveStub: sinon.SinonStub;

	beforeEach(() => {
		sandbox = sinon.createSandbox();
		resolveStub = sandbox.stub(PackageResolver, 'resolve');
	});

	afterEach(() => {
		sandbox.restore();
	});

	it('should return empty array when no dependencies', async () => {
		const target = createMockPackage('ext.a', []);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, []);
	});

	it('should detect self-dependency', async () => {
		const target = createMockPackage('ext.a', ['ext.a']);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, [['ext.a', 'ext.a']]);
	});

	it('should detect direct mutual dependency A → B → A', async () => {
		const target = createMockPackage('ext.a', ['ext.b']);
		const depB = createMockPackage('ext.b', ['ext.a']);
		resolveStub.withArgs('ext.b').returns(depB);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, [['ext.a', 'ext.b', 'ext.a']]);
	});

	it('should not report indirect cycle A → B → C → A', async () => {
		const target = createMockPackage('ext.a', ['ext.b']);
		const depB = createMockPackage('ext.b', ['ext.c']);
		resolveStub.withArgs('ext.b').returns(depB);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, []);
	});

	it('should detect multiple cycles', async () => {
		const target = createMockPackage('ext.a', ['ext.b', 'ext.c']);
		const depB = createMockPackage('ext.b', ['ext.a']);
		const depC = createMockPackage('ext.c', ['ext.a']);
		resolveStub.withArgs('ext.b').returns(depB);
		resolveStub.withArgs('ext.c').returns(depC);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, [
			['ext.a', 'ext.b', 'ext.a'],
			['ext.a', 'ext.c', 'ext.a'],
		]);
	});

	it('should detect self-dependency and mutual dependency together', async () => {
		const target = createMockPackage('ext.a', ['ext.a', 'ext.b']);
		const depB = createMockPackage('ext.b', ['ext.a']);
		resolveStub.withArgs('ext.b').returns(depB);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, [
			['ext.a', 'ext.a'],
			['ext.a', 'ext.b', 'ext.a'],
		]);
	});

	it('should skip unresolvable dependencies', async () => {
		const target = createMockPackage('ext.a', ['ext.unknown']);
		resolveStub.withArgs('ext.unknown').returns(null);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, []);
	});

	it('should not report cycle when dependency does not depend back', async () => {
		const target = createMockPackage('ext.a', ['ext.b']);
		const depB = createMockPackage('ext.b', ['ext.c', 'ext.d']);
		resolveStub.withArgs('ext.b').returns(depB);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, []);
	});

	it('should handle dependency with many deps where only one points back', async () => {
		const target = createMockPackage('ext.a', ['ext.b']);
		const depB = createMockPackage('ext.b', ['ext.c', 'ext.d', 'ext.a', 'ext.e']);
		resolveStub.withArgs('ext.b').returns(depB);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, [['ext.a', 'ext.b', 'ext.a']]);
	});

	it('should handle multiple dependencies where only some have mutual cycles', async () => {
		const target = createMockPackage('ext.a', ['ext.b', 'ext.c', 'ext.d']);
		const depB = createMockPackage('ext.b', ['ext.x']);
		const depC = createMockPackage('ext.c', ['ext.a']);
		const depD = createMockPackage('ext.d', ['ext.y']);
		resolveStub.withArgs('ext.b').returns(depB);
		resolveStub.withArgs('ext.c').returns(depC);
		resolveStub.withArgs('ext.d').returns(depD);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, [['ext.a', 'ext.c', 'ext.a']]);
	});

	it('should handle mixed resolvable and unresolvable dependencies', async () => {
		const target = createMockPackage('ext.a', ['ext.unknown', 'ext.b']);
		const depB = createMockPackage('ext.b', ['ext.a']);
		resolveStub.withArgs('ext.unknown').returns(null);
		resolveStub.withArgs('ext.b').returns(depB);

		const cycles = await findCircularDependencies({ target });

		assert.deepEqual(cycles, [['ext.a', 'ext.b', 'ext.a']]);
	});
});
