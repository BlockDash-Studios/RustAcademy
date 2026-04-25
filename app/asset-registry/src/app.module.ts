import { Module } from '@nestjs/common';
import { AssetsController } from './assets/assets.controller';
import { AssetsService } from './assets/assets.service';

@Module({
  imports: [],
  controllers: [AssetsController],
  providers: [AssetsService],
})
export class AppModule {}
