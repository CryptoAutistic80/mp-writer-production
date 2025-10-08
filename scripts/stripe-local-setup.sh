#!/bin/bash

# Stripe Local Testing Setup Script
# This script helps you set up Stripe integration for local testing

set -e

echo "🔧 Stripe Integration Setup"
echo "============================"
echo ""

# Check if .env exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found!"
    echo "📝 Creating .env from env.example.txt..."
    cp env.example.txt .env
    echo "✅ Created .env file"
    echo ""
fi

# Check if stripe CLI is installed
if ! command -v stripe &> /dev/null; then
    echo "❌ Stripe CLI not found!"
    echo ""
    echo "Please install Stripe CLI:"
    echo "  macOS:   brew install stripe/stripe-cli/stripe"
    echo "  Linux:   curl -s https://packages.stripe.com/api/v1/install.sh | bash"
    echo "  Windows: Download from https://github.com/stripe/stripe-cli/releases/latest"
    echo ""
    exit 1
fi

echo "✅ Stripe CLI found: $(stripe --version)"
echo ""

# Check if authenticated
if ! stripe config --list &> /dev/null; then
    echo "🔐 Authenticating with Stripe..."
    stripe login
    echo ""
fi

echo "✅ Stripe CLI authenticated"
echo ""

# Get webhook secret
echo "🎧 Setting up webhook listener..."
echo ""
echo "Starting Stripe webhook listener..."
echo "This will forward webhooks to localhost:4000/api/checkout/webhook"
echo ""
echo "Copy the webhook signing secret (whsec_...) to your .env file:"
echo "  STRIPE_WEBHOOK_SECRET=whsec_..."
echo ""
echo "Press Ctrl+C to stop when done testing"
echo ""

stripe listen --forward-to localhost:4000/api/checkout/webhook


