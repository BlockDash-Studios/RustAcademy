import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsString } from "class-validator";

export class PayoutDto {
  @ApiProperty()
  @IsNotEmpty()
  @IsString()
  destinationAddress: string;

  @ApiProperty()
  @IsNotEmpty()
  @IsNumber()
  amount: number;
}
