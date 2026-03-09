<script setup lang="ts">
definePageMeta({ layout: 'docs' })

const route = useRoute()

const path = computed(() => {
	const slug = route.params.slug
	if (Array.isArray(slug) && slug.length > 0) {
		return `/docs/${slug.join('/')}`
	}
	return '/docs'
})

const { data: page } = await useAsyncData(`content-${path.value}`, () =>
	queryContent(path.value).findOne(),
)

if (!page.value) {
	throw createError({ statusCode: 404, statusMessage: 'Page not found' })
}

useSeoMeta({
	title: () => (page.value?.title ? `${page.value.title} — Mail Magic Docs` : 'Mail Magic Docs'),
	description: () => page.value?.description ?? '',
})

const tocState = useState<unknown>('docsToc', () => null)
tocState.value = page.value?.body?.toc ?? null

const { data: surround } = await useAsyncData(`surround-${path.value}`, () =>
	queryContent('docs').findSurround(path.value),
)
</script>

<template>
	<div>
		<article class="prose">
			<ContentDoc :path="path" />
		</article>

		<!-- Prev / Next navigation -->
		<nav v-if="surround && (surround[0] || surround[1])" class="doc-surround" aria-label="Page navigation">
			<div class="surround-prev">
				<NuxtLink v-if="surround[0]" :to="surround[0]._path" class="surround-link">
					<span class="surround-dir">← Previous</span>
					<span class="surround-title">{{ surround[0].title }}</span>
				</NuxtLink>
			</div>
			<div class="surround-next">
				<NuxtLink v-if="surround[1]" :to="surround[1]._path" class="surround-link surround-link--next">
					<span class="surround-dir">Next →</span>
					<span class="surround-title">{{ surround[1].title }}</span>
				</NuxtLink>
			</div>
		</nav>
	</div>
</template>

<style scoped>
.doc-surround {
	display: flex;
	justify-content: space-between;
	gap: 1.5rem;
	margin-top: 4rem;
	padding-top: 2rem;
	border-top: 1px solid var(--border-subtle);
}

.surround-prev,
.surround-next {
	flex: 1;
}

.surround-next {
	display: flex;
	justify-content: flex-end;
}

.surround-link {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	padding: 1rem 1.25rem;
	border: 1px solid var(--border);
	border-radius: var(--radius);
	background: var(--bg-card);
	transition: border-color 0.15s, background 0.15s;
	max-width: 16rem;
}

.surround-link:hover {
	border-color: var(--amber-lo);
	background: var(--bg-elevated);
}

.surround-link--next {
	align-items: flex-end;
	text-align: right;
}

.surround-dir {
	font-family: var(--font-mono);
	font-size: 0.7rem;
	letter-spacing: 0.08em;
	text-transform: uppercase;
	color: var(--text-3);
}

.surround-title {
	font-size: 0.9375rem;
	color: var(--text-2);
	font-weight: 500;
}
</style>
