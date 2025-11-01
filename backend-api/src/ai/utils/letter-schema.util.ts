import type { ActiveWritingDeskJobResource, WritingDeskLetterTone } from '../../writing-desk-jobs/writing-desk-jobs.types';
import type { LetterContext } from '../types/streaming.types';

export const LETTER_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    mp_name: {
      type: 'string',
      description: "Full name of the Member of Parliament.",
    },
    mp_address_1: {
      type: 'string',
      description: "First line of the MP's address.",
    },
    mp_address_2: {
      type: 'string',
      description: "Second line of the MP's address.",
    },
    mp_city: {
      type: 'string',
      description: "City of the MP's address.",
    },
    mp_county: {
      type: 'string',
      description: "County of the MP's address.",
    },
    mp_postcode: {
      type: 'string',
      description: "Post code of the MP's address.",
    },
    date: {
      type: 'string',
      description: 'Date the letter is written (ISO 8601 format recommended).',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
    subject_line_html: {
      type: 'string',
      description:
        'HTML paragraph containing the subject line, starting with a bold "Subject:" label.',
      pattern: '^\\s*<p>\\s*<strong>Subject:</strong>.*</p>\\s*$',
    },
    letter_content: {
      type: 'string',
      description: 'The text body of the letter.',
    },
    sender_name: {
      type: 'string',
      description: 'Name of the person sending the letter.',
    },
    sender_address_1: {
      type: 'string',
      description: "First line of the sender's address.",
    },
    sender_address_2: {
      type: 'string',
      description: "Second line of the sender's address.",
    },
    sender_address_3: {
      type: 'string',
      description: "Third line of the sender's address.",
    },
    sender_city: {
      type: 'string',
      description: "City of the sender's address.",
    },
    sender_county: {
      type: 'string',
      description: "County of the sender's address.",
    },
    sender_postcode: {
      type: 'string',
      description: "Post code of the sender's address.",
    },
    sender_phone: {
      type: 'string',
      description: "Telephone number for the sender, shown beneath the postal address.",
    },
    references: {
      type: 'array',
      description:
        'List of full, properly formatted URLs used as references. URLs must be complete with protocol (https://) and should NOT be percent-encoded - use plain characters for special symbols like #, :, ~, and = in URL fragments.',
      items: {
        type: 'string',
        description:
          'A complete, unencoded URL with protocol (e.g. https://example.com/path#:~:text=quote). Do not percent-encode special characters in URL fragments.',
      },
    },
  },
  required: [
    'mp_name',
    'mp_address_1',
    'mp_address_2',
    'mp_city',
    'mp_county',
    'mp_postcode',
    'date',
    'subject_line_html',
    'letter_content',
    'sender_name',
    'sender_address_1',
    'sender_address_2',
    'sender_address_3',
    'sender_city',
    'sender_county',
    'sender_postcode',
    'sender_phone',
    'references',
  ],
  additionalProperties: false,
} as const;

export const LETTER_TONE_DETAILS: Record<
  WritingDeskLetterTone,
  { label: string; prompt: string }
> = {
  formal: {
    label: 'Formal',
    prompt:
      'Write with formal parliamentary etiquette: respectful, precise, and structured with clear paragraphs.',
  },
  polite_but_firm: {
    label: 'Polite but firm',
    prompt:
      'Maintain polite language while firmly emphasising the urgency and expectation of action.',
  },
  empathetic: {
    label: 'Empathetic',
    prompt:
      'Adopt a compassionate tone that centres the human impact while remaining respectful and solution-focused.',
  },
  urgent: {
    label: 'Urgent',
    prompt:
      'Convey urgency and seriousness without being aggressive. Keep sentences direct and compelling.',
  },
  neutral: {
    label: 'Neutral',
    prompt:
      'Use clear, matter-of-fact language that presents evidence and requests without emotional colouring.',
  },
  highly_persuasive: {
    label: 'Highly persuasive',
    prompt:
      'Craft a confident, compelling argument that highlights benefits, anticipated outcomes, and stakes while remaining respectful and evidence-led.',
  },
};

export const LETTER_TONE_SIGN_OFFS: Record<WritingDeskLetterTone, string> = {
  formal: 'Yours faithfully,',
  polite_but_firm: 'Yours sincerely,',
  empathetic: 'With thanks for your understanding,',
  urgent: 'Yours urgently,',
  neutral: 'Yours sincerely,',
  highly_persuasive: 'With determination,',
};

export const LETTER_TONE_REQUEST_PREFIX: Record<WritingDeskLetterTone, string> = {
  formal: 'I would be grateful if you could',
  polite_but_firm: 'I need you to',
  empathetic: 'I kindly ask that you',
  urgent: 'Please urgently',
  neutral: 'I ask that you',
  highly_persuasive: 'I strongly urge you to',
};

export const LETTER_SYSTEM_PROMPT = `You are generating a UK MP letter using stored MP and sender details plus prior user inputs.

MANDATORY: ALL OUTPUT MUST USE BRITISH ENGLISH SPELLING. We are communicating exclusively with British MPs.

Goals:

1. Return output strictly conforming to the provided JSON schema.
2. Use stored MP profile for mp_* fields and stored sender profile for sender_*.
3. Set date to match the schema's regex: ^\\d{4}-\\d{2}-\\d{2}$.
4. Put the full HTML letter in letter_content. Use semantic HTML only (<p>, <strong>, <em>, lists). Use standard ASCII characters: plain single quotes ('), double quotes ("), and hyphens (-) instead of smart quotes or em-dashes.
5. Write in the tone selected by the user.
6. Draw on all prior inputs: user_intake (issue, who is affected, background, requested action); follow_ups (clarifications); deep_research (facts, citations, URLs).
7. Include only accurate, supportable statements. Add actual URLs used into the references array. IMPORTANT: URLs must be unencoded - use plain text characters for special symbols (# : ~ =) in URL fragments, not percent-encoded versions (%20 %2C %27 etc).
8. If any stored values are missing, output an empty string for that field, but keep the schema valid.
9. Set subject_line_html to a single HTML paragraph that begins with <strong>Subject:</strong> followed immediately by the subject text. Do not prepend extra labels (for example "Urgent:", "Subject -", "For review:"); start with the key topic directly.

Letter content requirements:

* Opening: state the issue and constituency link.
* Body: evidence-led argument in chosen tone.
* Ask: specific, actionable request of the MP.
* Closing: professional and courteous. Sign off using only the sender_name (no addresses or extra details after the name).

Output:
Return only the JSON object defined by the schema. Do not output explanations or text outside the JSON.`;

export function buildLetterSystemPrompt(): string {
  return LETTER_SYSTEM_PROMPT;
}

interface BuildLetterPromptParams {
  job: ActiveWritingDeskJobResource;
  tone: WritingDeskLetterTone;
  context: LetterContext;
  research: string;
}

export function buildLetterPrompt({ job, tone, context, research }: BuildLetterPromptParams): string {
  const toneDetail = LETTER_TONE_DETAILS[tone];
  const intake = job.form?.issueDescription ?? '';
  const followUps = Array.isArray(job.followUpQuestions)
    ? job.followUpQuestions
        .map((question, index) => {
          const answer = job.followUpAnswers?.[index] ?? '';
          if (!question && !answer) return null;
          return `Question: ${question}\nAnswer: ${answer}`;
        })
        .filter((entry): entry is string => !!entry)
    : [];

  const followUpSection =
    followUps.length > 0 ? followUps.join('\n\n') : 'No follow-up questions were required.';

  const researchSection = research || 'No deep research findings were available.';

  const sections = [
    `Selected tone: ${toneDetail.label}. ${toneDetail.prompt}`,
    `Today's date: ${context.today}`,
    `MP profile:\n- Name: ${context.mpName || 'Unknown'}\n- Constituency: ${context.constituency || 'Unknown'}\n- Parliamentary address line 1: ${context.mpAddress1 || ''}\n- Parliamentary address line 2: ${context.mpAddress2 || ''}\n- Parliamentary city: ${context.mpCity || ''}\n- Parliamentary county: ${context.mpCounty || ''}\n- Parliamentary postcode: ${context.mpPostcode || ''}`,
    `Sender profile:\n- Name: ${context.senderName || ''}\n- Address line 1: ${context.senderAddress1 || ''}\n- Address line 2: ${context.senderAddress2 || ''}\n- Address line 3: ${context.senderAddress3 || ''}\n- City: ${context.senderCity || ''}\n- County: ${context.senderCounty || ''}\n- Postcode: ${context.senderPostcode || ''}`,
    `Sender profile:\n- Name: ${context.senderName || ''}\n- Address line 1: ${context.senderAddress1 || ''}\n- Address line 2: ${context.senderAddress2 || ''}\n- Address line 3: ${context.senderAddress3 || ''}\n- City: ${context.senderCity || ''}\n- County: ${context.senderCounty || ''}\n- Postcode: ${context.senderPostcode || ''}\n- Telephone: ${context.senderTelephone || ''}`,
    `User intake description:\n${intake}`,
    `Follow-up details:\n${followUpSection}`,
    `Deep research findings:\n${researchSection}`,
  ];

  return sections.join('\n\n');
}

interface BuildLetterResponseSchemaParams {
  context: LetterContext;
  normaliseTypography: (value: string) => string;
}

export function buildLetterResponseSchema({
  context,
  normaliseTypography,
}: BuildLetterResponseSchemaParams) {
  const schema = JSON.parse(JSON.stringify(LETTER_RESPONSE_SCHEMA)) as Record<string, any>;
  const normalise = (value: string | null | undefined): string => {
    if (typeof value !== 'string') return '';
    return normaliseTypography(value.trim());
  };

  const setFlexibleProperty = (key: string, value: string | null | undefined) => {
    const property = schema.properties?.[key];
    if (!property || typeof property !== 'object') {
      return;
    }
    delete property.const;
    const normalised = normalise(value);
    if (normalised.length > 0) {
      property.default = normalised;
    } else {
      delete property.default;
    }
  };

  setFlexibleProperty('mp_name', context.mpName);
  setFlexibleProperty('mp_address_1', context.mpAddress1);
  setFlexibleProperty('mp_address_2', context.mpAddress2);
  setFlexibleProperty('mp_city', context.mpCity);
  setFlexibleProperty('mp_county', context.mpCounty);
  setFlexibleProperty('mp_postcode', context.mpPostcode);
  setFlexibleProperty('date', context.today);
  setFlexibleProperty('sender_name', context.senderName);
  setFlexibleProperty('sender_address_1', context.senderAddress1);
  setFlexibleProperty('sender_address_2', context.senderAddress2);
  setFlexibleProperty('sender_address_3', context.senderAddress3);
  setFlexibleProperty('sender_city', context.senderCity);
  setFlexibleProperty('sender_county', context.senderCounty);
  setFlexibleProperty('sender_postcode', context.senderPostcode);
  setFlexibleProperty('sender_phone', context.senderTelephone);

  return schema;
}
