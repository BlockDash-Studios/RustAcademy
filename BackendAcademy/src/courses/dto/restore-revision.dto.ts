import { IsOptional, IsString, MaxLength } from 'class-validator';

export class RestoreRevisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  revisionAuthor?: string;
}
