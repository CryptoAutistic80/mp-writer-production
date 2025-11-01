import {
  ActiveWritingDeskJobResource,
  WritingDeskLetterTone,
} from '../../writing-desk-jobs/writing-desk-jobs.types';
import {
  LETTER_RESPONSE_SCHEMA,
  LETTER_SYSTEM_PROMPT,
  LETTER_TONE_DETAILS,
  LETTER_TONE_REQUEST_PREFIX,
  LETTER_TONE_SIGN_OFFS,
} from './letter.constants';

export interface LetterContext {
  mpName: string;
  mpAddress1: string;
  mpAddress2: string;
  mpCity: string;
  mpCounty: string;
  mpPostcode: string;
  constituency: string;
  senderName: string;
  senderAddress1: string;
  senderAddress2: string;
  senderAddress3: string;
  senderCity: string;
  senderCounty: string;
  senderPostcode: string;
  senderTelephone: string;
  today: string;
}

export const getLetterToneDetail = (tone: WritingDeskLetterTone) =>
  LETTER_TONE_DETAILS[tone] ?? LETTER_TONE_DETAILS.neutral;

export const getLetterToneSignOff = (tone: WritingDeskLetterTone) =>
  LETTER_TONE_SIGN_OFFS[tone] ?? LETTER_TONE_SIGN_OFFS.neutral;

export const getLetterToneRequestPrefix = (tone: WritingDeskLetterTone) =>
  LETTER_TONE_REQUEST_PREFIX[tone] ?? LETTER_TONE_REQUEST_PREFIX.neutral;

export const buildLetterPrompt = (params: {
  job: ActiveWritingDeskJobResource;
  tone: WritingDeskLetterTone;
  context: LetterContext;
  research: string;
}): string => {
  const { job, tone, context, research } = params;
  const toneDetail = getLetterToneDetail(tone);
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
    `MP profile:\n- Name: ${context.mpName || 'Unknown'}\n- Constituency: ${
      context.constituency || 'Unknown'
    }\n- Parliamentary address line 1: ${context.mpAddress1 || ''}\n- Parliamentary address line 2: ${
      context.mpAddress2 || ''
    }\n- Parliamentary city: ${context.mpCity || ''}\n- Parliamentary county: ${
      context.mpCounty || ''
    }\n- Parliamentary postcode: ${context.mpPostcode || ''}`,
    `Sender profile:\n- Name: ${context.senderName || ''}\n- Address line 1: ${
      context.senderAddress1 || ''
    }\n- Address line 2: ${context.senderAddress2 || ''}\n- Address line 3: ${
      context.senderAddress3 || ''
    }\n- City: ${context.senderCity || ''}\n- County: ${context.senderCounty || ''}\n- Postcode: ${
      context.senderPostcode || ''
    }`,
    `Sender profile:\n- Name: ${context.senderName || ''}\n- Address line 1: ${
      context.senderAddress1 || ''
    }\n- Address line 2: ${context.senderAddress2 || ''}\n- Address line 3: ${
      context.senderAddress3 || ''
    }\n- City: ${context.senderCity || ''}\n- County: ${context.senderCounty || ''}\n- Postcode: ${
      context.senderPostcode || ''
    }\n- Telephone: ${context.senderTelephone || ''}`,
    `User intake description:\n${intake}`,
    `Follow-up details:\n${followUpSection}`,
    `Deep research findings:\n${researchSection}`,
  ];

  return sections.join('\n\n');
};

export const buildLetterSystemPrompt = (): string => LETTER_SYSTEM_PROMPT;

export const buildLetterResponseSchema = (
  context: LetterContext,
  normaliseTypography: (value: string) => string,
) => {
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
};
