import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiService {
  constructor(private readonly config: ConfigService) {}

  async generate(input: { prompt: string; model?: string }) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    const model = input.model || this.config.get<string>('OPENAI_MODEL', 'gpt-4o-mini');
    if (!apiKey) {
      // In dev without key, return a stub so flows work
      return { content: `DEV-STUB: ${input.prompt.slice(0, 120)}...` };
    }
    // Lazy import to avoid startup error if pkg missing in some envs
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });
    const resp = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: input.prompt }],
      temperature: 0.7,
    });
    const content = resp.choices?.[0]?.message?.content ?? '';
    return { content };
  }
}

