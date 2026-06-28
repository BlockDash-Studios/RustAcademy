export class CreateChatRequestDto {
  message: string;
  context?: Record<string, any>;
  userId: string;
}