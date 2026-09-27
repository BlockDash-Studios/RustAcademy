import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from "class-validator";

export class RunCodeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100_000)
  source: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  @MaxLength(16_384, { each: true })
  testCases?: string[];

  @ValidateIf((dto: RunCodeDto) => dto.testCases !== undefined)
  @IsString()
  @MaxLength(64 * 1024)
  expectedOutput?: string;
}
