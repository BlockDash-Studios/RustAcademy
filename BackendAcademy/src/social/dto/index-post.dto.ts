import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class IndexPostDto {
  @IsString()
  @IsNotEmpty()
  postId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}
