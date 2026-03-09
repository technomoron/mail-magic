export default defineNuxtConfig({
	compatibilityDate: '2024-11-01',

	future: {
		compatibilityVersion: 4,
	},

	modules: ['@nuxt/content'],

	css: ['~/assets/css/main.css'],


	typescript: {
		strict: true,
		// typeCheck runs via `pnpm lint` (nuxt typecheck) — not during build,
		// as Nuxt's generated VLS types conflict with each other in that mode.
		typeCheck: false,
	},

	app: {
		head: {
			title: 'Mail Magic — Self-Hosted Email Operations',
			htmlAttrs: { lang: 'en' },
			meta: [
				{ charset: 'utf-8' },
				{ name: 'viewport', content: 'width=device-width, initial-scale=1' },
				{
					name: 'description',
					content:
						'Self-hosted transactional email and form handling. Manage templates, send personalized messages, and handle public form submissions — from your own infrastructure.',
				},
			],
			link: [
				{ rel: 'preconnect', href: 'https://fonts.googleapis.com' },
				{ rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
				{
					rel: 'stylesheet',
					href: 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..900&family=Instrument+Sans:ital,wght@0,400;0,500;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap',
				},
			],
		},
	},
})
