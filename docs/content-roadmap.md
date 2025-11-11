# MPWriter Awareness Content Calendar (Bi-weekly cadence)

This calendar outlines 12 awareness-focused articles designed to educate UK constituents about communicating effectively with their MPs. Each piece aligns with MPWriter's positioning and feeds marketing automation by pairing educational depth with gated downloadable assets. Publish on the indicated Mondays to keep a reliable bi-weekly rhythm.

| Publish week | Topic & working title | Core angle & keyword focus | Downloadable asset (email gate) | Primary CTA |
| --- | --- | --- | --- | --- |
| 06 Jan 2025 | How to find your MP in the UK (and confirm their contact channels) | Step-by-step MP lookup, official registers, verification tips | Constituency Contact Checklist (.txt) | Start a researched letter with MPWriter |
| 20 Jan 2025 | Best way to write an effective MP letter that gets read | Research-backed structure, tone, follow-up workflow | Persuasive MP Letter Template (.txt) | Draft your letter in the Writing Desk |
| 03 Feb 2025 | Turning constituent stories into impact: preparing evidence for your MP | Gathering proof, citing government data, safeguarding sensitive info | Evidence Collection Planner (.txt) | Capture your case in MPWriter |
| 17 Feb 2025 | UK government complaints escalation map (from MP to ombudsman) | Explainer of escalation paths and timelines | Escalation Pathway Flowchart (PDF) | Plan your escalation with MPWriter |
| 03 Mar 2025 | Email vs. post vs. surgery: best channel to reach your MP fast | Channel comparison, response time expectations | Outreach Channel Decision Grid (.xlsx) | Launch MPWriter and send today |
| 17 Mar 2025 | Following up with your MP: cadence, reminders, and record keeping | Follow-up scripts, tracking spreadsheet | Follow-up Tracker (.xlsx) | Set automated reminders in MPWriter |
| 31 Mar 2025 | Preparing for a constituency surgery: briefing pack and talking points | Live meeting prep checklist | Surgery Briefing Pack (.pdf) | Generate your talking points in MPWriter |
| 14 Apr 2025 | Working with your MP on community campaigns | Coalition building, petitions, media coordination | Community Campaign Starter Kit (.txt) | Coordinate campaign messaging with MPWriter |
| 28 Apr 2025 | How to escalate safeguarding or urgent welfare concerns via your MP | Emergency contacts, safeguarding law | Safeguarding Escalation Script (.txt) | Use MPWriter urgent support mode |
| 12 May 2025 | Data protection when sharing personal stories with your MP | GDPR guidance, consent language | Consent & Privacy Language Pack (.txt) | Generate compliant letters with MPWriter |
| 26 May 2025 | Tracking parliamentary questions and debates related to your issue | Hansard monitoring, alerts setup | Parliamentary Monitoring Worksheet (.xlsx) | Keep an issue log inside MPWriter |
| 09 Jun 2025 | Measuring MP engagement impact over time | KPIs, reporting dashboards | Impact Reporting Dashboard Template (.xlsx) | Export your MPWriter activity log |

## Production workflow

1. **Two-week sprint rhythm:** Kick off research the Thursday before publication. Finalise copy, assets, and QA by the preceding Friday for Monday launch.
2. **Content QA:** Fact-check against the UK Parliament website, GOV.UK, Hansard, and the Electoral Commission. Validate every hyperlink and statistic.
3. **Downloadable assets:** Create or update the gated templates one week before publication. Upload to `/public/assets/templates/` with versioned filenames, then update the relevant post module with the slug and asset metadata.
4. **CRM automation:** Configure the `CRM_WEBHOOK_URL` environment variable before launch so gated forms post subscriber data to the CRM or marketing automation workflow.
5. **Publishing checklist:**
   - Merge approved PR and deploy.
   - Run `npm run lint` and `npm run build` in CI (already enforced by Nx) before deploy.
   - After deployment, request the `/sitemap.xml` in production to confirm the new URLs are listed.
   - Submit the updated sitemap to Google Search Console and Bing Webmaster Tools.
   - Post-launch, schedule internal promotion (newsletter, in-app banner, and social) within 24 hours.

## Internal linking & sitemap updates

- Append every new article (and the `/blog` index) to `marketingPages` in `frontend/src/lib/seo.ts` so the Next.js sitemap API surfaces them automatically.
- Refresh hero or footer CTAs to reference the latest article where relevant. Minimum requirement: add the new article to the `/blog` index cards and to at least one contextual link on the homepage hero or "How it works" page.
- Review older articles monthly to insert cross-links to fresh content, particularly where topics overlap (e.g., from the MP lookup guide to the escalation map).

## Measurement

- Track gated asset submissions, scroll depth, and CTA clicks in your analytics platform. Use UTM parameters on CTAs pointing back to `/` or `/writingDesk` to attribute conversions.
- Report monthly on: new subscribers from gated assets, number of MPWriter trials/letters initiated from blog CTAs, and organic landing page visits influenced by interlinking.

