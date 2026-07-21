// Serves the built app on kabirtamari.com/gp200studio* and hosts the public
// message-wall API under /api/*. Any other hostname reaching this Worker (the
// legacy gp200.afterhour.uk custom domain, or a leftover afterhour.uk route) is
// permanently redirected to the app's new home, preserving deep paths/queries.

export default {
  fetch(request, env) {
    const url = new URL(request.url)

    if (url.hostname === 'kabirtamari.com') {
      // Strip the app's base path so /gp200studio/api/... and a bare /api/...
      // (wrangler dev, dev-origin fetches) route the same way.
      let path = url.pathname
      if (path.startsWith('/gp200studio')) {
        path = path.slice('/gp200studio'.length)
      }
      if (path.startsWith('/api/')) {
        return handleApi(request, env, path)
      }
      return env.ASSETS.fetch(request)
    }

    // wrangler dev / any non-prod host: still expose the API so the app works
    // locally, and fall through to assets for everything else.
    let path = url.pathname
    if (path.startsWith('/gp200studio')) {
      path = path.slice('/gp200studio'.length)
    }
    if (path.startsWith('/api/')) {
      return handleApi(request, env, path)
    }
    if (env.ASSETS && url.hostname !== 'gp200.afterhour.uk') {
      return env.ASSETS.fetch(request)
    }

    if (!path.startsWith('/')) {
      path = `/${path}`
    }
    const target = `https://kabirtamari.com/gp200studio${path}${url.search}`
    return Response.redirect(target, 301)
  },
}

// ---------------------------------------------------------------------------
// Message-wall API
// ---------------------------------------------------------------------------

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MAX_NAME = 40
const MAX_TEXT = 500
const MESSAGE_LIMIT = 100

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  })
}

async function handleApi(request, env, path) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  try {
    if (path === '/api/messages') {
      if (request.method === 'GET') return getMessages(env)
      if (request.method === 'POST') return postMessage(request, env)
      return json({ error: 'method not allowed' }, 405)
    }
    if (path === '/api/visits') {
      if (request.method === 'POST') return recordVisit(env)
      return json({ error: 'method not allowed' }, 405)
    }
    return json({ error: 'not found' }, 404)
  } catch (err) {
    return json({ error: 'server error', detail: String(err) }, 500)
  }
}

async function getMessages(env) {
  const [rows, visits] = await Promise.all([
    env.DB.prepare(
      'SELECT id, name, text, created_at FROM messages ORDER BY created_at DESC LIMIT ?',
    )
      .bind(MESSAGE_LIMIT)
      .all(),
    readVisits(env),
  ])
  return json({ messages: rows.results ?? [], visits })
}

async function postMessage(request, env) {
  let body
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid JSON body' }, 400)
  }

  const name = maskProfanity(String(body?.name ?? '').trim())
  const text = maskProfanity(String(body?.text ?? '').trim())

  if (name.length < 1 || name.length > MAX_NAME) {
    return json({ error: `name must be 1–${MAX_NAME} characters` }, 400)
  }
  if (text.length < 1 || text.length > MAX_TEXT) {
    return json({ error: `message must be 1–${MAX_TEXT} characters` }, 400)
  }

  const createdAt = Date.now()
  const inserted = await env.DB.prepare(
    'INSERT INTO messages (name, text, created_at) VALUES (?, ?, ?) RETURNING id, name, text, created_at',
  )
    .bind(name, text, createdAt)
    .first()

  return json(inserted, 201)
}

async function recordVisit(env) {
  const row = await env.DB.prepare(
    "UPDATE stats SET value = value + 1 WHERE key = 'visits' RETURNING value",
  ).first()
  return json({ visits: row?.value ?? 0 })
}

async function readVisits(env) {
  const row = await env.DB.prepare("SELECT value FROM stats WHERE key = 'visits'").first()
  return row?.value ?? 0
}

// A small, deliberately conservative bad-word list. Case-insensitive,
// word-boundary matched, each hit collapsed to a fixed "***" token (not
// length-matched, so word length isn't leaked). The server is the source of
// truth for filtering; the client only mirrors it for instant feedback.
const BAD_WORDS = [
  'fuck',
  'shit',
  'bitch',
  'asshole',
  'bastard',
  'damn',
  'dick',
  'piss',
  'cunt',
  'slut',
  'whore',
  'nigger',
  'faggot',
  'retard',
]

const PROFANITY_RE = new RegExp(`\\b(?:${BAD_WORDS.join('|')})\\b`, 'gi')

function maskProfanity(str) {
  return str.replace(PROFANITY_RE, '***')
}
