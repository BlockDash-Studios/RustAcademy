import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ShareCodeSnippetDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  code: string;

  @IsOptional()
  @IsString()
  language?: string;

  @IsOptional()
  @IsString()
  title?: string;
}
