export function extractFirstText(response: any): string | null {
  if (!response) {
    return null;
  }

  const output = (response as any)?.output;
  if (Array.isArray(output)) {
    for (const entry of output) {
      const text = (entry as any)?.content?.find?.((item: any) => item?.type === 'output_text')?.text;
      if (typeof text === 'string' && text.trim().length > 0) {
        return text;
      }
    }
  }

  const textContent = (response as any)?.content;
  if (Array.isArray(textContent)) {
    for (const item of textContent) {
      if (typeof item?.text === 'string' && item.text.trim().length > 0) {
        return item.text;
      }
    }
  }

  const dataText = (response as any)?.text;
  if (typeof dataText === 'string' && dataText.trim().length > 0) {
    return dataText;
  }

  return null;
}

export function isOpenAiRelatedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { message?: unknown; code?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message.toLowerCase() : '';
  if (message) {
    const keywords = ['openai', 'api key', 'network', 'timeout'];
    if (keywords.some((keyword) => message.includes(keyword))) {
      return true;
    }
  }

  const code = typeof candidate.code === 'string' ? candidate.code.toLowerCase() : '';
  if (code) {
    const codeKeywords = ['openai', 'timeout'];
    if (codeKeywords.some((keyword) => code.includes(keyword))) {
      return true;
    }
  }

  return false;
}

export function getSupportedReasoningEfforts(model?: string | null): Array<'low' | 'medium' | 'high'> {
  if (!model) {
    return ['medium'];
  }

  const normalisedModel = model.trim().toLowerCase();
  if (normalisedModel === 'o4-mini-deep-research' || normalisedModel.startsWith('o4-mini-deep-research@')) {
    return ['medium'];
  }

  return ['low', 'medium', 'high'];
}

