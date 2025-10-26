import { MaxLength } from 'class-validator';

/**
 * Content validation decorators for different types of input
 * 
 * User Input: Strict limits to prevent abuse (5000 characters)
 * AI Content: Generous limits to allow AI creativity (200,000 characters)
 */

// User input validation - 5000 characters (800-1000 words)
export const MaxUserInput = () => MaxLength(5000, { 
  message: 'Input exceeds maximum length of 5000 characters (approximately 800-1000 words)' 
});

// AI-generated content validation - 200,000 characters (generous for AI creativity)
export const MaxAiContent = () => MaxLength(200000, { 
  message: 'Content exceeds maximum length of 200,000 characters' 
});

// HTML content validation - 200,000 characters (HTML can be larger than plain text)
export const MaxHtmlContent = () => MaxLength(200000, { 
  message: 'HTML content exceeds maximum length of 200,000 characters' 
});

// JSON content validation - 100,000 characters (structured data should be smaller)
export const MaxJsonContent = () => MaxLength(100000, { 
  message: 'JSON content exceeds maximum length of 100,000 characters' 
});

// Research content validation - 200,000 characters (AI research can be comprehensive)
export const MaxResearchContent = () => MaxLength(200000, { 
  message: 'Research content exceeds maximum length of 200,000 characters' 
});
