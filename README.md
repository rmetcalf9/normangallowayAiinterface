# AI Interface

# Deploy

## Backend

cd backend
wrangler login
wrangler deploy

TODO wrangler secret put OPENAI_API_KEY
wrangler secret put GOOGLE_CLIENT_ID

# Comma-separated list of allowed email addresses
# Example: alice@gmail.com,bob@company.com
wrangler secret put ALLOWED_EMAILS
TODO wrangler secret put ALLOWED_ORIGIN


wrangler deploy
