import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ContractsService } from './contracts.service';
import {
  DeployContractDto,
  InvokeContractDto,
} from './dto/invoke-contract.dto';
import {
  CreateProposalDto,
  CastVoteDto,
} from './dto/governance.dto';

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contractsService: ContractsService) {}

  @Get('reputation/:userId')
  getReputation(@Param('userId') userId: string) {
    return this.contractsService.getReputation(userId);
  }

  @Post('reputation/:userId')
  updateReputation(
    @Param('userId') userId: string,
    @Body('score') score: number,
  ) {
    return this.contractsService.updateReputation(userId, score);
  }

  @Post('certificates/issue')
  issueCertificate(
    @Body('userId') userId: string,
    @Body('courseId') courseId: string,
  ) {
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

  @Post('badges/issue')
  issueBadge(
    @Body('userId') userId: string,
    @Body('badgeType') badgeType: string,
  ) {
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
}
  @Post('invoke')
  async invokeContract(@Body() dto: InvokeContractDto) {
    return this.contractsService.invokeContract(dto);
  }

  @Post('deploy')
  async deployContract(@Body() dto: DeployContractDto) {
    return this.contractsService.deployContract(dto);
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

  @Post('governance/proposals')
  createProposal(@Body() dto: CreateProposalDto) {
    return this.contractsService.createProposal(
      dto.title,
      dto.description,
      dto.proposer,
    );
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
}
