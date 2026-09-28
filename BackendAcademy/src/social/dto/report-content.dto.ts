import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** A flag raised against a post or a comment (BE-093). */
export class ReportContentDto {
  @IsIn(['post', 'comment'])
  targetKind: 'post' | 'comment';

  @IsString()
  @IsNotEmpty()
  targetId: string;

  @IsString()
  @IsNotEmpty()
  reporterId: string;

  @IsIn(['spam', 'abuse', 'harassment', 'other'])
  reason: 'spam' | 'abuse' | 'harassment' | 'other';

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  details: string;
}
