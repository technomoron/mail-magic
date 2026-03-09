<script setup lang="ts">
interface TocLink {
	id: string
	text: string
	depth: number
	children?: TocLink[]
}

interface TocData {
	links: TocLink[]
}

const toc = useState<TocData | null>('docsToc')

const activeId = ref<string>('')

const flatLinks = computed<TocLink[]>(() => {
	if (!toc.value?.links) return []
	const result: TocLink[] = []
	for (const link of toc.value.links) {
		result.push(link)
		if (link.children) {
			for (const child of link.children) {
				result.push(child)
			}
		}
	}
	return result
})

onMounted(() => {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					activeId.value = entry.target.id
				}
			}
		},
		{ rootMargin: '0px 0px -60% 0px', threshold: 0.1 },
	)

	const headings = document.querySelectorAll('.prose h2[id], .prose h3[id]')
	for (const el of headings) {
		observer.observe(el)
	}

	onUnmounted(() => observer.disconnect())
})
</script>

<template>
	<nav v-if="toc && flatLinks.length > 0" class="docs-toc" aria-label="Table of contents">
		<span class="toc-heading">On this page</span>
		<ul class="toc-list">
			<li
				v-for="link in flatLinks"
				:key="link.id"
				:class="['toc-item', `toc-depth-${link.depth}`, { 'is-active': activeId === link.id }]"
			>
				<a :href="`#${link.id}`" class="toc-link">{{ link.text }}</a>
			</li>
		</ul>
	</nav>
</template>

<style scoped>
.docs-toc {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
	padding: 1.5rem 0;
}

.toc-heading {
	display: block;
	font-family: var(--font-mono);
	font-size: 0.65rem;
	font-weight: 500;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--amber);
	margin-bottom: 0.625rem;
}

.toc-list {
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 0;
}

.toc-item {
	display: flex;
}

.toc-link {
	display: block;
	font-size: 0.8125rem;
	color: var(--text-3);
	line-height: 1.5;
	padding: 0.25rem 0;
	transition: color 0.15s;
}

.toc-link:hover {
	color: var(--text-2);
}

.toc-item.is-active .toc-link {
	color: var(--amber);
}

.toc-depth-3 {
	padding-left: 0.875rem;
}
</style>
