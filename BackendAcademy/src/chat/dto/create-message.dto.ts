import { IsNotEmpty, IsString } from 'class-validator';

export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  roomId: string;

  @IsString()
  @IsNotEmpty()
  senderId: string;

  @IsString()
  @IsNotEmpty()
  content: string;
}
