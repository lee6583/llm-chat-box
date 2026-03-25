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
  if (request.method !== 'GET') {
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

  const upstreamUrl = `${getUpstreamBaseUrl().replace(/\/+$/, '')}/models`
  const upstream = await fetch(upstreamUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
  })

  const data = await upstream.json().catch(() => null)
  return json(upstream.status, data ?? { error: { message: 'Upstream returned invalid JSON' } })
}

