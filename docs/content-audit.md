# MPWriter Marketing Content Audit

## Current Information Overview

### Home page (`/`)
- **Headline & subheading:** Communicates the core promise of amplifying the user's voice and drafting respectful letters, but omits detail about the research workflow, success outcomes, or guarantees.【F:frontend/src/components/Hero.tsx†L7-L31】
- **Process stepper:** Lists five steps, including a "coming soon" upload feature, yet lacks context on how the AI research works, what inputs are required, and how long each step takes. No mention of saved letters, editing tools, or export options that exist in the product.【F:frontend/src/components/Hero.tsx†L33-L73】
- **Value messaging:** Highlights "One credit = One letter" without elaborating on pricing, what's included per credit (research depth, revisions, exports), or refund policies.【F:frontend/src/components/Hero.tsx†L24-L31】

### How it works (`/how-it-works`)
- Provides a friendly narrative of the letter creation process but repeats high-level steps already on the home page. There is limited detail about advanced functionality such as tone controls, follow-up prompts, citation handling, or audio transcription. Timing expectations, revision cycles, and MP delivery guidance are missing.【F:frontend/src/app/how-it-works/page.tsx†L1-L73】
- Privacy notice mentions Google sign-in but does not clarify data retention, security safeguards, or how user information is stored (e.g., encryption, audit logging).【F:frontend/src/app/how-it-works/page.tsx†L74-L88】

### Credit shop (`/credit-shop`)
- Clearly labels packages and pricing once the API responds, but lacks descriptive copy about what credits unlock (research depth, letter exports, support). No explanation of how to estimate needed credits, billing FAQs, or what happens after purchase. Stripe security reassurance is brief; there is no mention of receipts or VAT invoices.【F:frontend/src/app/credit-shop/page.tsx†L108-L206】

### Contact (`/contact`)
- Provides only a single email address with a one-day response target. No additional support channels, expected hours, or escalation paths are offered.【F:frontend/src/app/contact/page.tsx†L1-L24】

### Global navigation & footer
- Header prioritises "How it works" but omits direct links to pricing, FAQs, or customer stories. Footer only contains a copyright line and contact link; it does not reinforce trust signals (company details, policies, terms/privacy).【F:frontend/src/components/SiteHeader.tsx†L37-L76】【F:frontend/src/components/SiteFooter.tsx†L1-L14】

## Key Gaps Against Finished Functionality

- **Feature depth under-explained:** The production app supports postcode lookup, deep research, tone selection, saved letters, exports, audio transcription, and credit metering, yet only a subset appears in marketing copy.【F:README.md†L6-L57】
- **Pricing transparency:** Users see "One credit = One letter" but no per-credit pricing upfront, no explanation of how credits are consumed across drafts or revisions, and no clarity on expiry/refund policies.
- **Onboarding clarity:** There is no "Getting started" guide that walks from sign-up through sending the first letter, nor any explanation of required inputs (postcode, topic, personal stories) before checkout.
- **Data use & security:** Privacy messaging is limited to Google sign-in. The app's strong security posture (encryption, audit logging, rate limits) is absent from user-facing information.【F:README.md†L40-L73】
- **Support & trust:** Missing FAQs, support hours, guarantees, testimonials, and compliance statements reduce user confidence.
- **Future roadmap:** The "coming soon" step lacks context; no roadmap section explains upcoming features or invites feedback.

## Recommended Content Enhancements

1. **Revise home page messaging**
   - Expand hero copy to summarise the full workflow: lookup, research, tone personalisation, saved drafts, and export formats.
   - Replace the current five-step list with a clearer three-stage journey (Plan → Draft → Deliver), noting real product capabilities and removing "coming soon" items until available.
   - Add a prominent pricing teaser (e.g., "Letters from £6.99") with a link to full pricing details and what a credit includes.

2. **Create a dedicated Pricing & Credits page**
   - Detail each package price, what's included per credit (research depth, follow-up edits, exports), and policies (expiry, refunds, VAT invoices, business accounts).
   - Provide guidance on choosing a package (e.g., occasional advocate vs. campaigner) and highlight bulk savings.
   - Include Stripe security messaging, accepted payment methods, and receipts/invoices info.

3. **Enrich the How it works page**
   - Introduce numbered phases with screenshots or animations of the Writing Desk, including tone picker, research citations, and saved letters.
   - Add a "What you'll need" checklist (postcode, topic description, supporting links) and average turnaround time.
   - Incorporate an FAQ accordion covering drafts, edits, MP delivery, and support response times.

4. **Add Trust & Safety content**
   - Publish Privacy Policy and Terms links in the footer with summaries of data handling (encrypted storage, audit logging, limited retention). Reference rate limiting and security reviews to build trust.【F:README.md†L40-L73】
   - Add testimonials or case studies showcasing successful MP engagements (even as placeholders pending real stories).
   - Include company registration info, accessibility statement, and contact hours.

5. **Improve Support & Onboarding messaging**
   - Expand the Contact page with response expectations, alternative channels (support form, knowledge base), and escalation options.
   - Add an onboarding guide or quickstart article that walks through signing in, spending first credit, editing drafts, and exporting letters.
   - Surface contextual help in-app (tooltips or "Need help?" links) pointing to knowledge base content once published.

6. **Clarify Roadmap & Updates**
   - Replace "Upload supporting documents (coming soon)" with a roadmap section outlining upcoming features, timelines, and how users can contribute feedback.
   - Add a changelog or "What's new" link to reassure users of ongoing improvements.

Implementing the above content updates will align the marketing site with the app's mature capabilities, reduce uncertainty around pricing and privacy, and provide the guidance needed for new users to take confident action.
