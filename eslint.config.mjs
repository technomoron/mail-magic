import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import eslintConfigPrettier from 'eslint-config-prettier/flat';
import pluginImport from 'eslint-plugin-import';
import jsoncParser from 'jsonc-eslint-parser';
const TS_FILE_GLOBS = ['**/*.{ts,tsx,mts,cts,vue}'];
const TS_PLUGIN_FILE_GLOBS = ['**/*.{ts,tsx,mts,cts,js,mjs,cjs,vue}'];
const VUE_FILE_GLOBS = ['**/*.vue'];

const { hasVueSupport, pluginVue, vueTypeScriptConfigs } = await loadVueSupport();
const scopedVueTypeScriptConfigs = hasVueSupport
	? scopeVueConfigs(vueTypeScriptConfigs).map(stripTypeScriptPlugin)
	: [];
const vueSpecificBlocks = hasVueSupport
	? [
			...scopedVueTypeScriptConfigs,
			{
				files: VUE_FILE_GLOBS,
				plugins: {
					vue: pluginVue
				},
				rules: {
					'vue/html-indent': 'off', // Let Prettier handle indentation
					'vue/max-attributes-per-line': 'off', // Let Prettier handle line breaks
					'vue/first-attribute-linebreak': 'off', // Let Prettier handle attribute positioning
					'vue/singleline-html-element-content-newline': 'off',
					'vue/html-self-closing': [
						'error',
						{
							html: {
								void: 'always',
								normal: 'always',
								component: 'always'
							}
						}
					],
					'vue/multi-word-component-names': 'off', // Disable multi-word name restriction
					'vue/attribute-hyphenation': ['error', 'always']
				}
			}
		]
	: [{ ignores: ['**/*.vue'] }];

const { hasMarkdownSupport, markdownConfigs } = await loadMarkdownSupport();
const markdownBlocks = hasMarkdownSupport ? markdownConfigs : [];

export default [
	{
		ignores: [
			'node_modules',
			'**/node_modules/**',
			'dist',
			'**/dist/**',
			'.output',
			'**/.output/**',
			'.nuxt',
			'**/.nuxt/**',
			'.nitro',
			'**/.nitro/**',
			'.netlify',
			'node_modules/.netlify',
			'coverage',
			'**/*.d.ts',
			'configure-eslint.cjs',
			'configure-eslint.js',
			'*.config.js',
			'public'
		]
	},
	{
		files: TS_PLUGIN_FILE_GLOBS,
		plugins: {
			'@typescript-eslint': tsPlugin
		}
	},
	...vueSpecificBlocks,
	...markdownBlocks,
	{
		files: ['**/*.json'],
		languageOptions: {
			parser: jsoncParser
		},
		rules: {
			quotes: ['error', 'double'] // Enforce double quotes in JSON
		}
	},
	{
		files: ['**/*.{ts,mts,tsx,js,mjs,cjs}'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2023,
				sourceType: 'module',
				extraFileExtensions: ['.vue']
			},
			globals: {
				RequestInit: 'readonly',
				process: 'readonly'
			}
		},
		plugins: {
			import: pluginImport
		},
		rules: {
			'import/order': [
				'error',
				{
					groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
					'newlines-between': 'always',
					alphabetize: { order: 'asc', caseInsensitive: true }
				}
			],
			'@typescript-eslint/no-explicit-any': ['warn'],
			'@typescript-eslint/no-unused-vars': ['warn'],
			'@typescript-eslint/no-require-imports': 'off'
		}
	},
	{
		...eslintConfigPrettier
	}
];

async function loadVueSupport() {
	try {
		const [vuePluginModule, vueConfigModule] = await Promise.all([
			import('eslint-plugin-vue'),
			import('@vue/eslint-config-typescript')
		]);

		const pluginVue = unwrapDefault(vuePluginModule);
		const { defineConfigWithVueTs, vueTsConfigs } = vueConfigModule;
		const configs = defineConfigWithVueTs(vueTsConfigs.recommended);

		return {
			hasVueSupport: Boolean(pluginVue && configs.length),
			pluginVue,
			vueTypeScriptConfigs: configs
		};
	} catch (error) {
		if (isModuleNotFoundError(error)) {
			return {
				hasVueSupport: false,
				pluginVue: null,
				vueTypeScriptConfigs: []
			};
		}

		throw error;
	}
}

async function loadMarkdownSupport() {
	try {
		const markdownModule = await import('@eslint/markdown');
		const markdownPlugin = unwrapDefault(markdownModule);
		const recommended = Array.isArray(markdownPlugin?.configs?.recommended)
			? markdownPlugin.configs.recommended
			: [];

		if (recommended.length === 0) {
			return {
				hasMarkdownSupport: false,
				markdownConfigs: []
			};
		}

		return {
			hasMarkdownSupport: true,
			markdownConfigs: [
				...recommended,
				{
					files: ['**/*.md'],
					language: 'markdown/gfm'
				}
			]
		};
	} catch (error) {
		if (isModuleNotFoundError(error)) {
			return {
				hasMarkdownSupport: false,
				markdownConfigs: []
			};
		}

		throw error;
	}
}

function scopeVueConfigs(configs) {
	return configs.map((config) => {
		const files = config.files ?? [];
		const referencesOnlyVueFiles = files.length > 0 && files.every((pattern) => pattern.includes('.vue'));
		const hasVuePlugin = Boolean(config.plugins?.vue);

		if (hasVuePlugin || referencesOnlyVueFiles) {
			return {
				...config,
				files: VUE_FILE_GLOBS
			};
		}

		return {
			...config,
			files: TS_FILE_GLOBS
		};
	});
}

function stripTypeScriptPlugin(config) {
	const { plugins = {}, ...rest } = config;

	if (!plugins['@typescript-eslint']) {
		return config;
	}

	const otherPlugins = { ...plugins };
	delete otherPlugins['@typescript-eslint'];
	const hasOtherPlugins = Object.keys(otherPlugins).length > 0;

	return {
		...rest,
		...(hasOtherPlugins ? { plugins: otherPlugins } : {})
	};
}

function unwrapDefault(module) {
	return module?.default ?? module;
}

function isModuleNotFoundError(error) {
	if (!error) {
		return false;
	}

	if (error.code === 'ERR_MODULE_NOT_FOUND' || error.code === 'MODULE_NOT_FOUND') {
		return true;
	}

	return typeof error.message === 'string' && error.message.includes('Cannot find module');
}
