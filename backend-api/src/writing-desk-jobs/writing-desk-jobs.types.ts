export const WRITING_DESK_JOB_PHASES = ['initial', 'generating', 'followup', 'summary'] as const;

export type WritingDeskJobPhase = (typeof WRITING_DESK_JOB_PHASES)[number];

export const WRITING_DESK_RESEARCH_STATUSES = ['idle', 'running', 'completed', 'error'] as const;

export type WritingDeskResearchStatus = (typeof WRITING_DESK_RESEARCH_STATUSES)[number];

export interface WritingDeskJobFormSnapshot {
  issueDescription: string;
}

export interface WritingDeskJobSnapshot {
  jobId: string;
  userId: string;
  phase: WritingDeskJobPhase;
  stepIndex: number;
  followUpIndex: number;
  form: WritingDeskJobFormSnapshot;
  followUpQuestions: string[];
  followUpAnswers: string[];
  notes: string | null;
  responseId: string | null;
  researchContent: string | null;
  researchResponseId: string | null;
  researchStatus: WritingDeskResearchStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface WritingDeskJobRecord {
  jobId: string;
  userId: string;
  phase: WritingDeskJobPhase;
  stepIndex: number;
  followUpIndex: number;
  followUpQuestions: string[];
  formCiphertext?: string;
  followUpAnswersCiphertext?: string;
  form?: WritingDeskJobFormSnapshot & {
    issueDetail?: string;
    affectedDetail?: string;
    backgroundDetail?: string;
    desiredOutcome?: string;
  };
  followUpAnswers?: string[];
  notes: string | null;
  responseId: string | null;
  researchContent: string | null;
  researchResponseId: string | null;
  researchStatus: WritingDeskResearchStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface ActiveWritingDeskJobResource {
  jobId: string;
  phase: WritingDeskJobPhase;
  stepIndex: number;
  followUpIndex: number;
  form: WritingDeskJobFormSnapshot;
  followUpQuestions: string[];
  followUpAnswers: string[];
  notes: string | null;
  responseId: string | null;
  researchContent: string | null;
  researchResponseId: string | null;
  researchStatus: WritingDeskResearchStatus;
  createdAt: string;
  updatedAt: string;
}
