<script setup lang="ts">
const activeTab = ref<'email' | 'form'>('email')

const features = [
	{
		icon: '◎',
		title: 'Nunjucks Templates',
		desc: 'Template inheritance, partials, and macros. Update email design without touching your application.',
	},
	{
		icon: '⬡',
		title: 'CLI Deployment',
		desc: 'Push templates and assets from CI/CD with mm-cli. Keep your email layer in sync with every deploy.',
	},
	{
		icon: '⊕',
		title: 'Rate Limiting & CAPTCHA',
		desc: 'Built-in rate limiting and CAPTCHA support protect public form endpoints from bots and abuse.',
	},
	{
		icon: '◫',
		title: 'Asset Hosting',
		desc: 'Serve and embed images, logos, and documents alongside templates. Domain-scoped and organized.',
	},
	{
		icon: '⬢',
		title: 'Domain Isolation',
		desc: 'Each sending domain gets its own templates, assets, and sender config. Multiple brands, one instance.',
	},
	{
		icon: '◈',
		title: 'Full REST API',
		desc: 'Clean REST API documented with Swagger/OpenAPI. Integrate from any language or framework.',
	},
]
</script>

<template>
	<div class="page">
		<!-- ── Navigation ──────────────────────────────────────────────── -->
		<header class="nav">
			<div class="container nav-inner">
				<a href="/" class="nav-logo" aria-label="Mail Magic home">
					<span class="nav-logo-mark">✦</span>
					<span class="nav-logo-text">mail<span class="nav-logo-accent">magic</span></span>
				</a>
				<nav class="nav-links" aria-label="Main navigation">
					<a href="/docs" class="nav-link">Docs</a>
					<a
						href="https://github.com/technomoron/mail-magic"
						class="nav-link"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub
					</a>
					<a href="/docs/getting-started" class="btn btn-primary nav-cta">Get Started</a>
				</nav>
			</div>
		</header>

		<!-- ── Hero ───────────────────────────────────────────────────── -->
		<section class="hero" aria-label="Introduction">
			<div class="hero-bg">
				<div class="hero-dot-grid" aria-hidden="true" />
				<div class="hero-amber-glow" aria-hidden="true" />
			</div>
			<div class="container hero-inner">
				<p class="hero-kicker fade-up delay-1">
					<span class="kicker-dot" aria-hidden="true" />
					Open Source · Self-Hosted · MIT Licensed
				</p>
				<h1 class="hero-title fade-up delay-2">
					Transactional email<br />
					<em class="hero-title-em">without the SaaS</em>
				</h1>
				<p class="hero-sub fade-up delay-3">
					Mail Magic is a self-hosted email operations server. Manage templates, send personalized messages,
					and handle public form submissions — all from your own infrastructure.
				</p>
				<div class="hero-actions fade-up delay-4">
					<a href="/docs/getting-started" class="btn btn-primary">Get Started →</a>
					<a
						href="https://github.com/technomoron/mail-magic"
						class="btn btn-ghost"
						target="_blank"
						rel="noopener noreferrer"
					>
						View on GitHub ↗
					</a>
				</div>
			</div>
		</section>

		<!-- ── Three pillars ───────────────────────────────────────────── -->
		<section class="pillars" aria-labelledby="pillars-heading">
			<div class="container">
				<h2 id="pillars-heading" class="sr-only">Core capabilities</h2>
				<div class="pillars-grid">
					<div class="pillar">
						<div class="pillar-icon" aria-hidden="true">⟳</div>
						<h3>Transactional Email</h3>
						<p>
							Send personalized, templated emails from any application. One service manages all your
							sending across every app and team.
						</p>
					</div>
					<div class="pillar pillar--mid">
						<div class="pillar-icon" aria-hidden="true">◈</div>
						<h3>Form Submissions</h3>
						<p>
							Accept public form submissions safely. Rate limiting, CAPTCHA, attachment handling, and
							recipient routing without exposing real addresses.
						</p>
					</div>
					<div class="pillar">
						<div class="pillar-icon" aria-hidden="true">⬡</div>
						<h3>Multi-Domain</h3>
						<p>
							Manage templates and assets for multiple brands from a single deployment. Domain-isolated
							by design, with per-domain sender config.
						</p>
					</div>
				</div>
			</div>
		</section>

		<!-- ── Code example ────────────────────────────────────────────── -->
		<section class="code-section" aria-labelledby="code-heading">
			<div class="container code-layout">
				<div class="code-prose">
					<span class="section-label">Simple by design</span>
					<h2 id="code-heading" class="section-title">A clean API.<br />Any language.</h2>
					<p class="section-sub">
						Mail Magic speaks REST. Integrate from Node, Python, Go, Ruby, PHP — or plain curl. No
						proprietary SDK required.
					</p>
				</div>
				<div class="code-block">
					<div class="code-tabs" role="tablist" aria-label="Code examples">
						<button
							role="tab"
							:aria-selected="activeTab === 'email'"
							:class="{ active: activeTab === 'email' }"
							@click="activeTab = 'email'"
						>
							Send email
						</button>
						<button
							role="tab"
							:aria-selected="activeTab === 'form'"
							:class="{ active: activeTab === 'form' }"
							@click="activeTab = 'form'"
						>
							Form submission
						</button>
					</div>
					<div class="code-window">
						<div class="code-window-bar" aria-hidden="true">
							<span /><span /><span />
						</div>
						<pre
							v-if="activeTab === 'email'"
							class="code-pre"
						><code><span class="ct">// Send a transactional email</span>
<span class="ck">curl</span> -X POST https://mail.example.com/api/v1/tx/message \
  -H <span class="cs">"Authorization: Bearer $API_KEY"</span> \
  -H <span class="cs">"Content-Type: application/json"</span> \
  -d <span class="cs">'{
    "template": "welcome",
    "domain":   "myapp.com",
    "to":       "alice@example.com",
    "data":     { "name": "Alice", "plan": "Pro" }
  }'</span></code></pre>
						<pre
							v-else
							class="code-pre"
						><code><span class="ct">// Public form — no auth required</span>
<span class="ck">curl</span> -X POST https://mail.example.com/api/v1/form/message \
  -F <span class="cs">"formKey=contact-us"</span> \
  -F <span class="cs">"recipient=sales"</span> \
  -F <span class="cs">"name=Bob Smith"</span> \
  -F <span class="cs">"message=Hi, I have a question"</span> \
  -F <span class="cs">"attachment=@brief.pdf"</span></code></pre>
					</div>
				</div>
			</div>
		</section>

		<!-- ── Feature grid ─────────────────────────────────────────────── -->
		<section class="features" aria-labelledby="features-heading">
			<div class="container">
				<div class="features-header">
					<span class="section-label">Features</span>
					<h2 id="features-heading" class="section-title">Everything you need.<br />Nothing you don't.</h2>
				</div>
				<div class="features-grid">
					<article v-for="feat in features" :key="feat.title" class="feature-card">
						<span class="feature-icon" aria-hidden="true">{{ feat.icon }}</span>
						<h3>{{ feat.title }}</h3>
						<p>{{ feat.desc }}</p>
					</article>
				</div>
			</div>
		</section>

		<!-- ── Self-hosted pitch ─────────────────────────────────────────── -->
		<section class="pitch" aria-labelledby="pitch-heading">
			<div class="container pitch-inner">
				<div class="pitch-text">
					<h2 id="pitch-heading" class="pitch-title">
						Your server.<br />Your data.<br />Your rules.
					</h2>
					<ul class="pitch-list" aria-label="Self-hosting benefits">
						<li>
							<span class="pitch-check" aria-hidden="true">✦</span>No usage limits or monthly bills
						</li>
						<li>
							<span class="pitch-check" aria-hidden="true">✦</span>No data sent to third parties
						</li>
						<li>
							<span class="pitch-check" aria-hidden="true">✦</span>Deploy anywhere — Docker, Coolify,
							bare metal, Railway
						</li>
						<li>
							<span class="pitch-check" aria-hidden="true">✦</span>Full source code, MIT licensed
						</li>
					</ul>
					<a href="/docs/getting-started" class="btn btn-primary">Start self-hosting →</a>
				</div>
				<div class="pitch-card" aria-hidden="true">
					<div class="pitch-stat">
						<span class="stat-num">∞</span>
						<span class="stat-label">emails per month</span>
					</div>
					<div class="pitch-divider" />
					<div class="pitch-stat">
						<span class="stat-num">0</span>
						<span class="stat-label">vendor lock-in</span>
					</div>
					<div class="pitch-divider" />
					<div class="pitch-stat">
						<span class="stat-num">100%</span>
						<span class="stat-label">your infrastructure</span>
					</div>
				</div>
			</div>
		</section>

		<!-- ── Footer ────────────────────────────────────────────────────── -->
		<footer class="footer">
			<div class="container footer-inner">
				<div class="footer-brand">
					<a href="/" class="nav-logo" aria-label="Mail Magic">
						<span class="nav-logo-mark">✦</span>
						<span class="nav-logo-text">mail<span class="nav-logo-accent">magic</span></span>
					</a>
					<p class="footer-tagline">Self-hosted email for developers<br />who own their stack.</p>
				</div>
				<nav class="footer-links" aria-label="Footer navigation">
					<a href="/docs">Documentation</a>
					<a
						href="https://github.com/technomoron/mail-magic"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub
					</a>
					<a href="/docs/changelog">Changelog</a>
					<a href="/docs/license">License</a>
				</nav>
			</div>
			<div class="footer-bottom">
				<div class="container">
					<span>MIT License · Built for self-hosters</span>
				</div>
			</div>
		</footer>
	</div>
</template>

<style scoped>
/* ─── Page wrapper ─────────────────────────────────────────────────────── */
.page {
	min-height: 100dvh;
	display: flex;
	flex-direction: column;
}

/* ─── Accessibility ─────────────────────────────────────────────────────── */
.sr-only {
	position: absolute;
	width: 1px;
	height: 1px;
	padding: 0;
	margin: -1px;
	overflow: hidden;
	clip: rect(0, 0, 0, 0);
	white-space: nowrap;
	border: 0;
}

/* ─── Navigation ────────────────────────────────────────────────────────── */
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

/* ─── Hero ──────────────────────────────────────────────────────────────── */
.hero {
	position: relative;
	padding-block: clamp(5rem, 14vw, 9rem) clamp(4rem, 10vw, 7rem);
	overflow: hidden;
	flex: 1;
}

.hero-bg {
	position: absolute;
	inset: 0;
	pointer-events: none;
}

.hero-dot-grid {
	position: absolute;
	inset: 0;
	background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px);
	background-size: 28px 28px;
	mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 100%);
	-webkit-mask-image: radial-gradient(ellipse 80% 60% at 50% 0%, black 30%, transparent 100%);
}

.hero-amber-glow {
	position: absolute;
	top: -10%;
	left: 50%;
	transform: translateX(-50%);
	width: 600px;
	height: 400px;
	background: radial-gradient(ellipse at center, rgba(212, 144, 10, 0.12) 0%, transparent 70%);
	pointer-events: none;
}

.hero-inner {
	position: relative;
	z-index: 1;
	display: flex;
	flex-direction: column;
	align-items: center;
	text-align: center;
	gap: 1.5rem;
}

.hero-kicker {
	display: flex;
	align-items: center;
	gap: 0.625rem;
	font-family: var(--font-mono);
	font-size: 0.72rem;
	letter-spacing: 0.12em;
	text-transform: uppercase;
	color: var(--text-3);
}

.kicker-dot {
	display: inline-block;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: var(--amber);
	animation: pulse 2.4s ease-in-out infinite;
}

@keyframes pulse {
	0%, 100% { opacity: 1; transform: scale(1); }
	50%       { opacity: 0.5; transform: scale(0.75); }
}

.hero-title {
	font-family: var(--font-display);
	font-size: clamp(2.5rem, 8vw, 5.5rem);
	font-weight: 500;
	line-height: 1.08;
	letter-spacing: -0.02em;
	color: var(--text);
	max-width: 14ch;
}

.hero-title-em {
	font-style: italic;
	background: linear-gradient(135deg, var(--amber-hi) 0%, var(--amber) 60%, var(--amber-lo) 100%);
	-webkit-background-clip: text;
	background-clip: text;
	-webkit-text-fill-color: transparent;
}

.hero-sub {
	font-size: clamp(1rem, 2vw, 1.125rem);
	color: var(--text-2);
	max-width: 56ch;
	line-height: 1.7;
}

.hero-actions {
	display: flex;
	gap: 0.875rem;
	flex-wrap: wrap;
	justify-content: center;
	margin-top: 0.5rem;
}

/* ─── Pillars ───────────────────────────────────────────────────────────── */
.pillars {
	padding-block: clamp(3rem, 7vw, 5rem);
	border-top: 1px solid var(--border-subtle);
}

.pillars-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
	gap: 1px;
	background: var(--border);
	border: 1px solid var(--border);
	border-radius: var(--radius-lg);
	overflow: hidden;
}

.pillar {
	background: var(--bg-card);
	padding: 2.25rem 2rem;
	display: flex;
	flex-direction: column;
	gap: 0.875rem;
	transition: background 0.2s;
}
.pillar:hover { background: var(--bg-elevated); }

.pillar-icon {
	font-size: 1.375rem;
	color: var(--amber);
	line-height: 1;
}

.pillar h3 {
	font-family: var(--font-display);
	font-size: 1.125rem;
	font-weight: 500;
	color: var(--text);
	letter-spacing: -0.01em;
}

.pillar p {
	font-size: 0.9375rem;
	color: var(--text-2);
	line-height: 1.65;
}

/* ─── Code section ──────────────────────────────────────────────────────── */
.code-section {
	padding-block: clamp(4rem, 9vw, 7rem);
	background: var(--bg-surface);
	border-top: 1px solid var(--border-subtle);
	border-bottom: 1px solid var(--border-subtle);
}

.code-layout {
	display: grid;
	grid-template-columns: 1fr 1.5fr;
	gap: clamp(2rem, 6vw, 5rem);
	align-items: center;
}

.code-block {
	display: flex;
	flex-direction: column;
	gap: 0;
	border-radius: var(--radius-lg);
	overflow: hidden;
	border: 1px solid var(--border);
}

.code-tabs {
	display: flex;
	background: var(--bg-elevated);
	border-bottom: 1px solid var(--border);
}

.code-tabs button {
	padding: 0.6rem 1rem;
	font-family: var(--font-mono);
	font-size: 0.75rem;
	color: var(--text-3);
	background: transparent;
	border: none;
	border-bottom: 2px solid transparent;
	cursor: pointer;
	transition: all 0.15s;
	margin-bottom: -1px;
}
.code-tabs button:hover { color: var(--text-2); }
.code-tabs button.active {
	color: var(--amber);
	border-bottom-color: var(--amber);
}

.code-window {
	background: var(--bg-card);
}

.code-window-bar {
	display: flex;
	align-items: center;
	gap: 6px;
	padding: 0.625rem 0.875rem;
	border-bottom: 1px solid var(--border-subtle);
}
.code-window-bar span {
	width: 10px;
	height: 10px;
	border-radius: 50%;
	background: var(--border);
}

.code-pre {
	margin: 0;
	padding: 1.375rem 1.5rem;
	overflow-x: auto;
	font-family: var(--font-mono);
	font-size: 0.8125rem;
	line-height: 1.75;
	color: var(--text-2);
	white-space: pre;
}

/* Syntax tokens */
.ct { color: var(--text-3); font-style: italic; }
.ck { color: var(--amber-hi); }
.cs { color: #8fc88f; }

/* ─── Features ──────────────────────────────────────────────────────────── */
.features {
	padding-block: clamp(4rem, 9vw, 7rem);
}

.features-header {
	display: flex;
	flex-direction: column;
	margin-bottom: 3rem;
}

.features-grid {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
	gap: 1px;
	background: var(--border);
	border: 1px solid var(--border);
	border-radius: var(--radius-lg);
	overflow: hidden;
}

.feature-card {
	background: var(--bg-card);
	padding: 2rem;
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
	border-top: 2px solid transparent;
	transition: all 0.2s;
}
.feature-card:hover {
	background: var(--bg-elevated);
	border-top-color: var(--amber);
}

.feature-icon {
	font-size: 1.25rem;
	color: var(--amber-lo);
	transition: color 0.2s;
	line-height: 1;
}
.feature-card:hover .feature-icon { color: var(--amber); }

.feature-card h3 {
	font-family: var(--font-display);
	font-size: 1rem;
	font-weight: 500;
	color: var(--text);
	letter-spacing: -0.01em;
}

.feature-card p {
	font-size: 0.875rem;
	color: var(--text-2);
	line-height: 1.65;
}

/* ─── Pitch ─────────────────────────────────────────────────────────────── */
.pitch {
	padding-block: clamp(4rem, 9vw, 7rem);
	background: var(--bg-surface);
	border-top: 1px solid var(--border-subtle);
	border-bottom: 1px solid var(--border-subtle);
}

.pitch-inner {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: clamp(2rem, 6vw, 5rem);
	align-items: center;
}

.pitch-title {
	font-family: var(--font-display);
	font-size: clamp(2rem, 5vw, 3.5rem);
	font-weight: 400;
	font-style: italic;
	line-height: 1.15;
	letter-spacing: -0.02em;
	color: var(--text);
	margin-bottom: 2rem;
}

.pitch-list {
	list-style: none;
	display: flex;
	flex-direction: column;
	gap: 0.875rem;
	margin-bottom: 2.5rem;
}

.pitch-list li {
	display: flex;
	align-items: baseline;
	gap: 0.75rem;
	font-size: 1rem;
	color: var(--text-2);
}

.pitch-check {
	color: var(--amber);
	font-size: 0.625rem;
	flex-shrink: 0;
	position: relative;
	top: -1px;
}

.pitch-card {
	background: var(--bg-card);
	border: 1px solid var(--border);
	border-radius: var(--radius-lg);
	padding: 2.5rem 2rem;
	display: flex;
	flex-direction: column;
	gap: 0;
}

.pitch-stat {
	display: flex;
	flex-direction: column;
	gap: 0.375rem;
	padding-block: 1.75rem;
}
.pitch-stat:first-child { padding-top: 0; }
.pitch-stat:last-child  { padding-bottom: 0; }

.stat-num {
	font-family: var(--font-display);
	font-size: clamp(2.25rem, 5vw, 3.25rem);
	font-weight: 300;
	color: var(--amber);
	line-height: 1;
	letter-spacing: -0.03em;
}

.stat-label {
	font-size: 0.8125rem;
	color: var(--text-3);
	letter-spacing: 0.02em;
}

.pitch-divider {
	height: 1px;
	background: var(--border);
}

/* ─── Footer ─────────────────────────────────────────────────────────────── */
.footer {
	border-top: 1px solid var(--border-subtle);
	padding-top: 3rem;
}

.footer-inner {
	display: flex;
	justify-content: space-between;
	align-items: flex-start;
	gap: 2rem;
	flex-wrap: wrap;
	padding-bottom: 2rem;
}

.footer-brand {
	display: flex;
	flex-direction: column;
	gap: 0.75rem;
}

.footer-tagline {
	font-size: 0.875rem;
	color: var(--text-3);
	line-height: 1.6;
	margin-top: 0.25rem;
}

.footer-links {
	display: flex;
	flex-direction: column;
	gap: 0.625rem;
	padding-top: 0.25rem;
}

.footer-links a {
	font-size: 0.875rem;
	color: var(--text-3);
	transition: color 0.15s;
}
.footer-links a:hover { color: var(--text-2); }

.footer-bottom {
	border-top: 1px solid var(--border-subtle);
	padding-block: 1.25rem;
}

.footer-bottom span {
	font-family: var(--font-mono);
	font-size: 0.72rem;
	letter-spacing: 0.04em;
	color: var(--text-3);
}

/* ─── Responsive ─────────────────────────────────────────────────────────── */
@media (max-width: 820px) {
	.code-layout {
		grid-template-columns: 1fr;
	}

	.pitch-inner {
		grid-template-columns: 1fr;
	}

	.nav-links .nav-link { display: none; }
}

@media (max-width: 560px) {
	.nav-cta { display: none; }
	.pillars-grid { grid-template-columns: 1fr; }
	.features-grid { grid-template-columns: 1fr; }
}
</style>
