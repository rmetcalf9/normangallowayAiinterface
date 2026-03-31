# AI Interface

# Access

https://rmetcalf9.github.io/normangallowayAiinterface/

Cloudflare
https://dash.cloudflare.com/16b402117fedcdb098d3334501fe7d50/workers/subdomain

# Deploy

## Backend

cd backend
wrangler login
wrangler deploy

wrangler secret put OPENAI_API_KEY
wrangler secret put GOOGLE_CLIENT_ID

Comma-separated list of allowed email addresses
Example: alice@gmail.com,bob@company.com
wrangler secret put ALLOWED_EMAILS
Myvalues:
rmetcalf9@googlemail.com,terry@ngalloway.co.uk

# Example: http://localhost:8000,https://rmetcalf9.github.io
wrangler secret put ALLOWED_ORIGIN

wrangler kv namespace create CHAT_KV

wrangler deploy
