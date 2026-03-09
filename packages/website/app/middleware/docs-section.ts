export default defineNuxtRouteMiddleware(async (to) => {
	const page = await queryContent(to.path).findOne().catch(() => null)
	if (page) return

	// No content at this path — likely a section directory (no index.md).
	// Find the first child page and redirect to it.
	const cleanPath = to.path.replace(/\/$/, '')
	const firstChild = await queryContent('docs')
		.where({ _path: { $regex: `^${cleanPath}/` } })
		.sort({ _path: 1 })
		.findOne()
		.catch(() => null)

	if (firstChild?._path) {
		return navigateTo(firstChild._path, { replace: true })
	}

	throw createError({ statusCode: 404, statusMessage: 'Page not found' })
})
