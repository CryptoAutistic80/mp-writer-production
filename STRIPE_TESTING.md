# Stripe Integration Testing Guide

This guide will help you test the Stripe integration locally using Stripe's test mode and Stripe CLI.

## Prerequisites

1. **Stripe Account**: Sign up at [stripe.com](https://stripe.com)
2. **Stripe CLI**: Install from [stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli)

## Setup Steps

### 1. Install Stripe CLI

**macOS (Homebrew)**:
```bash
brew install stripe/stripe-cli/stripe
```

**Linux**:
```bash
curl -s https://packages.stripe.com/api/v1/install.sh | bash
```

**Windows**:
Download from [GitHub releases](https://github.com/stripe/stripe-cli/releases/latest)

### 2. Authenticate Stripe CLI

```bash
stripe login
```

This will open your browser to authorize the CLI.

### 3. Create Stripe Products & Prices

1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/test/products)
2. Create three products for credit packages:

**Product 1: 3 Credits**
- Name: `3 Credits`
- Price: `£2.99` (or `$2.99` for USD)
- Recurring: One-time
- Copy the **Price ID** (format: `price_...`)

**Product 2: 5 Credits**
- Name: `5 Credits`
- Price: `£4.99`
- Recurring: One-time
- Copy the **Price ID**

**Product 3: 10 Credits**
- Name: `10 Credits`
- Price: `£9.99`
- Recurring: One-time
- Copy the **Price ID**

### 4. Get Your API Keys

1. Go to [Stripe Dashboard > API Keys](https://dashboard.stripe.com/test/apikeys)
2. Copy your:
   - **Publishable key** (starts with `pk_test_`)
   - **Secret key** (starts with `sk_test_`)

### 5. Configure Environment Variables

Create a `.env` file in the workspace root (copy from `env.example.txt`):

```bash
# Stripe Configuration
STRIPE_CHECKOUT_ENABLED=1
STRIPE_SECRET_KEY=sk_test_your_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
STRIPE_PRICE_ID_CREDITS_3=price_...
STRIPE_PRICE_ID_CREDITS_5=price_...
STRIPE_PRICE_ID_CREDITS_10=price_...
STRIPE_AMOUNT_CREDITS_3=299
STRIPE_AMOUNT_CREDITS_5=499
STRIPE_AMOUNT_CREDITS_10=999
STRIPE_CURRENCY=gbp

# Frontend
NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED=1
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_your_key_here
```

> **Important**: Amounts are in **minor units** (pence for GBP, cents for USD, etc.)

### 6. Start Stripe Webhook Listener (Local Testing)

In a **separate terminal**, run:

```bash
stripe listen --forward-to localhost:4000/api/checkout/webhook
```

This will output a webhook signing secret like: `whsec_...`

Copy this secret and add it to your `.env`:
```bash
STRIPE_WEBHOOK_SECRET=whsec_abc123...
```

> **Note**: Keep this terminal running while testing!

### 7. Start Your Application

```bash
# Terminal 1: Backend
npm run serve backend-api

# Terminal 2: Frontend
npm run dev frontend

# Terminal 3: Stripe webhook listener
stripe listen --forward-to localhost:4000/api/checkout/webhook
```

## Testing the Integration

### Test Scenario 1: Successful Payment

1. Navigate to `http://localhost:3000/credit-shop`
2. Click "Buy for £2.99" on any package
3. You'll be redirected to Stripe Checkout
4. Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date (e.g., `12/34`)
   - CVC: Any 3 digits (e.g., `123`)
   - ZIP: Any 5 digits (e.g., `12345`)
5. Complete the payment
6. You'll be redirected back to the success page
7. Credits should be added to your account

**What to check**:
- ✅ Credits added to your account
- ✅ Purchase recorded in database
- ✅ Webhook received (check Stripe CLI terminal)
- ✅ Backend logs show fulfillment

### Test Scenario 2: Webhook Delivery

The webhook handler ensures credits are added even if the user closes their browser before the success page loads.

1. Complete a purchase as above
2. Check the Stripe CLI terminal
3. You should see: `checkout.session.completed` event received
4. Backend logs should show: `Processing completed checkout session: cs_test_...`

### Test Scenario 3: Duplicate Prevention

1. Complete a purchase
2. Try to confirm the same session again by refreshing the success page
3. Should return: `alreadyProcessed: true`
4. Credits should NOT be added twice

### Test Scenario 4: Cancelled Payment

1. Start checkout
2. Click "Back" or close the Stripe Checkout window
3. You'll be redirected to `/credit-shop/cancel`
4. No charges should be made

### Test Scenario 5: Price Validation

This tests that the backend validates the amount paid matches the expected amount.

1. The service validates both:
   - Price ID matches expected package
   - Amount paid matches expected amount
2. If amounts don't match, payment is rejected

### Test Cards

Stripe provides many test cards for different scenarios:

| Card Number | Scenario |
|-------------|----------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0025 0000 3155` | Requires authentication (3D Secure) |
| `4000 0000 0000 9995` | Declined card |
| `4000 0000 0000 0341` | Charge succeeds but async payment fails |

See more: [stripe.com/docs/testing](https://stripe.com/docs/testing)

## Monitoring & Debugging

### View Stripe Events

1. Go to [Stripe Dashboard > Developers > Events](https://dashboard.stripe.com/test/events)
2. See all webhook events and their payloads
3. Click "Send test webhook" to manually trigger events

### View Backend Logs

The backend logs important events:
- ✅ `Received webhook event: checkout.session.completed`
- ✅ `Processing completed checkout session: cs_test_...`
- ✅ `Successfully fulfilled order for session cs_test_...`
- ❌ `Failed to fulfill order for session cs_test_...`

### View Database

Check MongoDB for purchase records:

```bash
# Connect to MongoDB
mongosh mp_writer

# View purchases
db.purchases.find().pretty()

# Check for specific session
db.purchases.find({ "metadata.stripeSessionId": "cs_test_..." }).pretty()
```

## Production Deployment

### 1. Create Production Webhook

1. Go to [Stripe Dashboard > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click "Add endpoint"
3. Enter URL: `https://yourdomain.com/api/checkout/webhook`
4. Select events:
   - `checkout.session.completed`
   - `checkout.session.async_payment_succeeded`
5. Copy the **Signing secret** and add to production env vars

### 2. Switch to Live Mode

1. Get live API keys from [Stripe Dashboard](https://dashboard.stripe.com/apikeys)
2. Create live products and prices
3. Update environment variables with live keys (remove `_test_` from keys)

### 3. Security Checklist

- ✅ `STRIPE_WEBHOOK_SECRET` configured (validates webhook signatures)
- ✅ Webhook URL is HTTPS (required in production)
- ✅ Amount validation enabled (prevents price manipulation)
- ✅ User authentication required (JWT guard on endpoints)
- ✅ Idempotency checks (prevents duplicate credits)
- ✅ MongoDB transactions (ensures atomicity)

## Troubleshooting

### "Invalid webhook signature"

- Ensure `STRIPE_WEBHOOK_SECRET` is set correctly
- For local testing, use the secret from `stripe listen` command
- For production, use the secret from Stripe Dashboard webhook settings

### "Stripe is not configured"

- Check `STRIPE_SECRET_KEY` is set in `.env`
- Ensure `STRIPE_CHECKOUT_ENABLED=1`
- Restart backend after changing env vars

### "Raw body not available"

- Ensure `main.ts` has `rawBody: true` in `NestFactory.create()`
- Webhook endpoint must receive raw buffer, not parsed JSON

### Credits not added after payment

- Check Stripe CLI terminal for webhook delivery
- Check backend logs for errors
- Verify MongoDB connection
- Check purchase collection for duplicate session ID

### "Amount mismatch" error

- Ensure `STRIPE_AMOUNT_CREDITS_X` values match your Stripe prices
- Amounts must be in minor units (pence/cents)
- Example: £2.99 = 299 pence

## API Endpoints

### POST `/api/checkout/session`
Creates a Stripe Checkout session.

**Auth**: Required (JWT)

**Body**:
```json
{
  "credits": 3
}
```

**Response**:
```json
{
  "sessionId": "cs_test_...",
  "url": "https://checkout.stripe.com/..."
}
```

### POST `/api/checkout/confirm`
Confirms a checkout session and adds credits (client-side callback).

**Auth**: Required (JWT)

**Body**:
```json
{
  "sessionId": "cs_test_..."
}
```

**Response**:
```json
{
  "alreadyProcessed": false,
  "creditsAdded": 3,
  "balance": 13.0
}
```

### POST `/api/checkout/webhook`
Webhook endpoint for Stripe events (server-side).

**Auth**: None (validated via webhook signature)

**Headers**:
- `stripe-signature`: Webhook signature

**Body**: Raw Stripe event payload

### GET `/api/checkout/packages`
Returns available credit packages with pricing.

**Auth**: Required (JWT)

**Response**:
```json
[
  {
    "credits": 3,
    "priceId": "price_...",
    "amount": 299,
    "currency": "gbp"
  },
  ...
]
```

## Support

For issues with:
- **Stripe integration**: Check Stripe logs and webhook events
- **Payment failures**: Use different test cards
- **Webhook issues**: Verify signature and endpoint URL
- **Database issues**: Check MongoDB connection and indexes

Happy testing! 🎉

