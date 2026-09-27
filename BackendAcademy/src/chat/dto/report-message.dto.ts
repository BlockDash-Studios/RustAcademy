import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReportMessageDto {
  @IsString()
  @IsNotEmpty()
  reporterId: string;

  @IsString()
  @IsNotEmpty()
  messageId: string;

  @IsIn(['spam', 'abuse', 'harassment', 'other'])
  reason: 'spam' | 'abuse' | 'harassment' | 'other';

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  details: string;
}
