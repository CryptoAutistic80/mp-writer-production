import { ActiveWritingDeskJobResource } from '../../../writing-desk-jobs/writing-desk-jobs.types';

export interface DeepResearchStub {
  content: string;
  chunks: string[];
}

const FALLBACK_ISSUE_DESCRIPTION = 'Not provided.';

export function buildDeepResearchPrompt(
  job: ActiveWritingDeskJobResource,
  options?: { mpName?: string | null },
): string {
  const sections: string[] = [
    'MANDATORY: ALL OUTPUT MUST USE BRITISH ENGLISH SPELLING. We are communicating exclusively with British MPs.',
    '',
    'Role & Objective:',
    '- You are a UK parliamentary research assistant. Compile an evidence dossier that will later inform a persuasive, fact-checked constituent letter to their MP. Do not draft the letter.',
    '',
    'Research Discipline:',
    '- Before gathering facts, produce a five-point search plan: list top queries, target UK sources, and anticipated evidence gaps.',
    '- Execute the plan sequentially, revising it if a lead is empty, and record any adjustments.',
    '',
    'Source & Recency Policy:',
    '- Default to UK primary / authoritative sources (GOV.UK, legislation.gov.uk, ONS, House of Commons Library, Hansard, NAO, OBR, NHS, devolved administrations, UK regulators).',
    '- Capture constituency colour by consulting at least one credible local outlet (e.g. local authority press releases, BBC regional, well-established local newspapers).',
    '- Balance perspective with reputable national journalism (BBC, Financial Times, Guardian, Times, Telegraph, ITV, Sky) and note when national coverage intersects with the constituency.',
    '- Use a non-UK source only if no UK equivalent exists, and explain why that source was necessary.',
    '- Every citation must include title, publisher, publication date, URL, and (when available) an archived link. Prefer publications ≤3 years old; explicitly justify older items.',
    '',
    'Verification Standards:',
    '- Triangulate each material claim with at least two independent sources whenever possible. If triangulation is not feasible, flag the limitation and describe the best available evidence.',
    '- Surface conflicting evidence, compare the sources, and explain how you resolved or weighted the conflict.',
    '',
    'Constituency Lens:',
    '- Highlight constituency or local-authority level statistics and reporting. Explain the local impact succinctly and why it matters for this MP.',
    '',
    'MP Dossier:',
    "- Summarise the MP's recent votes, Hansard interventions, committee roles, APPG memberships, stated priorities, and relevant interests. Tie each to potential persuasion angles.",
    '',
    'Counterarguments:',
    '- List likely counterarguments (government, opposition, third parties) and provide concise, evidence-backed rebuttals with citations.',
    '',
    'Policy Levers:',
    '- Map findings to concrete levers: responsible departments or ministries, regulators, funding schemes, statutes (with section numbers), upcoming consultations, or oversight bodies.',
    '',
    'Evidence Quality:',
    '- Assign a confidence rating to every key claim (High = multiple recent primary/authoritative sources; Medium = limited corroboration or older data; Low = single or lower-quality source) and justify the rating in one sentence.',
    '',
    'Handover Package for Letter Drafting (inputs only — do not draft prose):',
    '- Problem framing (1–2 sentences)',
    '- Three strongest evidence bullets (each with [#] citation tags)',
    '- Specific ask(s) the MP should pursue',
    '- MP-relevant angle (why this MP should care)',
    '- Recommended tone for the eventual letter',
    '',
    'Output Structure (use numeric citations [1], [2], … consistently across all sections and the bibliography):',
    '1) Executive snapshot (≤120 words)',
    '2) Key findings (bulleted, each with [#])',
    '3) Evidence table (Claim | Evidence summary | Citation [#] | Confidence)',
    '4) MP profile & persuasive angles',
    '5) Counterarguments & rebuttals',
    '6) Policy levers & pathways',
    '7) Evidence gaps & further research',
    '8) Bibliography (numbered list aligned with citation tags, providing full citation details per the policy)',
    '',
    'Machine-Readable Summary (append verbatim):',
    '- Emit a valid JSON object (double-quoted keys/strings) exactly once:',
    '  {',
    '    "summary": "...",',
    '    "strongest_points": ["...", "...", "..."],',
    '    "asks": ["..."],',
    '    "mp_profile": "...",',
    '    "angles": ["..."],',
    '    "counterarguments": [',
    '      {"claim": "...", "rebuttal": "...", "citations": [1,2]}',
    '    ],',
    '    "policy_levers": [',
    '      {"lever": "...", "owner": "...", "citation": 3}',
    '    ],',
    '    "references": [',
    '      {"id": 1, "title": "...", "publisher": "...", "date": "...", "url": "...", "archived_url": "..."}',
    '    ]',
    '  }',
    '- Ensure citation numbers in the JSON align with the bibliography.',
    '',
    'Formatting Expectations:',
    '- Use clear headings and bullet lists exactly where specified.',
    '- Only the Evidence table may use pipe-format table syntax.',
    '- Keep prose concise and avoid filler or hypothetical content.',
    '',
    `Constituent description: ${normalisePromptField(job.form?.issueDescription, FALLBACK_ISSUE_DESCRIPTION)}`,
  ];

  const mpName = typeof options?.mpName === 'string' ? options.mpName.trim() : '';
  if (mpName) {
    sections.push(
      '',
      `Target MP: ${mpName}`,
      `Include a brief profile of ${mpName}, covering their background, priorities, and recent parliamentary activity relevant to this issue.`,
      `Identify persuasive angles that could help ${mpName} empathise with the constituent's situation (shared priorities, constituency impact, past statements, or committee work).`,
    );
  }

  if (Array.isArray(job.followUpQuestions) && job.followUpQuestions.length > 0) {
    sections.push('', 'Additional Context from Q&A:');
    job.followUpQuestions.forEach((question, index) => {
      const answer = job.followUpAnswers?.[index] ?? '';
      const q = question?.trim?.() ?? '';
      const a = answer?.trim?.() ?? '';
      sections.push(`Q${index + 1}: ${q || 'No question provided.'}`);
      sections.push(`A${index + 1}: ${a || 'No answer provided.'}`);
    });
  }

  if (job.notes?.trim()) {
    sections.push('', `Notes: ${job.notes.trim()}`);
  }

  sections.push(
    '',
    'Output Requirements:',
    '- Group evidence by theme or timeline using short paragraphs or bullet lists.',
    '- Include inline citations with source name and URL for every statistic, quote, or claim.',
    '- Prioritise authoritative sources (government publications, official statistics, reputable journalism).',
    '- Highlight material published within the last three years whenever available.',
    '- Call out any gaps in public evidence instead of guessing.',
  );

  return sections.join('\n');
}

export function buildDeepResearchStub(
  job: ActiveWritingDeskJobResource,
  options?: { mpName?: string | null },
): DeepResearchStub {
  const mpName = typeof options?.mpName === 'string' ? options.mpName.trim() : '';
  const lines = [
    'DEV-STUB deep research summary (no external research was performed).',
    '',
    `• Issue summary: ${truncateForStub(job.form?.issueDescription)}`,
    '',
    'Suggested evidence to look for:',
    '1. Recent government or regulator statistics quantifying the scale of the issue.',
    '2. Quotes from reputable organisations, MPs, or investigative journalism covering the topic.',
    '3. Current policy commitments or funding schemes that relate to the requested outcome.',
    '',
    mpName
      ? `Target MP (${mpName}): Research their background, interests, and public statements to find empathy hooks.`
      : 'Target MP: Add notes about your MP to tailor the evidence and empathy angles.',
    '',
    'Sources to consider:',
    '- GOV.UK and departmental research portals (latest releases).',
    '- Office for National Statistics datasets relevant to the subject.',
    '- Reputable national journalism such as the BBC, The Guardian, or Financial Times.',
  ];

  const content = lines.join('\n');
  const chunks = [
    `${lines[0]}\n\n`,
    `${lines[2]}\n${lines[3]}\n${lines[4]}\n\n`,
    `${lines[6]}\n${lines[7]}\n${lines[8]}\n${lines[9]}\n\n`,
    `${lines[11]}\n\n`,
    `${lines[13]}\n${lines[14]}\n${lines[15]}\n${lines[16]}`,
  ];

  return { content, chunks };
}

function normalisePromptField(value: string | null | undefined, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function truncateForStub(value: string | null | undefined): string {
  if (typeof value !== 'string') return FALLBACK_ISSUE_DESCRIPTION;
  const trimmed = value.trim();
  if (trimmed.length <= 160) {
    return trimmed || FALLBACK_ISSUE_DESCRIPTION;
  }
  return `${trimmed.slice(0, 157)}…`;
}


