import { Module } from '@nestjs/common';
import { AdminSearchController } from './admin-search.controller';
import { SupabaseModule } from '../supabase/supabase.module';

@Module({
  imports: [SupabaseModule],
  controllers: [AdminSearchController],
})
export class SearchModule {}
