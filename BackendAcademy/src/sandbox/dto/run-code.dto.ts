import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RunCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  source: string;
}