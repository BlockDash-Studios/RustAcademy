import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Optional metadata supplied alongside a multipart file upload.
 *
 * The actual file is captured separately via `@UploadedFile()`; this DTO
 * only validates the accompanying text fields.
 *
 * Note: the global `ValidationPipe` is configured with
 * `forbidNonWhitelisted: true`, so adding unlisted multipart fields will
 * cause the request to be rejected — that is the desired behaviour.
 */
export class UploadAssetDto {
  /**
   * Optional human-friendly display name for the asset.
   */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  /**
   * Optional longer description for the asset.
   */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
