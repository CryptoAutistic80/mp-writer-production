import { Throttle } from '@nestjs/throttler';

/**
 * Rate limiting decorators for different operation types
 * 
 * AI Operations: Strict limits to prevent OpenAI API abuse
 * Credit Operations: Medium limits for financial transactions
 * Standard Operations: Current limits for regular API calls
 */

// AI operations - 5 requests per 5 minutes (very strict)
export const ThrottleAI = () => Throttle({ 
  ai: { limit: 5, ttl: 300000 } // 5 requests per 5 minutes
});

// Transcription operations - higher allowance to support follow-up questions
export const ThrottleTranscription = () => Throttle({
  transcription: { limit: 20, ttl: 300000 } // 20 requests per 5 minutes
});

// Credit operations - 10 requests per 10 minutes (medium strict)
export const ThrottleCredit = () => Throttle({ 
  credit: { limit: 10, ttl: 600000 } // 10 requests per 10 minutes
});

// Standard operations - 60 requests per minute (current default)
export const ThrottleStandard = () => Throttle({ 
  default: { limit: 60, ttl: 60000 } // 60 requests per minute
});

// Webhook operations - 10 requests per minute (for external webhooks)
export const ThrottleWebhook = () => Throttle({ 
  webhook: { limit: 10, ttl: 60000 } // 10 requests per minute
});
