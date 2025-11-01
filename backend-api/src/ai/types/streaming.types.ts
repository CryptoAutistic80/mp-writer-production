import type { ReplaySubject } from 'rxjs';
import type { ResponseStreamEvent } from 'openai/resources/responses/responses';
import type { WritingDeskLetterTone } from '../../writing-desk-jobs/writing-desk-jobs.types';

export interface DeepResearchRequestExtras {
  tools?: Array<Record<string, unknown>>;
  max_tool_calls?: number;
  reasoning?: {
    summary?: 'auto' | 'disabled' | null;
    effort?: 'low' | 'medium' | 'high';
  };
}

export type DeepResearchStreamPayload =
  | { type: 'status'; status: string; remainingCredits?: number | null }
  | { type: 'delta'; text: string }
  | { type: 'event'; event: Record<string, unknown> }
  | {
      type: 'complete';
      content: string;
      responseId: string | null;
      remainingCredits: number | null;
      usage?: Record<string, unknown> | null;
    }
  | { type: 'error'; message: string; remainingCredits?: number | null };

export type DeepResearchRunStatus = 'running' | 'completed' | 'error';

export interface DeepResearchRun {
  key: string;
  userId: string;
  jobId: string;
  subject: ReplaySubject<DeepResearchStreamPayload>;
  status: DeepResearchRunStatus;
  startedAt: number;
  cleanupTimer: NodeJS.Timeout | null;
  promise: Promise<void> | null;
  responseId: string | null;
}

export type ResponseStreamLike = AsyncIterable<ResponseStreamEvent> & {
  controller?: { abort: () => void };
};

export type LetterStreamPayload =
  | { type: 'status'; status: string; remainingCredits?: number | null }
  | { type: 'event'; event: Record<string, unknown> }
  | { type: 'delta'; text: string }
  | { type: 'letter_delta'; html: string }
  | {
      type: 'complete';
      letter: LetterCompletePayload;
      remainingCredits: number | null;
    }
  | { type: 'error'; message: string; remainingCredits?: number | null };

export interface WritingDeskLetterResult {
  mp_name: string;
  mp_address_1: string;
  mp_address_2: string;
  mp_city: string;
  mp_county: string;
  mp_postcode: string;
  date: string;
  subject_line_html: string;
  letter_content: string;
  sender_name: string;
  sender_address_1: string;
  sender_address_2: string;
  sender_address_3: string;
  sender_city: string;
  sender_county: string;
  sender_postcode: string;
  sender_phone: string;
  references: string[];
}

export interface LetterCompletePayload {
  mpName: string;
  mpAddress1: string;
  mpAddress2: string;
  mpCity: string;
  mpCounty: string;
  mpPostcode: string;
  date: string;
  subjectLineHtml: string;
  letterContent: string;
  senderName: string;
  senderAddress1: string;
  senderAddress2: string;
  senderAddress3: string;
  senderCity: string;
  senderCounty: string;
  senderPostcode: string;
  senderTelephone: string;
  references: string[];
  responseId: string | null;
  tone: WritingDeskLetterTone;
  rawJson: string;
}

export type LetterRunStatus = 'running' | 'completed' | 'error';

export interface LetterRun {
  key: string;
  userId: string;
  jobId: string;
  tone: WritingDeskLetterTone;
  subject: ReplaySubject<LetterStreamPayload>;
  status: LetterRunStatus;
  startedAt: number;
  cleanupTimer: NodeJS.Timeout | null;
  promise: Promise<void> | null;
  responseId: string | null;
  remainingCredits: number | null;
}

export interface LetterDocumentInput {
  mpName?: string | null;
  mpAddress1?: string | null;
  mpAddress2?: string | null;
  mpCity?: string | null;
  mpCounty?: string | null;
  mpPostcode?: string | null;
  date?: string | null;
  subjectLineHtml?: string | null;
  letterContentHtml?: string | null;
  senderName?: string | null;
  senderAddress1?: string | null;
  senderAddress2?: string | null;
  senderAddress3?: string | null;
  senderCity?: string | null;
  senderCounty?: string | null;
  senderPostcode?: string | null;
  senderTelephone?: string | null;
  references?: string[] | null;
}

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
