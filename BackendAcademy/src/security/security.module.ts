import { Module } from '@nestjs/common';
import { AntiCheatController } from './anti-cheat.controller';
import { AntiCheatService } from './anti-cheat.service';

@Module({
  controllers: [AntiCheatController],
  providers: [AntiCheatService],
  exports: [AntiCheatService],
})
export class SecurityModule {}
