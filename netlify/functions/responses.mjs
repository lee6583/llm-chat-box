const json = (status, data) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })

const getUpstreamBaseUrl = () => {
  const baseUrl = (process.env.ZROCODE_BASE_URL || process.env.OPENAI_BASE_URL || '').trim()
  return baseUrl || 'https://zrocode.site/v1'
}

const getUpstreamApiKey = () => {
  const key = (process.env.ZROCODE_API_KEY || process.env.OPENAI_API_KEY || '').trim()
  return key
}

export default async (request) => {
  if (request.method !== 'POST') {
    return json(405, { error: { message: 'Method Not Allowed' } })
  }

  const apiKey = getUpstreamApiKey()
  if (!apiKey) {
    return json(500, {
      error: {
        message:
          'Missing server API key. Set ZROCODE_API_KEY (or OPENAI_API_KEY) in Netlify environment variables.',
      },
    })
  }

  let payload = null
  try {
    payload = await request.json()
  } catch {
    return json(400, { error: { message: 'Invalid JSON body' } })
  }

  const upstreamUrl = `${getUpstreamBaseUrl().replace(/\/+$/, '')}/responses`

  // Proxy through to upstream. Streaming SSE is supported by passing through the ReadableStream body.
  const upstream = await fetch(upstreamUrl, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  // If upstream returns JSON error, forward it.
  const contentType = upstream.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    const data = await upstream.json().catch(() => null)
    return json(upstream.status, data ?? { error: { message: 'Upstream returned invalid JSON' } })
  }

  // For SSE or other streaming types, pass through body + key headers.
  const headers = new Headers()
  headers.set('cache-control', 'no-store')
  const passthroughHeaders = [
    'content-type',
    'transfer-encoding',
    'connection',
    'date',
    'server',
  ]
  for (const name of passthroughHeaders) {
    const value = upstream.headers.get(name)
    if (value) headers.set(name, value)
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  })
}

