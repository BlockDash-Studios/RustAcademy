import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiProvider, ChatCompletionOptions } from '../interfaces/ai-provider.interface';

@Injectable()
export class ClaudeProvider implements AiProvider {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('ANTHROPIC_API_KEY') || '';
    this.model = this.configService.get<string>('AI_MODEL') || 'claude-sonnet-4-20250514';
    this.maxTokens = this.configService.get<number>('AI_MAX_TOKENS') || 4096;
    this.temperature = this.configService.get<number>('AI_TEMPERATURE') || 0.7;
  }

  async generateChatCompletion(options: ChatCompletionOptions): Promise<string> {
    const systemMsg = options.messages.find(m => m.role === 'system');
    const otherMessages = options.messages.filter(m => m.role !== 'system');

    const { data } = await axios.post(
      'https://api.anthropic.com/v1/messages',
      {
        model: this.model,
        max_tokens: options.maxTokens ?? this.maxTokens,
        temperature: options.temperature ?? this.temperature,
        system: systemMsg?.content,
        messages: otherMessages.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content })),
      },
      {
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
      },
    );

    return data.content[0]?.text || '';
  }
}
