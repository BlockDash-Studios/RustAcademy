import { IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class InvokeContractDto {
  @IsString()
  contractId: string;

  @IsString()
  method: string;

  @IsArray()
  @IsString({ each: true })
  args: string[];

  @IsString()
  sourceAccount: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  fee?: number;
}

export class DeployContractDto {
  @IsString()
  contractId: string;

  @IsString()
  wasmHash: string;

  @IsString()
  deployedBy: string;

  @IsString()
  network: string;
}
