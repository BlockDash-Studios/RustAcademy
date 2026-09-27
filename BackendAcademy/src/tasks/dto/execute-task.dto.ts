import { IsString, MaxLength } from 'class-validator';

export class ExecuteTaskDto {
  @IsString()
  @MaxLength(20_000)
  code: string;
}
