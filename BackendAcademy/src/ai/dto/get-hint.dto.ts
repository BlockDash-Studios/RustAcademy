import { IsString, IsOptional, IsNumber } from 'class-validator';

export class GetHintDto {
  @IsString()
  challengeId: string;

  @IsString()
  userId: string;

  @IsOptional()
  @IsNumber()
  difficulty?: number;
}
