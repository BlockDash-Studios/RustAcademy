import { Module } from '@nestjs/common';
import { PathfindingController } from './pathfinding.controller';
import { PathfindingService } from './pathfinding.service';

@Module({
  controllers: [PathfindingController],
  providers: [PathfindingService],
  exports: [PathfindingService],
})
export class PathfindingModule {}
