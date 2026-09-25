import { IsNotEmpty, IsString } from 'class-validator';

export class FollowDto {
  @IsString()
  @IsNotEmpty()
  followerId: string;

  @IsString()
  @IsNotEmpty()
  followeeId: string;
}
