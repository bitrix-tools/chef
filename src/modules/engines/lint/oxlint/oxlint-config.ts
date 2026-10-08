import * as fs from 'node:fs';
import * as path from 'node:path';

import { FileFinder } from '../../../../utils/file-finder';

// Never linted: generated code, third-party code, CommonJS modules.
export const IGNORED_FILES = [
	'**/node_modules/**',
	'**/dist/**',
	'**/vendor/**',
	'**/*.min.js',
	'**/*.bundle.js',
	'**/*.bundle.map.js',
	'**/*.d.ts',
	'**/*.cjs',
];

const PROJECT_CONFIG_FILES = [
	'oxlint.config.ts',
	'.oxlintrc.json',
];

export function findProjectConfig(fromDir: string, rootDir: string): string | null
{
	for (const fileName of PROJECT_CONFIG_FILES)
	{
		const filePath = FileFinder.findUpFile({ fileName, fromDir, rootDir });
		if (filePath)
		{
			return filePath;
		}
	}

	return null;
}

type RuleValue = string | [string, ...unknown[]];
type Override = { files: string[]; excludeFiles?: string[]; rules?: Record<string, RuleValue> };
type OxlintConfig = {
	plugins?: string[];
	jsPlugins?: Array<string | { name: string; specifier: string }>;
	categories?: Record<string, string>;
	rules?: Record<string, RuleValue>;
	overrides?: Override[];
	settings?: Record<string, unknown>;
};

/**
 * Overrides the Bitrix source repository keeps in its ESLint configs (the root
 * eslint.config.js and the nested ones of main.core and main.baseline), written with ESLint
 * rule ids. While the repository has no oxlint config of its own, chef applies them on top
 * of the presets; the ids are translated to the preset's ones by `toPresetRuleId`.
 */
const SOURCE_REPOSITORY_OVERRIDES: Override[] = [
	{
		files: ['**/{test,tests}/**/*.{test,spec}.{js,ts}'],
		rules: {
			'init-declarations': 'off',
			'@bitrix24/bitrix24-rules/no-typeof': 'off',
			'@bitrix24/bitrix24-rules/no-pseudo-private': 'off',
			'@bitrix24/bitrix24-rules/sort-imports': 'off',
			'@bitrix24/bitrix24-rules/need-alias': 'off',
			'@bitrix24/bitrix24-rules/no-native-dom-methods': 'off',
			'@bitrix24/bitrix24-rules/no-native-events-binding': 'off',
			'@bitrix24/bitrix24-rules/no-style': 'off',
		},
	},
	{
		files: ['**/main/install/js/main/core/src/**/*.ts', '**/main/install/js/main/baseline/**/*.ts'],
		excludeFiles: ['**/*.js.ts'],
		rules: {
			'@bitrix24/bitrix24-rules/no-typeof': 'off',
			'import/no-default-export': 'off',
			'no-prototype-builtins': 'off',
			'@bitrix24/bitrix24-rules/no-native-events-binding': 'off',
			'@bitrix24/bitrix24-rules/no-classlist': 'off',
			'@bitrix24/bitrix24-rules/no-style': 'off',
			'@bitrix24/bitrix24-rules/no-native-dom-methods': 'off',
			'no-param-reassign': 'off',
			'no-console': 'off',
		},
	},
	{
		files: ['**/main/install/js/main/baseline/**/*.ts'],
		excludeFiles: ['**/*.js.ts'],
		rules: {
			'@bitrix24/bitrix24-rules/no-bx-message': 'off',
		},
	},
	{
		// The legacy layer of main.core is a transcription of src/old/core.js; see the
		// reasons in main/install/js/main/core/src/eslint.config.js.
		files: ['**/main/install/js/main/core/src/legacy/**/*.ts'],
		rules: {
			'eqeqeq': 'off',
			'radix': 'off',
			'no-restricted-globals': 'off',
			'guard-for-in': 'off',
			'unicorn/prefer-spread': 'off',
			'unicorn/prefer-code-point': 'off',
			'camelcase': 'off',
			'sonarjs/cognitive-complexity': 'off',
			'init-declarations': 'off',
			'@bitrix24/bitrix24-rules/no-bx': 'off',
			'unicorn/prefer-string-slice': 'off',
			'unicorn/prefer-string-replace-all': 'off',
			'unicorn/prefer-includes': 'off',
			'@bitrix24/bitrix24-rules/no-bx-message': 'off',
			'@bitrix24/bitrix24-rules/no-pseudo-private': 'off',
			'prefer-rest-params': 'off',
			'prefer-arrow-callback': 'off',
			'no-multi-assign': 'off',
			'no-cond-assign': 'off',
			'no-implicit-coercion': 'off',
			'no-script-url': 'off',
			'unicorn/no-negated-condition': 'off',
			'unicorn/no-lonely-if': 'off',
			'unicorn/prefer-logical-operator-over-ternary': 'off',
			'no-unneeded-ternary': 'off',
			'no-else-return': 'off',
			'no-empty': 'off',
			'max-depth': 'off',
			'max-lines-per-function': 'off',
			'unicorn/no-for-loop': 'off',
			'unicorn/prefer-optional-catch-binding': 'off',
			'prefer-template': 'off',
			'spaced-comment': 'off',
			'no-useless-escape': 'off',
			'max-len': 'off',
		},
	},
	{
		files: ['**/main/install/js/main/core/src/core.ts'],
		rules: {
			'@bitrix24/bitrix24-rules/sort-imports': 'off',
		},
	},
];

// ESLint rule id -> the id the presets configure the same rule under
const RENAMED_RULES: Record<string, string> = {
	'sonarjs/cognitive-complexity': 'complexity',
	'func-call-spacing': '@stylistic/function-call-spacing',
};

export function toPresetRuleId(eslintId: string, presetIds: Set<string>): string | null
{
	const candidates = [
		RENAMED_RULES[eslintId],
		eslintId,
		`@stylistic/${eslintId}`,
		`@bitrix24/core/${eslintId}`,
		eslintId.replace(/^(unicorn|vue)\//, '@bitrix24/$1/'),
	];

	return candidates.find((id) => id !== undefined && presetIds.has(id)) ?? null;
}

function presetRuleIds(config: OxlintConfig): Set<string>
{
	const ids = new Set(Object.keys(config.rules ?? {}));
	for (const override of config.overrides ?? [])
	{
		for (const id of Object.keys(override.rules ?? {}))
		{
			ids.add(id);
		}
	}

	return ids;
}

function translateOverrides(overrides: Override[], presetIds: Set<string>): Override[]
{
	return overrides.map((override) => ({
		...override,
		rules: Object.fromEntries(
			Object.entries(override.rules ?? {})
				.map(([id, value]) => [toPresetRuleId(id, presetIds), value] as const)
				.filter(([id]) => id !== null),
		),
	}));
}

/**
 * Builds the config chef uses when the project has none: the Bitrix24 presets (web and
 * mobile) and, for the Bitrix source repository, its overrides. Returns the path of the
 * written JSON config.
 */
export async function writePresetConfig(options: {
	rootPath: string;
	outputDir: string;
	sourceRepository: boolean;
}): Promise<string>
{
	const web: OxlintConfig = (await import('@bitrix24/oxlint-config-bitrix24')).default;
	const mobile: OxlintConfig = (await import('@bitrix24/oxlint-config-bitrix24-mobile')).default;

	const config: OxlintConfig = {
		plugins: web.plugins,
		categories: web.categories,
		jsPlugins: [...(web.jsPlugins ?? []), ...(mobile.jsPlugins ?? [])],
		rules: web.rules,
		overrides: [...(web.overrides ?? []), ...(mobile.overrides ?? [])],
	};

	if (options.sourceRepository)
	{
		config.overrides!.push(...translateOverrides(SOURCE_REPOSITORY_OVERRIDES, presetRuleIds(config)));
	}

	const aliasesFile = path.join(options.rootPath, 'webpack.aliases.js');
	if (fs.existsSync(aliasesFile))
	{
		config.settings = { bitrix24: { aliasesFile } };
	}

	const configPath = path.join(options.outputDir, 'oxlintrc.json');
	await fs.promises.writeFile(configPath, JSON.stringify(config));

	return configPath;
}
