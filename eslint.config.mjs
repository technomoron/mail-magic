import pluginVue from 'eslint-plugin-vue';
import pluginPrettier from 'eslint-plugin-prettier';
import pluginImport from 'eslint-plugin-import';
import tsParser from '@typescript-eslint/parser';
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript';

export default [
	{
		ignores: [
			'node_modules',
			'dist',
			'.output',
			'.nuxt',
			'coverage',
			'**/*.d.ts',
			'configure-eslint.js',
			'*.config.js',
			'*.config.ts',
			'public'
		]
	},
	...defineConfigWithVueTs(vueTsConfigs.recommended),
	{
		files: ['**/*.vue'],
		plugins: {
			vue: pluginVue,
			prettier: pluginPrettier
		},
		rules: {
			'prettier/prettier': 'error', // Enforce Prettier rules
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
	},
	{
		files: ['*.json'],
		plugins: {
			prettier: pluginPrettier
		},
		rules: {
			quotes: ['error', 'double'], // Enforce double quotes in JSON
			'prettier/prettier': 'error'
		}
	},
	{
		files: ['**/*.{ts,mts,tsx,js}'],
		languageOptions: {
			parser: tsParser,
			parserOptions: {
				ecmaVersion: 2023,
				sourceType: 'module',
				extraFileExtensions: ['.vue']
			},
			globals: {
				RequestInit: 'readonly',
				process: 'readonly',
				Capacitor: 'readonly',
				chrome: 'readonly'
			}
		},
		plugins: {
			prettier: pluginPrettier,
			import: pluginImport
		},
		rules: {
			indent: ['error', 'tab', { SwitchCase: 1 }], // Use tabs for JS/TS
			quotes: ['warn', 'single', { avoidEscape: true }], // Prefer single quotes
			semi: ['error', 'always'], // Enforce semicolons
			'comma-dangle': 'off', // Disable trailing commas
			'prettier/prettier': 'error', // Enforce Prettier rules
			'import/order': [
				'error',
				{
					groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
					'newlines-between': 'always',
					alphabetize: { order: 'asc', caseInsensitive: true }
				}
			],
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unused-vars': 'off'
		}
	}
];
