import { IsString, IsNumber, IsOptional, IsEmail } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBulkLinkDto {
  @IsString()
  customerName: string;

  @IsEmail()
  email: string;

  @Type(() => Number) // ✅ ensures string → number conversion
  @IsNumber()
  amount: number;

  @IsOptional()
  @IsString()
  reference?: string;
}