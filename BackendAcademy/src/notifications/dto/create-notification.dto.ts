import { IsString, IsIn } from 'class-validator';

export class CreateNotificationDto {
  @IsString()
  userId: string;

  @IsIn(['push', 'in-app'])
  type: 'push' | 'in-app';

  @IsString()
  title: string;

  @IsString()
  message: string;
}
