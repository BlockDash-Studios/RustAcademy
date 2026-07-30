import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { ContractRegistryService } from './contract-registry.service';
import { MetricsService } from '../monitoring/metrics.service';
import {
  DeployContractDto,
  InvokeContractDto,
} from './dto/invoke-contract.dto';
import { CreateProposalDto, CastVoteDto } from './dto/governance.dto';
import {
  ContractRegistryEntry,
  ContractRegistryFilter,
  ReplayResult,
  StateReconciliationResult,
} from './interfaces/contracts.interface';

/**
 * Contracts controller with existing endpoints (reputation, certificates,
 * badges, payouts, governance), gated contract invocation (#395),
 * registry with schema checks (#393), event replay (#394), and
 * adapter health (#396).
 */
@Controller('contracts')
export class ContractsController {
  constructor(
    private readonly contractsService: ContractsService,
    private readonly registryService: ContractRegistryService,
    private readonly metricsService: MetricsService,
  ) {}

  // ──────────────────────────────────────────────────────────────────
  // Reputation (existing)
  // ──────────────────────────────────────────────────────────────────

  @Get('reputation/:userId')
  getReputation(@Param('userId') userId: string) {
    return this.contractsService.getReputation(userId);
  }

  @Post('reputation/:userId')
  updateReputation(@Param('userId') userId: string, @Body('score') score: number) {
    return this.contractsService.updateReputation(userId, score);
  }

  // ──────────────────────────────────────────────────────────────────
  // Certificates (existing)
  // ──────────────────────────────────────────────────────────────────

  @Post('certificates/issue')
  issueCertificate(@Body('userId') userId: string, @Body('courseId') courseId: string) {
    return this.contractsService.issueCertificate(userId, courseId);
  }

  @Get('certificates/:id')
  getCertificate(@Param('id') id: string) {
    return this.contractsService.getCertificate(id);
  }

  @Get('certificates/user/:userId')
  listCertificates(@Param('userId') userId: string) {
    return this.contractsService.listCertificates(userId);
  }

  // ──────────────────────────────────────────────────────────────────
  // Badges (existing)
  // ──────────────────────────────────────────────────────────────────

  @Post('badges/issue')
  issueBadge(@Body('userId') userId: string, @Body('badgeType') badgeType: string) {
    return this.contractsService.issueBadge(userId, badgeType);
  }

  @Get('badges/:id')
  getBadge(@Param('id') id: string) {
    return this.contractsService.getBadge(id);
  }

  @Get('badges/user/:userId')
  listBadges(@Param('userId') userId: string) {
    return this.contractsService.listBadges(userId);
  }

  // ──────────────────────────────────────────────────────────────────
  // Payouts (existing)
  // ──────────────────────────────────────────────────────────────────

  @Post('payouts/create')
  createPayout(
    @Body('userId') userId: string,
    @Body('amount') amount: number,
    @Body('currency') currency: string,
  ) {
    return this.contractsService.createPayout(userId, amount, currency);
  }

  @Get('payouts/:id')
  getPayout(@Param('id') id: string) {
    return this.contractsService.getPayout(id);
  }

  @Post('payouts/:id/release')
  releasePayout(@Param('id') id: string) {
    return this.contractsService.releasePayout(id);
  }

  // ──────────────────────────────────────────────────────────────────
  // Governance (existing, routed through service)
  // ──────────────────────────────────────────────────────────────────

  @Post('governance/proposals')
  createProposal(@Body() dto: CreateProposalDto) {
    return this.contractsService.createProposal(dto.title, dto.description, dto.proposer);
  }

  @Get('governance/proposals')
  listProposals() {
    return this.contractsService.listProposals();
  }

  @Get('governance/proposals/:id')
  getProposal(@Param('id') id: string) {
    return this.contractsService.getProposal(id);
  }

  @Post('governance/proposals/:id/vote')
  castVote(@Param('id') id: string, @Body() dto: CastVoteDto) {
    return this.contractsService.castVote(id, dto.userId, dto.vote);
  }

  // ──────────────────────────────────────────────────────────────────
  // Contract deployment & invocation (gated by feature flags #395)
  // ──────────────────────────────────────────────────────────────────

  @Post('invoke')
  async invokeContract(@Body() dto: InvokeContractDto) {
    const result = await this.contractsService.invokeContract(dto);
    this.metricsService.incrementCounter('contract_invocations_total', 1, {
      contractId: dto.contractId,
      method: dto.method,
    });
    return result;
  }

  @Post('deploy')
  async deployContract(@Body() dto: DeployContractDto) {
    const result = await this.contractsService.deployContract(dto);
    this.metricsService.incrementCounter('contract_deployments_total', 1, {
      network: dto.network,
    });
    return result;
  }

  @Get(':contractId')
  async getContractInfo(@Param('contractId') contractId: string) {
    return this.contractsService.getContractInfo(contractId);
  }

  @Get(':contractId/health')
  async getContractHealth(@Param('contractId') contractId: string) {
    return this.contractsService.getContractHealth(contractId);
  }

  @Get(':contractId/history')
  async getInvocationHistory(@Param('contractId') contractId: string) {
    return this.contractsService.getInvocationHistory(contractId);
  }

  @Get()
  async getAllDeployments() {
    return this.contractsService.getAllDeployments();
  }

  // ──────────────────────────────────────────────────────────────────
  // #393: Contract registry with schema compatibility checks
  // ──────────────────────────────────────────────────────────────────

  @Post('registry/register')
  async registerContract(
    @Body()
    entry: Omit<
      ContractRegistryEntry,
      'id' | 'registeredAt' | 'validatedAt' | 'validationStatus'
    >,
  ) {
    const result = await this.registryService.register(entry);
    this.metricsService.incrementCounter('contract_registry_entries_total', 1, {
      network: entry.network,
      status: result.validationStatus,
    });
    return result;
  }

  @Get('registry')
  async listRegistry(@Query() filter?: ContractRegistryFilter) {
    return {
      entries: this.registryService.list(filter),
      total: this.registryService.count,
    };
  }

  @Get('registry/:contractId')
  async getRegistryEntry(@Param('contractId') contractId: string) {
    const entry = this.registryService.get(contractId);
    if (!entry) {
      return { error: 'CONTRACT_NOT_FOUND', message: `Contract ${contractId} not found in registry` };
    }
    return entry;
  }

  @Delete('registry/:contractId')
  async deregisterContract(@Param('contractId') contractId: string) {
    const removed = this.registryService.deregister(contractId);
    if (removed) {
      this.metricsService.incrementCounter('contract_registry_deregistrations_total', 1, { contractId });
    }
    return { success: removed, contractId };
  }

  // ──────────────────────────────────────────────────────────────────
  // #394: Event replay and state reconciliation
  // ──────────────────────────────────────────────────────────────────

  @Get(':contractId/events')
  async getEventLog(
    @Param('contractId') contractId: string,
    @Query('onlyUnreplayed') onlyUnreplayed?: string,
    @Query('limit') limit?: string,
  ) {
    return this.contractsService.getEventLog(contractId, {
      onlyUnreplayed: onlyUnreplayed === 'true',
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Post(':contractId/replay')
  async replayEvents(
    @Param('contractId') contractId: string,
    @Body() options?: { fromSequence?: number; maxEvents?: number },
  ): Promise<ReplayResult> {
    const result = await this.contractsService.replayEvents(contractId, options);
    this.metricsService.incrementCounter('contract_replays_total', 1, {
      contractId,
      status: result.status,
    });
    return result;
  }

  @Get(':contractId/reconcile')
  async reconcileState(@Param('contractId') contractId: string): Promise<StateReconciliationResult> {
    const result = await this.contractsService.reconcileState(contractId);
    this.metricsService.incrementCounter('contract_reconciliations_total', 1, {
      contractId,
      consistent: String(result.isConsistent),
    });
    return result;
  }

  @Get('events/stats')
  async getEventLogStats() {
    return this.contractsService.getEventLogStats();
  }

  @Get('replay/history')
  async getReplayHistory(@Query('contractId') contractId?: string) {
    return this.contractsService.getReplayHistory(contractId);
  }

  // ──────────────────────────────────────────────────────────────────
  // #396: Adapter health check
  // ──────────────────────────────────────────────────────────────────

  @Get('adapter/health')
  async adapterHealth() {
    return this.contractsService.healthCheck();
  }
}