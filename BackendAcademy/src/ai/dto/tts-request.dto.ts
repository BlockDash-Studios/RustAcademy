import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class TtsRequestDto {
  @IsString()
  @IsNotEmpty()
  text: string;

  @IsString()
  @IsOptional()
  voice?: string;

  @IsString()
  @IsOptional()
  language?: string;
}
