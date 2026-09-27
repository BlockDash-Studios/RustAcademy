import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateShowcaseDto {
  @IsString()
  @IsNotEmpty()
  authorId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(140)
  title: string;

  /** Validated as an absolute https URL by ShowcaseService. */
  @IsString()
  @IsNotEmpty()
  repoUrl: string;

  @IsString()
  @IsNotEmpty()
  demoUrl: string;

  /** Validated as a Soroban `C…` strkey by ShowcaseService. */
  @IsString()
  @IsNotEmpty()
  contractId: string;
}
