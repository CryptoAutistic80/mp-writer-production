import type { BlogPost } from './types';

export const howToFindYourMp: BlogPost = {
  slug: 'how-to-find-your-mp-uk',
  title: 'How to find your MP in the UK (and confirm every contact channel)',
  heroKicker: 'Constituent essentials',
  heroDescription:
    'A detailed walkthrough for locating your Member of Parliament, validating their details, and preparing to contact them with confidence.',
  excerpt:
    'Use official registers, government data, and practical checklists to confirm who represents you, which inbox they monitor, and how to get a fast response.',
  publishedAt: '2025-01-06',
  readingTimeMinutes: 13,
  wordCount: 1650,
  introduction: [
    `Before you compose a letter, you need absolute certainty about who represents your constituency and how their office prefers to receive correspondence. MPs cover specific geographic areas, and their staff maintain multiple channels that change more often than you would expect. This guide shows you how to pinpoint your MP, verify every contact detail, and avoid the dead inboxes that slow urgent cases.`,
    `You will lean on authoritative datasets — the UK Parliament register, GOV.UK departmental directories, and the Electoral Commission postcode finder — alongside local intelligence such as constituency surgery listings. Every step feeds into <a href="/" class="micro-link">MPWriter</a>, so by the time you open the Writing Desk you have the right name, salutation, and follow-up plan ready.`,
    `Set aside 30–40 minutes to work through the process. You will leave with a verified list of email addresses, postal details, and surgery times, plus a downloadable Constituency Contact Checklist you can reuse whenever you need to escalate a concern.`,
  ],
  sections: [
    {
      id: 'why-verification-matters',
      title: 'Why verification matters before you write',
      content: [
        `MP offices triage hundreds of messages a week. If you misaddress your letter or send it to an unmanned inbox, you lose the momentum that turns concern into action. Caseworkers often prioritise constituents who demonstrate that they understand the MP's remit, include accurate contact information, and reference up-to-date issues. Taking time now prevents bounced emails, missed deadlines, and duplicated work later.`,
        `Verification is also a safeguarding step. When you handle sensitive details — for example, urgent housing issues or welfare concerns — you must be sure that the recipient is genuinely connected to Parliament. Phishing attempts mimicking MPs do exist. Relying on the official registers below removes guesswork and protects your personal data.`,
      ],
    },
    {
      id: 'collect-your-basics',
      title: 'Collect your basics first',
      content: [
        `Start with your own information. Constituency boundaries shifted at the 2024 general election, so even long-term residents should reconfirm their details. Having everything written down saves time when you move into MPWriter's guided prompts.`,
      ],
      checklist: [
        'Your full residential address, including postcode.',
        'Any previous addresses in the last 12 months (for boundary changes).',
        'Preferred phone number and secure email address.',
        'Summary of the issue you plan to raise (one sentence for now).',
        'Key dates, reference numbers, or case IDs linked to your concern.',
      ],
      callout:
        'Tip: Store this information securely in MPWriter\'s account dashboard so you can re-use it for future letters without retyping.',
    },
    {
      id: 'electoral-commission-lookup',
      title: 'Step 1 — Confirm your constituency using the Electoral Commission',
      content: [
        `Head to the <a href="https://www.electoralcommission.org.uk/i-am-a/voter/your-election-information" rel="noreferrer" target="_blank">Electoral Commission\'s postcode lookup</a>. Enter your home postcode and select the most recent election. The tool lists your constituency name and the elections you are eligible to vote in. Screenshot or note the constituency; MPWriter uses it to fetch research relevant to your area.`,
      ],
      steps: [
        {
          title: 'Capture the constituency name',
          description: [
            `Record the exact constituency title, including any directional or locality qualifiers (for example, \'Bristol Central\' instead of simply \'Bristol\'). Consistency matters when you cite the area in your letter or search Hansard for debates involving your MP.`,
          ],
        },
        {
          title: 'Note the electoral registration office',
          description: [
            `The lookup also lists your local authority or electoral registration office. Keep their contact details. They can confirm boundary questions and provide evidence letters if you are dealing with complex residency issues.`,
          ],
        },
      ],
    },
    {
      id: 'use-parliament-register',
      title: 'Step 2 — Use the official UK Parliament register',
      content: [
        `With your constituency confirmed, move to the <a href="https://members.parliament.uk/FindYourMP" rel="noreferrer" target="_blank">UK Parliament \"Find MPs\" service</a>. Enter your postcode again; the tool returns your MP\'s name, party, portrait, and contact routes. This is the canonical source maintained by Parliament and should be your baseline record.`,
      ],
      steps: [
        {
          title: 'Log every published channel',
          description: [
            `Copy the parliamentary email address (usually ending in <code>@parliament.uk</code>), Westminster office phone number, constituency office details, and any link to a personal website. Paste these directly into the Constituency Contact Checklist.`,
          ],
        },
        {
          title: 'Check committee and ministerial roles',
          description: [
            `Scroll down to see if your MP holds additional positions. Committee memberships or ministerial posts can change how their office handles casework. Note anything relevant; MPWriter can reference these roles in your opening paragraph to show situational awareness.`,
          ],
        },
        {
          title: 'Download Hansard profile',
          description: [
            `Click the Hansard link within the profile to open the MP\'s speeches and written questions. Bookmark it. Later, when you cite previous statements in your letter, you can quote directly from this authoritative source.`,
          ],
        },
      ],
    },
    {
      id: 'verify-constituency-office',
      title: 'Step 3 — Verify constituency office details locally',
      content: [
        `Constituency offices sometimes change venues or temporary hours. Cross-check the Parliament listing with local sources. Most MPs maintain Facebook pages, newsletters, or announcements via the local party. You only need to confirm that the address and surgery timings you plan to use are current.`,
      ],
      steps: [
        {
          title: 'Search the MP\'s official site and social feeds',
          description: [
            `Look for posts that mention \"advice surgery\" or \"constituency office\". Note the latest dates. If something looks outdated, call the office number to confirm. Include the verified opening hours in your checklist so you can plan phone follow-ups.`,
          ],
        },
        {
          title: 'Check local press or council updates',
          description: [
            `Local media often covers office moves or temporary closures. A quick search of your MP\'s name plus \"office\" in local newspapers can save wasted journeys, especially if you intend to deliver documents in person.`,
          ],
        },
      ],
    },
    {
      id: 'capture-digital-channels',
      title: 'Step 4 — Capture digital contact channels',
      content: [
        `Beyond email, many MPs use structured web forms to triage casework. These forms typically request proof of residency (like a postcode) and limit attachments, but they deliver straight into the case management system. Record them so you can decide the best route for your issue.`,
      ],
      steps: [
        {
          title: 'Locate constituency web forms',
          description: [
            `On the MP\'s official site, look for \"Contact\" or \"Casework\" pages. Copy the URL, note any form-specific requirements (maximum word counts, document size limits), and record them in the checklist.`,
          ],
        },
        {
          title: 'Document accessibility channels',
          description: [
            `If you or someone you support needs accessible formats, check whether the MP provides BSL drop-ins, telephone surgeries, or text relay numbers. The Equality Act requires reasonable adjustments, and flagging the right channel early accelerates support.`,
          ],
        },
      ],
    },
    {
      id: 'cross-verify-with-theyworkforyou',
      title: 'Step 5 — Cross-verify with civic tech databases',
      content: [
        `Independent civic tech services like <a href="https://www.theyworkforyou.com/" rel="noreferrer" target="_blank">TheyWorkForYou</a> and <a href="https://www.writetothem.com/" rel="noreferrer" target="_blank">WriteToThem</a> aggregate MP contact details and can alert you to discrepancies. Use them as a secondary check, particularly if the official site is down or slow.`,
      ],
      steps: [
        {
          title: 'Compare recorded email addresses',
          description: [
            `If TheyWorkForYou lists a different inbox, double-check with the Westminster office. MPs sometimes use campaign-specific addresses during elections. Only use the official parliamentary address for casework unless the office explicitly instructs otherwise.`,
          ],
        },
        {
          title: 'Review responsiveness metrics',
          description: [
            `TheyWorkForYou publishes engagement stats, including how often MPs respond to letters via the platform. These indicators help you set expectations and plan follow-up reminders in MPWriter.`,
          ],
        },
      ],
    },
    {
      id: 'organise-your-notes',
      title: 'Organise everything inside MPWriter',
      content: [
        `Once you have verified all channels, open <a href="/writingDesk" class="micro-link">MPWriter\'s Writing Desk</a> and create a new letter. Paste the constituency details into the contact information panel. MPWriter stores your references securely, making it easy to reuse them for follow-ups or future campaigns.`,
        `Tag your letter draft with the issue category (housing, health, education) so the research engine surfaces tailored evidence. Attach your Constituency Contact Checklist as a note so you can revisit it before you send the letter or plan a surgery visit.`,
      ],
    },
    {
      id: 'template-email',
      title: 'Quick email template to request confirmation from the MP office',
      content: [
        `If you want to double-check that you have the correct address before sending sensitive information, use this short email. It introduces you as a constituent and requests confirmation of the best channel for the full letter.`,
      ],
      template: {
        heading: 'MP contact confirmation email',
        description: 'Adapt this script inside MPWriter or your email client before sending.',
        body: `Subject: Confirming the best contact channel for casework\n\nDear [MP\'s name] office,\n\nI live in [constituency name] and am preparing to write to [MP\'s name] regarding [issue headline]. Before I send supporting documents, could you confirm the preferred email address or secure upload method for casework?\n\nI have confirmed the Westminster and constituency contact details listed on members.parliament.uk dated [today\'s date], and want to ensure I use the channel your team monitors most closely.\n\nThank you for confirming,\n[Your name]\n[Postcode]\n[Phone number]`,
      },
    },
    {
      id: 'prepare-for-follow-up',
      title: 'Schedule follow-ups and log consent',
      content: [
        `An initial email is only the start. Use MPWriter\'s reminder feature or your calendar to schedule a follow-up if you have not received acknowledgement within 10 working days. Log any consent statements if you are including third-party information (for example, writing on behalf of a neighbour). This protects you and helps caseworkers move faster.`,
        `If you gathered personal data from others, store consent notes securely. You can reference the <a href="https://ico.org.uk/for-the-public/personal-information/" rel="noreferrer" target="_blank">Information Commissioner\'s Office guidance</a> to ensure you meet privacy obligations.`,
      ],
    },
    {
      id: 'ready-to-draft',
      title: 'Move into drafting with confidence',
      content: [
        `With the groundwork complete, you are ready to draft. Launch a new MPWriter session, paste your verified contact list into the notes field, and let the AI-assisted research surface citations. Because you already know how and where to send the letter, you can focus on the story, evidence, and request that will persuade your MP to act.`,
        `Remember to attach your checklist when you download the final letter. Constituency offices appreciate when constituents provide organised, thorough context — it reduces back-and-forth and earns faster action on your behalf.`,
      ],
    },
  ],
  faqs: [
    {
      question: 'How do I check if my MP has changed after a boundary review?',
      answer:
        'Use the Electoral Commission postcode lookup first, then confirm on members.parliament.uk. Boundary reviews can swap MPs even if your town name stayed the same, so always confirm both sources after a general election.',
    },
    {
      question: 'Can I contact an MP who is not mine if they speak on my issue?',
      answer:
        'You may send information to other MPs, but they are not obliged to act. Constituency MPs prioritise their own residents. Use MPWriter to tailor your ask to your elected representative and reference any other MPs for awareness only.',
    },
    {
      question: 'What if the parliamentary email address bounces?',
      answer:
        'Call the Westminster office number listed on members.parliament.uk to confirm a new address. Some MPs temporarily redirect during staff changes. Update your MPWriter notes and resend once you receive confirmation.',
    },
    {
      question: 'How do I share sensitive documents securely?',
      answer:
        'Ask the office whether they use encrypted upload portals or prefer recorded delivery. Do not email unredacted personal data unless the office explicitly confirms the method meets their security requirements.',
    },
  ],
  assets: [
    {
      slug: 'constituency-contact-checklist',
      title: 'Constituency Contact Checklist',
      description: 'Download the ten-point checklist to verify every MP contact route before you share personal information.',
    },
  ],
  relatedLinks: [
    { label: 'Write an effective MP letter that gets read', href: '/blog/write-an-effective-mp-letter' },
    { label: 'Start a letter with MPWriter', href: '/' },
    { label: 'Track your MP\'s debates on Hansard', href: 'https://hansard.parliament.uk/' },
  ],
};
