import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';

import { RequireScopes } from '../auth/decorators/require-scopes.decorator';
import { ApiKeyGuard } from '../auth/guards/api-key.guard';
import { DeploymentService } from './deployment.service';
import { FundingPreflightDto, DeploymentPlanDto } from './dto/testnet-tooling.dto';
import { FundingHelperService } from './funding-helper.service';
import { ContractWritePolicyService } from '../feature-flags/contract-write-policy.service';

interface ApiKeyRequest extends Request {
  apiKey?: Request['apiKey'];
}

@ApiTags('developer')
@ApiHeader({
  name: 'X-API-Key',
  description: 'Optional API key. Deployment planning requires an admin-scoped key.',
  required: false,
})
@UseGuards(ApiKeyGuard)
@Controller('developer/testnet')
export class SorobanToolingController {
  constructor(
    private readonly fundingHelperService: FundingHelperService,
    private readonly deploymentService: DeploymentService,
    private readonly contractWritePolicyService: ContractWritePolicyService,
  ) {}

  @Post('funding/preflight')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Check whether a Stellar account is funded enough for deploy flows' })
  preflightFunding(@Body() body: FundingPreflightDto) {
    return this.fundingHelperService.checkFunding(body);
  }

  @Post('deployments/plan')
  @HttpCode(HttpStatus.OK)
  @RequireScopes('admin')
  @ApiOperation({ summary: 'Plan a deterministic Soroban deployment run without submitting transactions' })
  async planDeployment(@Body() body: DeploymentPlanDto, @Req() req: ApiKeyRequest) {
    const actorId = req.apiKey?.id;
    
    // Check contract write policy before allowing deployment planning
    await this.contractWritePolicyService.assertWritePermission({
      userId: actorId,
      operation: 'soroban.deployment.plan',
      network: body.network,
      additionalContext: {
        dryRun: body.dryRun ?? true,
        contractCount: body.contracts.length,
        contractNames: body.contracts.map(c => c.name),
      },
    });

    return this.deploymentService.planDeployment(body);
  }
}
