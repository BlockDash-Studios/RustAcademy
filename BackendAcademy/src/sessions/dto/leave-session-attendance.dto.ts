import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LeaveSessionAttendanceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  sessionKey!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  userId!: string;
}

