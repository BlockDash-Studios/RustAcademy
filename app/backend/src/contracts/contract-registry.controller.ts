import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Request, Response } from 'express';

import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { RateLimitGroupTag } from '../auth/decorators/rate-limit-group.decorator';
import { ContractRegistryService } from './contract-registry.service';
import {
  ContractRegistryResponseDto,
  PublishContractRegistryDto,
  RollbackContractRegistryDto,
} from './dto/contract-registry.dto';
import { ContractWritePolicyService } from '../feature-flags/contract-write-policy.service';

interface ApiKeyRequest extends Request {
  apiKey: { id: string };
}

@ApiTags('contracts')
@ApiHeader({
  name: 'X-API-Key',
  description: 'Optional API key. Publishing requires an admin-scoped key.',
  required: false,
})
@RateLimitGroupTag('public')
@UseGuards(ApiKeyGuard)
@Controller('contracts')
export class ContractRegistryController {
  constructor(
    private readonly contractRegistryService: ContractRegistryService,
    private readonly contractWritePolicyService: ContractWritePolicyService,
  ) {}

  @Get('registry')
  @ApiOperation({
    summary: 'Fetch the authoritative contract registry for the active network',
    description:
      'Returns the contract registry with an ETag header for change detection. Send If-None-Match with a prior ETag to get a 304 Not Modified response.',
  })
  @ApiResponse({ status: 200, type: ContractRegistryResponseDto })
  @ApiResponse({ status: 304, description: 'Registry unchanged since last poll' })
  async getRegistry(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const registry = await this.contractRegistryService.getRegistry();
    res.setHeader('ETag', registry.etag);
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');

    const clientEtag = req.headers['if-none-match'];
    if (clientEtag && clientEtag === registry.etag) {
      res.status(HttpStatus.NOT_MODIFIED);
      return;
    }

    return registry;
  }

  @Post('registry/publish')
  @HttpCode(HttpStatus.OK)
  @RequireScopes('admin')
  @RateLimitGroupTag('authenticated')
  @ApiOperation({
    summary: 'Publish deployment artifacts into the contract registry',
  })
  async publish(@Body() body: PublishContractRegistryDto, @Req() req: ApiKeyRequest) {
    const actorId = req.apiKey?.id;
    
    // Check contract write policy before allowing registry publish
    await this.contractWritePolicyService.assertWritePermission({
      userId: actorId,
      operation: 'contract_registry.publish',
      additionalContext: {
        deploymentId: body.deploymentId,
        contractCount: body.contracts.length,
        contractNames: body.contracts.map(c => c.name),
      },
    });

    return this.contractRegistryService.publish(body, actorId ?? 'api');
  }

  @Post('registry/rollback')
  @HttpCode(HttpStatus.OK)
  @RequireScopes('admin')
  @RateLimitGroupTag('authenticated')
  @ApiOperation({
    summary: 'Rollback the active registry entry for a contract to a previous version',
  })
  async rollback(@Body() body: RollbackContractRegistryDto, @Req() req: ApiKeyRequest) {
    const actorId = req.apiKey?.id;
    
    // Check contract write policy before allowing registry rollback
    await this.contractWritePolicyService.assertWritePermission({
      userId: actorId,
      operation: 'contract_registry.rollback',
      contractName: body.name,
      additionalContext: {
        targetVersion: body.version,
      },
    });

    return this.contractRegistryService.rollback(body, actorId ?? 'api');
  }
}
