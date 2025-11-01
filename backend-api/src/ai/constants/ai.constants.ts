export const FOLLOW_UP_CREDIT_COST = 0.1;
export const DEEP_RESEARCH_CREDIT_COST = 0.7;
export const LETTER_CREDIT_COST = 0.2;
export const TRANSCRIPTION_CREDIT_COST = 0;

// Stream inactivity timeouts - max time between events before aborting
export const LETTER_STREAM_INACTIVITY_TIMEOUT_MS = 3 * 60 * 1000;
export const RESEARCH_STREAM_INACTIVITY_TIMEOUT_MS = 10 * 60 * 1000;
export const TRANSCRIPTION_STREAM_INACTIVITY_TIMEOUT_MS = 2 * 60 * 1000;

export const DEEP_RESEARCH_RUN_BUFFER_SIZE = 2000;
export const LETTER_RUN_BUFFER_SIZE = 2000;

export const DEEP_RESEARCH_RUN_TTL_MS = 5 * 60 * 1000;
export const LETTER_RUN_TTL_MS = 5 * 60 * 1000;

export const RESEARCH_MAX_RESUME_ATTEMPTS = 10;
export const LETTER_MAX_RESUME_ATTEMPTS = 10;

export const BACKGROUND_POLL_INTERVAL_MS = 2000;
export const BACKGROUND_POLL_TIMEOUT_MS = 40 * 60 * 1000;
