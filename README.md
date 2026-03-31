# AI Interface

# Access

https://rmetcalf9.github.io/normangallowayAiinterface/


# Deploy

## Backend

cd backend
wrangler login
wrangler deploy

TODO wrangler secret put OPENAI_API_KEY
wrangler secret put GOOGLE_CLIENT_ID

Comma-separated list of allowed email addresses
Example: alice@gmail.com,bob@company.com
wrangler secret put ALLOWED_EMAILS
Myvalues:
rmetcalf9@googlemail.com,terry@ngalloway.co.uk



TODO wrangler secret put ALLOWED_ORIGIN


wrangler deploy
