// Serves the app on gp200studio.com. Every other host that reaches this Worker
// — kabirtamari.com/gp200studio* (the old subfolder home) and gp200.afterhour.uk
// (the original custom domain) — is 301'd to the apex with the deep path
// preserved, so the accumulated link equity follows the move.
//
// 301, never 302: a temporary redirect does not pass ranking signals, and that
// is the usual way a domain move quietly loses its search position.
//
// This Worker only runs because `assets.run_worker_first` is set in
// wrangler.jsonc. Without it, Workers Assets answers any request whose path
// matches a built file and none of the redirects below ever fire — which is
// what the pre-move config was silently doing. Note that the field must sit
// inside `assets`; at the top level wrangler ignores it with a warning.
//
// `wrangler dev --local` does NOT simulate run_worker_first — it serves assets
// directly and never invokes this module — so the redirects cannot be checked
// there. redirectTarget() is exported and unit-tested instead
// (tests/unit/workerRedirect.test.ts), and the deployed behaviour is confirmed
// with `curl -sI` after release.
const NEW_ORIGIN = 'https://gp200studio.com'
const CANONICAL_HOST = 'gp200studio.com'
const LEGACY_PREFIX = '/gp200studio'

// Local development hosts serve the site as-is rather than redirecting off the
// machine, so `wrangler dev` stays usable if run_worker_first ever is honoured.
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '[::1]'])

// Hosts where this app only ever owned a subfolder, so the rest of the zone
// belongs to someone else and must be left alone.
//
// The route pattern in wrangler.jsonc is a PREFIX match, not a path-segment
// match, so a sibling path like /gp200studio-archive reaches this Worker even
// though it was never part of the app. foldPath() correctly declines to fold
// one — but without this set the host check below fired anyway and 301'd a live
// URL on someone else's site to a 404 on the apex. Worse, a bare 301 is
// heuristically cacheable ~forever, so anyone who hit it could not be un-stuck
// by a later deploy. The wrangler routes were narrowed to /gp200studio/* as
// well; this is the second line of defence, and the one that is testable.
const PREFIX_ONLY_HOSTS = new Set(['kabirtamari.com'])

/**
 * Strip the old subfolder prefix. The app had exactly two entry points — "/"
 * and the JS-only "#guide" fragment, which is never sent to the server — so a
 * prefix strip is a complete mapping and needs no per-URL redirect table.
 * A bare "/gp200studio" collapses to "/".
 */
export function foldPath(pathname) {
  if (pathname === LEGACY_PREFIX || pathname.startsWith(`${LEGACY_PREFIX}/`)) {
    return pathname.slice(LEGACY_PREFIX.length) || '/'
  }
  return pathname
}

/**
 * The absolute URL this request should be permanently redirected to, or null
 * if it should be served from this origin.
 *
 * @param {string} requestUrl
 * @returns {string | null}
 */
export function redirectTarget(requestUrl) {
  const url = new URL(requestUrl)
  if (DEV_HOSTS.has(url.hostname)) return null

  const folded = foldPath(url.pathname)
  const moved = folded !== url.pathname

  // On a host we only ever owned a subfolder of, the ONLY thing that may be
  // redirected is a path that genuinely folds. Anything else on that zone is
  // not ours to move.
  if (PREFIX_ONLY_HOSTS.has(url.hostname)) {
    return moved ? `${NEW_ORIGIN}${folded}${url.search}` : null
  }

  // Redirect when the request is off-domain, or when an old-shaped path has
  // leaked onto the new domain (a stale bookmark, or a hand-edited URL).
  if (url.hostname !== CANONICAL_HOST || moved) {
    return `${NEW_ORIGIN}${folded}${url.search}`
  }
  return null
}

export default {
  fetch(request, env) {
    const target = redirectTarget(request.url)
    if (target) {
      // Built by hand rather than with Response.redirect() so the response can
      // carry a Cache-Control. A bare 301 has none, and browsers may then cache
      // it heuristically for as long as they like — which makes a mistake in
      // the redirect table effectively permanent for anyone who hit it. A day
      // is long enough that the move costs nothing and short enough to correct.
      return new Response(null, {
        status: 301,
        headers: { Location: target, 'Cache-Control': 'public, max-age=86400' },
      })
    }
    return env.ASSETS.fetch(request)
  },
}
