<script setup lang="ts">
import type { NavItem } from '@nuxt/content/dist/runtime/types'

const props = defineProps<{
	navigation: NavItem[]
}>()

// fetchContentNavigation returns a single /docs root item with sections as children.
// Unwrap it so we render sections as group headers and their pages as links.
const sections = computed<NavItem[]>(() => {
	if (!props.navigation?.length) return []
	const first = props.navigation[0]
	if (first?._path === '/docs' && Array.isArray(first.children) && first.children.length > 0) {
		return first.children
	}
	return props.navigation
})
</script>

<template>
	<nav class="docs-sidebar" aria-label="Documentation navigation">
		<template v-for="section in sections" :key="section._path">
			<div class="sidebar-group">
				<span class="sidebar-group-title">{{ section.title }}</span>
				<ul class="sidebar-list">
					<li
						v-for="page in section.children ?? []"
						:key="page._path"
						class="sidebar-item"
					>
						<NuxtLink :to="page._path" class="sidebar-link" active-class="is-active">
							{{ page.title }}
						</NuxtLink>
					</li>
				</ul>
			</div>
		</template>
	</nav>
</template>

<style scoped>
.docs-sidebar {
	display: flex;
	flex-direction: column;
	gap: 2rem;
	padding: 1.5rem 0;
}

.sidebar-group {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
}

.sidebar-group-title {
	display: block;
	font-family: var(--font-mono);
	font-size: 0.65rem;
	font-weight: 500;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--amber);
	padding: 0 1rem 0.5rem;
}

.sidebar-list {
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 0;
}

.sidebar-item {
	display: flex;
}

.sidebar-link {
	display: block;
	width: 100%;
	padding: 0.375rem 1rem;
	font-size: 0.875rem;
	color: var(--text-2);
	border-left: 2px solid transparent;
	border-radius: 0 var(--radius) var(--radius) 0;
	transition: color 0.15s, border-color 0.15s, background 0.15s;
	line-height: 1.5;
}

.sidebar-link:hover {
	color: var(--text);
	background: var(--bg-elevated);
}

.sidebar-link.is-active {
	color: var(--amber);
	border-left-color: var(--amber);
	background: var(--bg-elevated);
	font-weight: 500;
}
</style>
