import { IsString, IsOptional, IsObject } from 'class-validator';

export class CreateChatRequestDto {
  @IsString()
  message: string;

  @IsOptional()
  @IsObject()
  context?: Record<string, any>;

  @IsString()
  userId: string;
}
