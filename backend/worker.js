/**
 * Cloudflare Worker — OpenAI Chat Proxy
 *
 * Required secrets (set via `wrangler secret put`):
 *   OPENAI_API_KEY     — your OpenAI API key
 *   GOOGLE_CLIENT_ID   — your Google OAuth client ID
 *   ALLOWED_EMAILS     — comma-separated list, e.g. "alice@example.com,bob@example.com"
 *   ALLOWED_ORIGIN     — your GitHub Pages URL, e.g. "https://yourname.github.io"
 *
 * Optional vars (set in wrangler.toml [vars]):
 *   OPENAI_MODEL       — defaults to "gpt-4o"
 *   SYSTEM_PROMPT      — the assistant's system instructions
 */

 const KV_KEY = 'openai_key';

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function jsonResponse(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json',
    },
  });
}

/**
 * Verify a Google ID token using Google's public endpoint.
 * Returns the token payload (including email) or null if invalid.
 */
async function verifyGoogleToken(idToken, expectedClientId) {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
    );
    if (!res.ok) return null;

    const payload = await res.json();

    // Validate audience matches our client ID
    if (payload.aud !== expectedClientId) return null;

    // Validate token hasn't expired
    if (Date.now() / 1000 > Number(payload.exp)) return null;

    return payload;
  } catch {
    return null;
  }
}

/* ── Resolve the active OpenAI key ───────────────────────────────────────── */

async function getOpenAIKey(env) {
  const kvKey = await env.CHAT_KV.get(KV_KEY);
  return kvKey || env.OPENAI_API_KEY || null;
}

async function handleChat(request, env, origin) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
  }

  const { message, token, previousResponseId } = body;

  if (!message || typeof message !== 'string') {
    return jsonResponse({ error: 'Missing or invalid "message" field' }, 400, origin);
  }
  if (!token || typeof token !== 'string') {
    return jsonResponse({ error: 'Missing Google ID token' }, 401, origin);
  }

  // ── 1. Verify Google token server-side ──────────────────────────────────
  const tokenPayload = await verifyGoogleToken(token, env.GOOGLE_CLIENT_ID);
  if (!tokenPayload) {
    return jsonResponse({ error: 'Invalid or expired Google token. Please sign in again.' }, 401, origin);
  }

  // ── 2. Check email allowlist ─────────────────────────────────────────────
  const allowedEmails = (env.ALLOWED_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (!allowedEmails.includes(tokenPayload.email.toLowerCase())) {
    return jsonResponse(
      { error: `Access denied. ${tokenPayload.email} is not on the authorised list.` },
      403,
      origin
    );
  }

  const apiKey = await getOpenAIKey(env);
  if (!apiKey)
    return jsonResponse({ error: 'No OpenAI API key configured. Ask your admin to set one.' }, 503, origin);

  // ── 3. Build OpenAI Responses API request ────────────────────────────────
  const openAIBody = {
    model: env.OPENAI_MODEL || 'gpt-4o',
    instructions: env.SYSTEM_PROMPT || 'You are a helpful assistant. Be clear and concise.',
    input: [{ role: 'user', content: message }],
    stream: true,
  };

  // If this is a follow-up message in an existing conversation, link to the previous response
  if (previousResponseId && typeof previousResponseId === 'string') {
    openAIBody.previous_response_id = previousResponseId;
  }

  // ── 4. Call OpenAI and stream the response back ──────────────────────────
  let openAIRes;
  try {
    openAIRes = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'OpenAI-Beta': 'responses=v1',
      },
      body: JSON.stringify(openAIBody),
    });
  } catch (err) {
    return jsonResponse({ error: `Failed to reach OpenAI: ${err.message}` }, 502, origin);
  }

  if (!openAIRes.ok) {
    if (openAIRes.status === 401)
      return jsonResponse({ error: 'OpenAI rejected the API key. The admin may need to update it.' }, 502, origin);
    const errText = await openAIRes.text();
    return jsonResponse({ error: `OpenAI error (${openAIRes.status}): ${errText}` }, 502, origin);
  }

  // Stream the SSE response straight back to the browser
  return new Response(openAIRes.body, {
    status: 200,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
/* ── Route: /api/admin/set-key ────────────────────────────────────────────── */

async function handleAdminSetKey(request, env, origin) {
  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
  }

  const { token, apiKey } = body;

  if (!token) return jsonResponse({ error: 'Missing Google ID token' }, 401, origin);
  if (!apiKey || !apiKey.startsWith('sk-'))
    return jsonResponse({ error: 'Invalid API key — must start with sk-' }, 400, origin);

  const tokenPayload = await verifyGoogleToken(token, env.GOOGLE_CLIENT_ID);
  if (!tokenPayload)
    return jsonResponse({ error: 'Invalid or expired Google token.' }, 401, origin);

  const adminEmails = (env.ADMIN_EMAIL || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email); // remove empty strings

  if (!adminEmails.includes(tokenPayload.email.toLowerCase())) {
    return jsonResponse({ error: 'Admin access only.' }, 403, origin);
  }

  try {
    await env.CHAT_KV.put(KV_KEY, apiKey.trim());
  } catch (err) {
    return jsonResponse({ error: `Failed to save key: ${err.message}` }, 500, origin);
  }

  return jsonResponse({ success: true, message: 'API key updated successfully.' }, 200, origin);
}

/* ── Route: /api/admin/status ─────────────────────────────────────────────── */

async function handleAdminStatus(request, env, origin) {
  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
  }

  const { token } = body;
  if (!token) return jsonResponse({ error: 'Missing Google ID token' }, 401, origin);

  const tokenPayload = await verifyGoogleToken(token, env.GOOGLE_CLIENT_ID);
  if (!tokenPayload)
    return jsonResponse({ error: 'Invalid or expired Google token.' }, 401, origin);

  const adminEmails = (env.ADMIN_EMAIL || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email); // remove empty strings

  if (!adminEmails.includes(tokenPayload.email.toLowerCase())) {
    return jsonResponse({ error: 'Admin access only.' }, 403, origin);
  }

  const kvKey = await env.CHAT_KV.get(KV_KEY);

  return jsonResponse({
    kvKeySet: !!kvKey,
    kvKeyPreview: kvKey ? `sk-...${kvKey.slice(-4)}` : null,
    fallbackConfigured: !!env.OPENAI_API_KEY,
  }, 200, origin);
}

/* ── Route: /api/admin/clear-key ─────────────────────────────────────────── */

async function handleAdminClearKey(request, env, origin) {
  let body;
  try { body = await request.json(); } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400, origin);
  }

  const { token } = body;
  if (!token) return jsonResponse({ error: 'Missing Google ID token' }, 401, origin);

  const tokenPayload = await verifyGoogleToken(token, env.GOOGLE_CLIENT_ID);
  if (!tokenPayload)
    return jsonResponse({ error: 'Invalid or expired Google token.' }, 401, origin);

  const adminEmails = (env.ADMIN_EMAIL || '')
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email); // remove empty strings

  if (!adminEmails.includes(tokenPayload.email.toLowerCase())) {
    return jsonResponse({ error: 'Admin access only.' }, 403, origin);
  }

  await env.CHAT_KV.delete(KV_KEY);
  return jsonResponse({ success: true, message: 'KV key cleared. Falling back to default secret.' }, 200, origin);
}

/* ── Main fetch handler ───────────────────────────────────────────────────── */

export default {
  async fetch(request, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const requestOrigin = request.headers.get('Origin') || '';

    if (origin !== '*' && requestOrigin !== origin)
      return new Response('Forbidden', { status: 403 });

    if (request.method === 'OPTIONS')
      return new Response(null, { status: 204, headers: corsHeaders(origin) });

    if (request.method === 'POST') {
      const path = new URL(request.url).pathname;
      if (path === '/api/chat')            return handleChat(request, env, origin);
      if (path === '/api/admin/set-key')   return handleAdminSetKey(request, env, origin);
      if (path === '/api/admin/status')    return handleAdminStatus(request, env, origin);
      if (path === '/api/admin/clear-key') return handleAdminClearKey(request, env, origin);
    }

    return new Response('Not found', { status: 404 });
  },
};
