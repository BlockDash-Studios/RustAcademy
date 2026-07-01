import { IsString, IsNotEmpty } from 'class-validator';

export class VoiceInteractionDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsNotEmpty()
  audioData: string;

  @IsString()
  @IsNotEmpty()
  language: string;
}
