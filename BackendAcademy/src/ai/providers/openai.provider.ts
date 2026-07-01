import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { AiProvider, ChatCompletionOptions } from '../interfaces/ai-provider.interface';

@Injectable()
export class OpenaiProvider implements AiProvider {
  private apiKey: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('OPENAI_API_KEY') || '';
    this.model = this.configService.get<string>('AI_MODEL') || 'gpt-4o';
    this.maxTokens = this.configService.get<number>('AI_MAX_TOKENS') || 4096;
    this.temperature = this.configService.get<number>('AI_TEMPERATURE') || 0.7;
  }

  async generateChatCompletion(options: ChatCompletionOptions): Promise<string> {
    const { data } = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: this.model,
        max_tokens: options.maxTokens ?? this.maxTokens,
        temperature: options.temperature ?? this.temperature,
        messages: options.messages.map(m => ({ role: m.role, content: m.content })),
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'content-type': 'application/json',
        },
      },
    );

    return data.choices[0]?.message?.content || '';
  }
}
