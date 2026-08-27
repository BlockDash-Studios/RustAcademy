import { IsString, IsEnum, IsOptional } from 'class-validator';
import { HintDifficultyTier } from '../interfaces/hint.interface';

export class GetHintDto {
  @IsString()
  userId: string;

  @IsEnum(HintDifficultyTier)
  @IsOptional()
  tier?: HintDifficultyTier;
}
