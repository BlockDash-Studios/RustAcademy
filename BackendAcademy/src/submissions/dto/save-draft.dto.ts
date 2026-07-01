import { IsString, IsOptional } from 'class-validator';

/**
 * DTO for saving or updating a submission draft.
 *
 * All content fields are optional so partial progress can be persisted
 * without requiring a fully formed submission.
 */
export class SaveDraftDto {
  @IsString()
  taskId: string;

  @IsString()
  userId: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;
}
