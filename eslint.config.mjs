import skipFormatting from '@vue/eslint-config-prettier/skip-formatting';
import vueTsEslintConfig from '@vue/eslint-config-typescript';
// import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import pluginVue from 'eslint-plugin-vue';

export default [
	{
		name: 'app/files-to-lint',
		files: ['**/*.{ts,mts,tsx,vue}']
	},
	{
		name: 'app/files-to-ignore',
		ignores: ['**/dist/**', '**/dist-ssr/**', '**/coverage/**']
	},
	{
		plugins: {
			vue: pluginVue,
			import: importPlugin
		}
	},
	...pluginVue.configs['flat/essential'],
	...vueTsEslintConfig(),
	{
		rules: {
			'import/order': [
				'error',
				{
					groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'object', 'type'],
					'newlines-between': 'always',
					alphabetize: { order: 'asc', caseInsensitive: true }
				}
			],
			'import/default': 'error',
			'import/export': 'error',
			'import/extensions': 'off',
			'import/first': 'error',
			'import/named': 'off',
			'import/namespace': 'error',
			'import/exports-last': 'off',
			'import/no-cycle': 'warn',
			'import/no-useless-path-segments': 'error',
			'import/no-extraneous-dependencies': 'off',
			'import/no-self-import': 'error',
			'import/no-absolute-path': 'error',
			'import/no-named-as-default': 'error',
			'import/no-duplicates': 'error',
			'import/no-namespace': 'error',
			'import/no-deprecated': 'error',
			'import/no-internal-modules': 'off',
			'import/no-unresolved': 'off',
			'no-unused-vars': 'warn',
			'prefer-promise-reject-errors': 'off',
			camelcase: 'off',
			'new-cap': 'off',
			'generator-star-spacing': 'off',
			'no-tabs': 'off',
			'arrow-parens': 'off',
			'one-var': 'off',
			'no-void': 'off',
			semi: ['error', 'always'],
			'comma-dangle': ['error', 'never'],
			'multiline-ternary': 'off',
			'@typescript-eslint/no-unused-vars': 'warn',
			'@typescript-eslint/no-use-before-define': [
				'error',
				{
					classes: false,
					functions: true,
					variables: true
				}
			],
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-require-imports': 'off',
			'@typescript-eslint/no-empty-object-type': 'off',
			'@typescript-eslint/no-var-requires': 'off',
			'vue/multi-word-component-names': 'off'
		}
	},
	// skipFormatting,
	// importPlugin,
	{
		ignores: [
			'configure-eslint.js',
			'dist',
			'node_modules',
			'*.config.js',
			'*.config.ts',
			'package-lock.json',
			'pnpm-lock.yaml',
			'yarn.lock',
			'.vscode',
			'.data',
			'.nuxt',
			'.netlify',
			'.output',
			'.nitro',
			'public',
			'**/*.d.ts'
		]
	}
];
