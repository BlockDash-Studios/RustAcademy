import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNumber, IsBoolean, IsOptional, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Represents the minimum contract version requirements for a specific endpoint or flow.
 */
export class ContractVersionRequirement {
  @ApiProperty({ example: 'quickex', description: 'Contract name' })
  @IsString()
  name: string;

  @ApiProperty({ example: 2, description: 'Minimum required contract version' })
  @IsNumber()
  minVersion: number;

  @ApiPropertyOptional({ example: 5, description: 'Maximum supported contract version (optional ceiling)' })
  @IsOptional()
  @IsNumber()
  maxVersion?: number;

  @ApiPropertyOptional({
    example: ['1.0.0', '1.1.0'],
    description: 'List of deprecated versions that will soon be unsupported',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  deprecatedVersions?: string[];
}

/**
 * Compatibility status for a single contract.
 */
export class ContractCompatibilityStatus {
  @ApiProperty({ example: 'quickex' })
  @IsString()
  name: string;

  @ApiProperty({ example: 3, description: 'Current deployed contract version' })
  @IsNumber()
  deployedVersion: number;

  @ApiProperty({ example: 2, description: 'Minimum version required by client' })
  @IsNumber()
  requiredMinVersion: number;

  @ApiProperty({ example: true, description: 'Whether the contract version is compatible' })
  @IsBoolean()
  compatible: boolean;

  @ApiPropertyOptional({ example: false, description: 'Whether this version is deprecated but still functional' })
  @IsOptional()
  @IsBoolean()
  deprecated?: boolean;

  @ApiPropertyOptional({ example: 'Contract version 1 is deprecated and will be unsupported after 2026-06-01' })
  @IsOptional()
  @IsString()
  deprecationMessage?: string;

  @ApiPropertyOptional({ example: 'CONTRACT_VERSION_TOO_LOW' })
  @IsOptional()
  @IsString()
  incompatibilityReason?: string;
}

/**
 * Overall contract compatibility metadata returned in API responses.
 */
export class ContractCompatibilityMetadata {
  @ApiProperty({
    example: true,
    description: 'Whether all contracts are compatible with the client requirements',
  })
  @IsBoolean()
  compatible: boolean;

  @ApiProperty({
    example: 2,
    description: 'Registry version used for this compatibility check',
  })
  @IsNumber()
  registryVersion: number;

  @ApiProperty({
    type: [ContractCompatibilityStatus],
    description: 'Per-contract compatibility status',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractCompatibilityStatus)
  contracts: ContractCompatibilityStatus[];

  @ApiPropertyOptional({
    example: '2026-06-01T00:00:00Z',
    description: 'ISO timestamp when deprecated contracts will become unsupported',
  })
  @IsOptional()
  @IsString()
  deprecationDeadline?: string;

  @ApiPropertyOptional({
    example: 'https://docs.quickex.io/contract-upgrade-guide',
    description: 'URL to upgrade documentation',
  })
  @IsOptional()
  @IsString()
  upgradeGuideUrl?: string;
}

/**
 * Request header or body DTO for clients to declare their supported contract versions.
 */
export class ClientContractRequirements {
  @ApiProperty({
    type: [ContractVersionRequirement],
    description: 'List of contract version requirements from the client',
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContractVersionRequirement)
  requirements: ContractVersionRequirement[];

  @ApiPropertyOptional({
    example: '1.2.0',
    description: 'Client SDK or application version',
  })
  @IsOptional()
  @IsString()
  clientVersion?: string;
}

/**
 * Response DTO for contract compatibility check endpoint.
 */
export class ContractCompatibilityCheckResponse {
  @ApiProperty({ type: ContractCompatibilityMetadata })
  @ValidateNested()
  @Type(() => ContractCompatibilityMetadata)
  compatibility: ContractCompatibilityMetadata;

  @ApiProperty({
    example: {
      message: 'All contracts are compatible',
      action: 'proceed',
    },
  })
  @ValidateNested()
  recommendation: {
    message: string;
    action: 'proceed' | 'upgrade_required' | 'upgrade_recommended';
  };
}