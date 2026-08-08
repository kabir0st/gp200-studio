// Serves the built app on kabirtamari.com/gp200studio*. Any other hostname
// reaching this Worker (the legacy gp200.afterhour.uk custom domain, or a
// leftover afterhour.uk route) is permanently redirected to the app's new
// home, preserving deep paths and query strings.
export default {
  fetch(request, env) {
    const url = new URL(request.url)
    if (url.hostname === 'kabirtamari.com') {
      return env.ASSETS.fetch(request)
    }
    let path = url.pathname
    if (path.startsWith('/gp200studio')) {
      path = path.slice('/gp200studio'.length)
    }
    if (!path.startsWith('/')) {
      path = `/${path}`
    }
    const target = `https://kabirtamari.com/gp200studio${path}${url.search}`
    return Response.redirect(target, 301)
  },
}
