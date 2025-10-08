# Stripe Integration - Quick Reference

## 🚀 Quick Start

```bash
# 1. Install Stripe CLI
brew install stripe/stripe-cli/stripe  # macOS

# 2. Login to Stripe
stripe login

# 3. Start webhook listener (keep running)
stripe listen --forward-to localhost:4000/api/checkout/webhook

# 4. Copy webhook secret to .env
# STRIPE_WEBHOOK_SECRET=whsec_...

# 5. Start services
npx nx serve backend-api  # Terminal 1
npx nx dev frontend       # Terminal 2
```

## 🔑 Environment Variables

```bash
# Required for Stripe checkout to work
STRIPE_CHECKOUT_ENABLED=1
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID_CREDITS_3=price_...
STRIPE_PRICE_ID_CREDITS_5=price_...
STRIPE_PRICE_ID_CREDITS_10=price_...
STRIPE_AMOUNT_CREDITS_3=299    # £2.99 in pence
STRIPE_AMOUNT_CREDITS_5=499    # £4.99 in pence
STRIPE_AMOUNT_CREDITS_10=999   # £9.99 in pence
STRIPE_CURRENCY=gbp

# Frontend
NEXT_PUBLIC_STRIPE_CHECKOUT_ENABLED=1
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

## 🧪 Test Card

```
Card Number: 4242 4242 4242 4242
Expiry: 12/34 (any future date)
CVC: 123 (any 3 digits)
ZIP: 12345 (any 5 digits)
```

## 📡 API Endpoints

| Method | Endpoint | Auth | Purpose |
|--------|----------|------|---------|
| POST | `/api/checkout/session` | ✅ | Create checkout session |
| POST | `/api/checkout/confirm` | ✅ | Confirm payment (client) |
| POST | `/api/checkout/webhook` | ❌* | Webhook handler (Stripe) |
| GET | `/api/checkout/packages` | ✅ | Get available packages |

*Webhook auth uses signature verification

## 🔍 Debugging

**Check webhook events:**
```bash
# In Stripe CLI terminal
# You'll see: ✓ checkout.session.completed [evt_...]
```

**Check backend logs:**
```bash
# Look for:
# [CheckoutService] Received webhook event: checkout.session.completed
# [CheckoutService] Successfully fulfilled order for session cs_test_...
```

**Check database:**
```bash
mongosh mp_writer
db.purchases.find().pretty()
```

## 🐛 Common Issues

**"Invalid webhook signature"**
→ Copy webhook secret from `stripe listen` output to `.env`

**"Stripe is not configured"**
→ Set `STRIPE_CHECKOUT_ENABLED=1` and `STRIPE_SECRET_KEY=sk_test_...`

**"Raw body not available"**
→ Backend already configured correctly in `main.ts`

**Credits not added**
→ Check if webhook listener is running (terminal 3)

## 📚 Full Documentation

- **Testing Guide**: `STRIPE_TESTING.md`
- **Implementation Details**: `STRIPE_IMPLEMENTATION.md`
- **Environment Config**: `env.example.txt`

## ✅ Pre-Launch Checklist

- [ ] Created products in Stripe Dashboard
- [ ] Copied all price IDs to .env
- [ ] Set correct amounts (in pence/cents)
- [ ] Started webhook listener locally
- [ ] Tested successful payment
- [ ] Tested cancelled payment
- [ ] Verified credits added to account
- [ ] Checked webhook logs
- [ ] Verified purchase in database

## 🚀 Production Checklist

- [ ] Switch to live Stripe keys (remove `_test_`)
- [ ] Create webhook in Stripe Dashboard (not CLI)
- [ ] Point webhook to `https://yourdomain.com/api/checkout/webhook`
- [ ] Add production webhook secret to env vars
- [ ] Verify HTTPS on webhook endpoint
- [ ] Test with real card (small amount)
- [ ] Monitor Stripe Dashboard for events
- [ ] Set up Stripe alerts for failed payments

---

**Ready to test?** → `./scripts/stripe-local-setup.sh` 🎉


