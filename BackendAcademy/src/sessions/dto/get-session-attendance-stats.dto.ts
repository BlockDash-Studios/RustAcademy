import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class SessionAttendanceStatsDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sessionKey!: string;

  @IsInt()
  presentCount!: number;

  @IsInt()
  totalJoins!: number;

  @IsInt()
  totalDurationSeconds!: number;
}

