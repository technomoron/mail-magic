<script setup lang="ts">
const { data: navigation } = await useAsyncData('docsNav', () =>
	fetchContentNavigation(queryContent('docs')),
)
</script>

<template>
	<div class="docs-page">
		<!-- ── Navigation ──────────────────────────────────────────────── -->
		<header class="nav">
			<div class="container nav-inner">
				<NuxtLink to="/" class="nav-logo" aria-label="Mail Magic home">
					<span class="nav-logo-mark">✦</span>
					<span class="nav-logo-text">mail<span class="nav-logo-accent">magic</span></span>
				</NuxtLink>
				<nav class="nav-links" aria-label="Main navigation">
					<NuxtLink to="/docs" class="nav-link">Docs</NuxtLink>
					<a
						href="https://github.com/technomoron/mail-magic"
						class="nav-link"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub
					</a>
					<NuxtLink to="/docs/getting-started/overview" class="btn btn-primary nav-cta">
						Get Started
					</NuxtLink>
				</nav>
			</div>
		</header>

		<!-- ── Docs layout ─────────────────────────────────────────────── -->
		<div class="docs-layout container">
			<!-- Left sidebar -->
			<aside class="docs-sidebar-wrap" aria-label="Documentation sections">
				<DocsSidebar :navigation="navigation ?? []" />
			</aside>

			<!-- Main content -->
			<main class="docs-main">
				<slot />
			</main>

			<!-- Right TOC -->
			<aside class="docs-toc-wrap" aria-label="Page table of contents">
				<div class="docs-toc-sticky">
					<DocsToc />
				</div>
			</aside>
		</div>
	</div>
</template>

<style scoped>
/* ─── Page wrapper ──────────────────────────────────────────────────────── */
.docs-page {
	min-height: 100dvh;
	display: flex;
	flex-direction: column;
}

/* ─── Navigation (same as landing page) ────────────────────────────────── */
.nav {
	position: sticky;
	top: 0;
	z-index: 100;
	background: rgba(13, 12, 9, 0.88);
	backdrop-filter: blur(12px);
	-webkit-backdrop-filter: blur(12px);
	border-bottom: 1px solid var(--border-subtle);
}

.nav-inner {
	display: flex;
	align-items: center;
	justify-content: space-between;
	height: 3.5rem;
}

.nav-logo {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-family: var(--font-display);
	font-size: 1.125rem;
	font-weight: 500;
	letter-spacing: -0.01em;
	transition: opacity 0.15s;
}
.nav-logo:hover { opacity: 0.8; }

.nav-logo-mark {
	color: var(--amber);
	font-size: 0.875rem;
}

.nav-logo-text { color: var(--text); }
.nav-logo-accent { color: var(--amber); }

.nav-links {
	display: flex;
	align-items: center;
	gap: 1.75rem;
}

.nav-link {
	font-size: 0.875rem;
	color: var(--text-2);
	transition: color 0.15s;
}
.nav-link:hover { color: var(--text); }

.nav-cta { margin-left: 0.5rem; }

/* ─── Three-column docs layout ──────────────────────────────────────────── */
.docs-layout {
	display: grid;
	grid-template-columns: 240px minmax(0, 1fr) 200px;
	gap: 0;
	align-items: start;
	flex: 1;
}

/* ─── Left sidebar ──────────────────────────────────────────────────────── */
.docs-sidebar-wrap {
	position: sticky;
	top: 3.5rem;
	height: calc(100dvh - 3.5rem);
	overflow-y: auto;
	border-right: 1px solid var(--border-subtle);
	overscroll-behavior: contain;
	scrollbar-width: thin;
	scrollbar-color: var(--border) transparent;
}

/* ─── Main content ──────────────────────────────────────────────────────── */
.docs-main {
	padding: 3rem 3rem 5rem;
	max-width: 720px;
	margin-inline: auto;
	width: 100%;
}

/* ─── Right TOC ─────────────────────────────────────────────────────────── */
.docs-toc-wrap {
	border-left: 1px solid var(--border-subtle);
}

.docs-toc-sticky {
	position: sticky;
	top: 3.5rem;
	height: calc(100dvh - 3.5rem);
	overflow-y: auto;
	padding: 0 1rem;
	overscroll-behavior: contain;
	scrollbar-width: thin;
	scrollbar-color: var(--border) transparent;
}

/* ─── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 1080px) {
	.docs-layout {
		grid-template-columns: 220px minmax(0, 1fr);
	}
	.docs-toc-wrap {
		display: none;
	}
}

@media (max-width: 720px) {
	.docs-layout {
		grid-template-columns: 1fr;
	}
	.docs-sidebar-wrap {
		display: none;
	}
	.docs-main {
		padding: 2rem 1.25rem 4rem;
	}
	.nav-links .nav-link { display: none; }
}

@media (max-width: 560px) {
	.nav-cta { display: none; }
}
</style>
