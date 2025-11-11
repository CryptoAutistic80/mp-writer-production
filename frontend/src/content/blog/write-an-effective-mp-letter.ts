import type { BlogPost } from './types';

export const writeAnEffectiveMpLetter: BlogPost = {
  slug: 'write-an-effective-mp-letter',
  title: 'Best way to write an effective MP letter that gets read',
  heroKicker: 'Letter writing mastery',
  heroDescription:
    'A comprehensive playbook for planning, drafting, and delivering a persuasive MP letter backed by evidence and a clear request.',
  excerpt:
    'Structure your story, cite authoritative sources, and guide your MP toward decisive action with proven templates, follow-up workflows, and downloadable assets.',
  publishedAt: '2025-01-20',
  readingTimeMinutes: 14,
  wordCount: 1720,
  introduction: [
    `Constituency caseworkers judge letters quickly: they scan for proof you are a constituent, clarity about the issue, credible evidence, and a specific ask. Anything else risks landing in a slow triage queue. This guide shows you exactly how to plan and write a letter that stands out for the right reasons, using the same research-driven approach embedded in <a href="/" class="micro-link">MPWriter</a>.`,
    `You will break the process into three phases — preparation, drafting, and follow-up. Each phase includes step-by-step tasks, template language, and automation tips. Along the way you will reference the UK Parliament petition guidance, GOV.UK policy libraries, and local authority data to ground your argument in verifiable facts.`,
    `Download the Persuasive MP Letter Template when you are ready to start writing. The gated asset integrates with MPWriter's Writing Desk, so once you submit your email you can trigger CRM workflows, schedule reminders, and reuse your personalised template for future campaigns.`,
  ],
  sections: [
    {
      id: 'phase-overview',
      title: 'Overview of the three phases',
      content: [
        `Successful letters follow a predictable rhythm. First you gather insight, then you build the draft with evidence, and finally you manage responses until the case reaches a conclusion. Keeping these phases clear prevents overwhelm and ensures your MP receives everything needed to act.`,
        `MPWriter mirrors this rhythm. The research questions, Writing Desk structure, and follow-up reminders match the steps below. When you stick to the workflow you improve response rates and reduce the need for repeated explanations.`,
      ],
      steps: [
        {
          title: 'Preparation (Days -7 to 0)',
          description: [
            `Collect personal details, evidence, and urgency markers. Confirm your MP\'s contact details using the <a href="/blog/how-to-find-your-mp-uk" class="micro-link">MP lookup guide</a>.`,
          ],
        },
        {
          title: 'Drafting (Day 0)',
          description: [
            `Write the letter, cite authoritative sources, and tailor the tone. Use MPWriter to capture your story, insert research-backed evidence, and export polished formats.`,
          ],
        },
        {
          title: 'Follow-up (Days 7+)',
          description: [
            `Log acknowledgements, send reminders, and escalate if deadlines pass. Track everything in MPWriter or your CRM so nothing slips.`,
          ],
        },
      ],
    },
    {
      id: 'prep-constituent-proof',
      title: 'Phase 1 — Preparation: prove you are a constituent',
      content: [
        `Start by gathering documents that demonstrate constituency status. Caseworkers must record evidence that the person contacting them lives in the MP\'s area. Presenting this upfront accelerates verification and shows respect for their process.`,
      ],
      checklist: [
        'Utility bill or council tax statement showing your current address (scan or photo).',
        'A brief timeline of the issue, with dates and witnesses where relevant.',
        'Key documents such as council letters, DWP references, or medical reports (redact sensitive data).',
        'Your MP\'s verified contact details and preferred channel.',
        'Any previous correspondence or case numbers from the MP\'s office.',
      ],
      callout:
        'Store scans securely. MPWriter allows you to note where evidence is held so you can reference it without emailing sensitive attachments unless requested.',
    },
    {
      id: 'prep-research',
      title: 'Phase 1 — Preparation: research official sources',
      content: [
        `Caseworkers take letters more seriously when you cite recognised authorities. Gather a shortlist of statistics, legal duties, or policy commitments that support your request. Focus on government and parliamentary resources first; they hold the most weight.`,
      ],
      steps: [
        {
          title: 'Search GOV.UK policy libraries',
          description: [
            `Use <a href="https://www.gov.uk/search/policy-papers-and-consultations" rel="noreferrer" target="_blank">GOV.UK\'s policy and consultation search</a> to find recent guidance. Filter by department and publication date to ensure relevance. Highlight key paragraphs that show what should be happening versus what you are experiencing.`,
          ],
        },
        {
          title: 'Check Hansard for MP statements',
          description: [
            `Visit <a href="https://hansard.parliament.uk/" rel="noreferrer" target="_blank">Hansard</a> and search for your MP or the topic. Quoting their past commitment demonstrates accountability and helps the office draft an informed response.`,
          ],
        },
        {
          title: 'Gather local data',
          description: [
            `Local authority dashboards, NHS trusts, and watchdogs such as the <a href="https://www.ombudsman.org.uk/" rel="noreferrer" target="_blank">Local Government & Social Care Ombudsman</a> publish statistics that strengthen your case. Include the latest figures to show scale.`,
          ],
        },
      ],
    },
    {
      id: 'drafting-structure',
      title: 'Phase 2 — Drafting: build a persuasive structure',
      content: [
        `When you enter MPWriter\'s Writing Desk, you will see prompts that map to the classic structure caseworkers expect: introduction, personal story, evidence, and request. Follow that order. Each paragraph should perform a single job.`,
        `Keep sentences concise. Aim for two to three short sentences per paragraph. Use active voice, specify dates, and avoid jargon. If you need to use specialist terminology (for example, referencing Universal Credit regulations), include a brief explanation so staff reading your letter do not need to look it up.`,
      ],
      template: {
        heading: 'Core letter structure inside MPWriter',
        description: 'Use this as a checklist while the Writing Desk guides you through each section.',
        body: `1. Opening paragraph: confirm you are a constituent, state the issue, and flag urgency.\n2. Personal impact: describe how the issue affects you or your community, including dates and real-world consequences.\n3. Evidence: cite two to three authoritative sources (GOV.UK, Hansard, watchdog reports) that show the wider problem.\n4. Requested action: specify exactly what you want your MP to do and any deadline.\n5. Closing: thank them, list attachments, and offer to provide more detail.`,
      },
    },
    {
      id: 'drafting-tone',
      title: 'Phase 2 — Drafting: choose a constructive tone',
      content: [
        `Tone shapes how your letter is perceived. MPs respond faster to letters that are firm but respectful, especially when you acknowledge the pressure their offices operate under. MPWriter\'s tone controls (measured, empathetic, urgent) help you strike the right balance.`,
        `Before finalising, read your draft aloud. Replace any emotionally charged phrases with focused statements about impact and solutions. Anger is understandable, but clarity drives action.`,
      ],
      steps: [
        {
          title: 'Acknowledge positive actions',
          description: [
            `If your MP has previously raised similar issues, mention it. Caseworkers appreciate when constituents recognise ongoing work. This can be as simple as, \"I appreciated your question during the [date] debate on [topic].\"`,
          ],
        },
        {
          title: 'Focus on outcomes',
          description: [
            `Frame your request around tangible outcomes: securing a meeting, raising a parliamentary question, or liaising with a department. Avoid vague phrases like \"do something\" — spell out what action would resolve the issue.`,
          ],
        },
        {
          title: 'Keep it human',
          description: [
            `Blend data with lived experience. A statistic from GOV.UK paired with a short vignette from your life helps the MP communicate the stakes to ministers or local agencies.`,
          ],
        },
      ],
    },
    {
      id: 'drafting-template',
      title: 'Phase 2 — Drafting: apply the downloadable template',
      content: [
        `Download the Persuasive MP Letter Template to accelerate formatting. After you submit your email via the gated form, MPWriter emails a personalised link to the plain-text file and logs the interaction to your CRM workflow. Use the template as a staging area before pasting refined sections into the Writing Desk.`,
        `Within the document you will find headings for each paragraph, prompts for sourcing evidence, and reminders to include your attachments. Pair it with MPWriter\'s AI suggestions to produce a polished letter faster than starting from scratch.`,
      ],
    },
    {
      id: 'include-accessibility',
      title: 'Phase 2 — Drafting: include accessibility and consent statements',
      content: [
        `If your case involves sharing third-party information (for example, advocating for a family member), include a sentence confirming you have consent. This reassures the office they are legally able to act.`,
        `Where relevant, flag any accessibility requirements such as needing easy-read responses or BSL interpretation at meetings. MPs must make reasonable adjustments under the Equality Act 2010, and early notice helps them arrange support.`,
      ],
      template: {
        heading: 'Suggested consent wording',
        description: 'Add this to your letter if you are raising someone else\'s case.',
        body: `I confirm that [name], whose case I describe in this letter, has authorised me to share their information with you and understands that your office may need to contact them directly to progress the matter.`,
      },
    },
    {
      id: 'review-proof',
      title: 'Phase 2 — Drafting: proof and export',
      content: [
        `Before exporting your letter, run through a final proofing checklist. MPWriter highlights sentences that could be clearer and offers alternative phrasings. Accept or reject each suggestion deliberately to keep your voice while tightening the message.`,
        `Export both PDF and DOCX versions. Attach the PDF to your email or upload it via the MP\'s web form. Keep the DOCX in case you need to edit quickly after their reply.`,
      ],
      checklist: [
        'Verify your address and postcode appear in the header or opening paragraph.',
        'Check every hyperlink or citation opens correctly.',
        'List any attachments explicitly in the closing paragraph.',
        'Ensure dates use the UK format (day month year).',
        'Confirm the requested action and deadline stand out in the final draft.',
      ],
    },
    {
      id: 'phase3-overview',
      title: 'Phase 3 — Follow-up: manage replies and escalate when needed',
      content: [
        `A strong letter deserves diligent follow-up. Most MPs acknowledge within 10 working days. If you do not receive a response, polite persistence keeps the issue alive. Log every interaction so you can escalate appropriately if deadlines slip.`,
      ],
      steps: [
        {
          title: 'Log the acknowledgement',
          description: [
            `Save the acknowledgement email or letter in MPWriter or your CRM. Note the reference number and any named caseworker. Use this identifier in future communication to speed up routing.`,
          ],
        },
        {
          title: 'Schedule reminders',
          description: [
            `Set a reminder for 14 days after your first letter. If you have not received a substantive update, send a concise follow-up restating your request and the timeline.`,
          ],
        },
        {
          title: 'Escalate respectfully',
          description: [
            `If deadlines pass (for example, the MP promised to contact a department within four weeks), escalate by referencing the commitment and asking for a revised timeline. For urgent safeguarding issues, phone the constituency office and log the call.`,
          ],
        },
      ],
    },
    {
      id: 'follow-up-template',
      title: 'Follow-up email template',
      content: [
        `Use this email after your initial deadline passes. It reinforces your request while acknowledging the office\'s workload. Paste it into MPWriter to personalise before sending.`,
      ],
      template: {
        heading: 'Seven-day follow-up email',
        description: 'Send this if you have not received an update after the promised timeframe.',
        body: `Subject: Following up on [issue] case reference [reference number]\n\nDear [caseworker name],\n\nThank you for acknowledging my letter about [issue] on [date]. I understand your office is managing a high volume of casework. I am following up to ask whether there is an update on the action requested: [brief reminder of ask].\n\nAs mentioned, this matter is time-sensitive because [reason]. Please let me know if any further information would help you progress the case, or whether you can provide an estimated timeline for next steps.\n\nKind regards,\n[Your name]\n[Postcode]\n[Phone number]`,
      },
    },
    {
      id: 'track-outcomes',
      title: 'Track outcomes and close the loop',
      content: [
        `Once your MP responds or resolves the issue, document the outcome. This provides evidence for future interactions and helps you measure the impact of your advocacy. MPWriter lets you tag the case as resolved, archive supporting documents, and schedule reminders to review progress later.`,
        `If your MP delivers a positive outcome, send a short thank-you note. Building a constructive relationship improves the chances of future collaboration, especially on community-wide issues.`,
      ],
    },
    {
      id: 'optimise-for-digital',
      title: 'Optimise for digital submission and analytics',
      content: [
        `Use descriptive filenames when uploading attachments (for example, <code>2025-01-20-housing-repairs-letter.pdf</code>). This helps caseworkers file your documents correctly.`,
        `Add UTM parameters to links pointing back to <a href="/" class="micro-link">MPWriter</a> or supporting resources. This feeds marketing analytics so your CRM can attribute conversions from the blog to in-app activity.`,
        `After sending, update your sitemap if you published a related article or resource. Keeping the `/sitemap.xml` current helps search engines and constituents discover the latest guidance.`,
      ],
    },
  ],
  faqs: [
    {
      question: 'How long should an MP letter be?',
      answer:
        'Aim for 500–700 words. That is long enough to explain context and evidence without overwhelming caseworkers. If your issue requires more detail, include a concise summary in the letter and attach supporting documents.',
    },
    {
      question: 'Should I send attachments with my first email?',
      answer:
        'Include essential evidence only. Large files can trigger email filters. Mention additional documents in the letter and offer to provide them via the MP\'s preferred secure method.',
    },
    {
      question: 'Do MPs prefer email, post, or web forms?',
      answer:
        'Most MPs prioritise email or web forms because they route directly into casework systems. Use post if you need to send originals, but always keep scanned copies. Confirm preferences using the MP contact guide linked above.',
    },
    {
      question: 'How quickly should I follow up?',
      answer:
        'If you have not received acknowledgement within 10 working days, send a polite follow-up. For urgent safeguarding or welfare cases, phone the constituency office immediately and note who you spoke to.',
    },
    {
      question: 'Can MPWriter send the letter on my behalf?',
      answer:
        'MPWriter prepares research-backed drafts and provides export options, but you send the final letter via your MP\'s official channel. This keeps you in control of consent and follow-up conversations.',
    },
  ],
  assets: [
    {
      slug: 'mp-letter-template',
      title: 'Persuasive MP Letter Template',
      description: 'Enter your email to receive the downloadable plain-text template and trigger your CRM nurture sequence.',
    },
  ],
  relatedLinks: [
    { label: 'Find and verify your MP', href: '/blog/how-to-find-your-mp-uk' },
    { label: 'Start drafting in MPWriter', href: '/' },
    { label: 'GOV.UK policy and consultation finder', href: 'https://www.gov.uk/search/policy-papers-and-consultations' },
  ],
};
