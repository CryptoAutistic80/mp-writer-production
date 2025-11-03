import { WritingDeskLetterTone } from '../types';

export type WritingDeskStepKey = 'issueDescription';

export type WritingDeskFormState = Record<WritingDeskStepKey, string>;

export type WritingDeskResearchStatus = 'idle' | 'running' | 'completed' | 'error';

export type WritingDeskLetterPhase = 'idle' | 'tone' | 'streaming' | 'completed' | 'error';

export const WRITING_DESK_STEPS: Array<{
  key: WritingDeskStepKey;
  title: string;
  description: string;
  placeholder: string;
}> = [
  {
    key: 'issueDescription',
    title: 'Tell us everything — feel free to vent',
    description:
      'This is your space to get it all out. Who is affected, what’s happened, why it matters, what you’ve tried, and what you want your MP to do. The more detail, the better.',
    placeholder:
      'Start from the beginning — what’s going on, how it’s affecting you or others, what you’ve already done, timelines, names or departments if relevant, and what outcome you need. If it’s easier, use the mic button to speak and we’ll transcribe…',
  },
];

export const WRITING_DESK_INITIAL_FORM_STATE: WritingDeskFormState = {
  issueDescription: '',
};

export const WRITING_DESK_LETTER_TONE_LABELS: Record<
  WritingDeskLetterTone,
  { label: string; description: string; icon: string }
> = {
  formal: {
    label: 'Formal',
    description: 'Traditional parliamentary tone: respectful, precise, and structured.',
    icon: '🏛️',
  },
  polite_but_firm: {
    label: 'Polite but firm',
    description: 'Courteous but clear about expectations and urgency.',
    icon: '🤝',
  },
  empathetic: {
    label: 'Empathetic',
    description: 'Centres the human impact with warmth and compassion.',
    icon: '💗',
  },
  urgent: {
    label: 'Urgent',
    description: 'Direct and time-sensitive while remaining respectful.',
    icon: '⏰',
  },
  neutral: {
    label: 'Neutral',
    description: 'Calm, factual tone that lets the evidence speak for itself.',
    icon: '📄',
  },
  highly_persuasive: {
    label: 'Highly persuasive',
    description: 'Confident, evidence-led case designed to motivate decisive action.',
    icon: '🎯',
  },
};

export const WRITING_DESK_FOLLOW_UP_CREDIT_COST = 0.1;
export const WRITING_DESK_DEEP_RESEARCH_CREDIT_COST = 0.7;
export const WRITING_DESK_LETTER_CREDIT_COST = 0.2;

export const createLetterRunId = (): string => {
  if (typeof window !== 'undefined' && window.crypto && typeof window.crypto.randomUUID === 'function') {
    return window.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
};

export const MAX_WRITING_DESK_RESEARCH_ACTIVITY_ITEMS = 10;
export const MAX_WRITING_DESK_LETTER_REASONING_ITEMS = 3;

export const extractReasoningSummary = (value: unknown): string | null => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const summary = extractReasoningSummary(item);
      if (summary) return summary;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferredKeys = ['summary', 'text', 'message', 'content', 'output_text', 'value', 'delta'];

    for (const key of preferredKeys) {
      if (key in record) {
        const summary = extractReasoningSummary(record[key]);
        if (summary) return summary;
      }
    }

    for (const [key, item] of Object.entries(record)) {
      if (key === 'type' || key === 'event_type') continue;
      const summary = extractReasoningSummary(item);
      if (summary) return summary;
    }
  }

  return null;
};

type ResearchEventLike = { type?: string; [key: string]: any };

export const describeResearchEvent = (event: ResearchEventLike): string | null => {
  if (!event || typeof event.type !== 'string') return null;
  switch (event.type) {
    case 'response.web_search_call.searching':
      return 'Searching the web for relevant sources…';
    case 'response.web_search_call.in_progress':
      return 'Reviewing a web result…';
    case 'response.web_search_call.completed':
      return 'Finished reviewing a web result.';
    case 'response.file_search_call.searching':
      return 'Searching private documents for supporting evidence…';
    case 'response.file_search_call.completed':
      return 'Finished reviewing private documents.';
    case 'response.code_interpreter_call.in_progress':
      return 'Analysing data with the code interpreter…';
    case 'response.code_interpreter_call.completed':
      return 'Completed data analysis via code interpreter.';
    case 'response.reasoning.delta': {
      const summary = extractReasoningSummary(event.delta ?? event);
      return summary ?? null;
    }
    case 'response.reasoning.done': {
      const summary = extractReasoningSummary(event.reasoning ?? event.delta ?? event);
      return summary ?? 'Reasoning summary updated.';
    }
    case 'response.reasoning_summary.delta':
    case 'response.reasoning_summary_text.delta':
    case 'response.reasoning_summary_part.added':
      return null;
    case 'response.reasoning_summary.done':
    case 'response.reasoning_summary_text.done': {
      const summary = extractReasoningSummary(event.text ?? event.summary ?? event.delta ?? event);
      if (!summary) return null;
      const trimmed = summary.trim();
      return trimmed.length > 3 ? trimmed : null;
    }
    case 'response.reasoning_summary_part.done': {
      const summary = extractReasoningSummary(event.part ?? event);
      if (!summary) return null;
      const trimmed = summary.trim();
      return trimmed.length > 3 ? trimmed : null;
    }
    case 'resume_attempt': {
      const message = event.message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message.trim();
      }
      return null;
    }
    case 'quiet_period': {
      const message = event.message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message.trim();
      }
      return null;
    }
    default:
      return null;
  }
};

export const formatCredits = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
};
