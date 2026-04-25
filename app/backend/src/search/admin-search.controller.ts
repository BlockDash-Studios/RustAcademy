import { Controller, Get, Query } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Throttle } from '@nestjs/throttler';

@Controller('admin/search')
export class AdminSearchController {
  constructor(private readonly supabase: SupabaseService) {}

  @Get()
  @Throttle({ name: 'sustained', limit: 30, ttl: 60000 })
  async search(@Query('q') query: string) {
    return this.supabase.adminSearch(query);
  }
}
