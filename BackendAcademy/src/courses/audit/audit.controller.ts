import { Controller, Get } from '@nestjs/common';

@Controller('audit')
export class AuditController {
  @Get()
  health() {
    return { status: 'ok' };
  }
}
