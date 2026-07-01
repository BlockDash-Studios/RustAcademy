import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AiController } from './ai.controller';
import { AiService, AI_PROVIDER } from './ai.service';
import { ClaudeProvider } from './providers/claude.provider';
import { OpenaiProvider } from './providers/openai.provider';

const aiProviderFactory = {
  provide: AI_PROVIDER,
  useFactory: (configService: ConfigService) => {
    const provider = configService.get<string>('AI_PROVIDER');
    if (provider === 'openai') return new OpenaiProvider(configService);
    if (provider === 'claude') return new ClaudeProvider(configService);
    return null;
  },
  inject: [ConfigService],
};

@Module({
  controllers: [AiController],
  providers: [AiService, aiProviderFactory],
  exports: [AiService],
})
export class AiModule {}
