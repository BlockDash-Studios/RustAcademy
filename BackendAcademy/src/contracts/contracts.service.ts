import { Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import {
  ReputationRecord,
  CertificateNft,
  BadgeNft,
  EscrowPayout,
import { BadRequestException, Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { InvokeContractDto, DeployContractDto } from './dto/invoke-contract.dto';
import {
  ContractDeployment,
  ContractHealth,
  ContractInfo,
  ContractInvocationResult,
} from './interfaces/contracts.interface';

@Injectable()
export class ContractsService {
  private readonly reputations = new Map<string, ReputationRecord>();
  private readonly certificates = new Map<string, CertificateNft>();
  private readonly badges = new Map<string, BadgeNft>();
  private readonly payouts = new Map<string, EscrowPayout>();

  getReputation(userId: string) {
    return this.reputations.get(userId) ?? { userId, score: 0, level: 1, lastUpdated: new Date() };
  }

  updateReputation(userId: string, score: number) {
    const record: ReputationRecord = {
      userId, score,
      level: Math.floor(score / 100) + 1,
      lastUpdated: new Date(),
    };
    this.reputations.set(userId, record);
    return { success: true, data: record };
  }

  issueCertificate(userId: string, courseId: string) {
    const cert: CertificateNft = {
      id: `cert_${uuidv4()}`, userId, courseId, issuedAt: new Date(),
    };
    this.certificates.set(cert.id, cert);
    return { success: true, data: cert };
  }

  getCertificate(id: string) {
    const cert = this.certificates.get(id);
    if (!cert) throw new NotFoundException('Certificate not found');
    return cert;
  }

  listCertificates(userId: string) {
    return Array.from(this.certificates.values()).filter((c) => c.userId === userId);
  }

  issueBadge(userId: string, badgeType: string) {
    const badge: BadgeNft = {
      id: `badge_${uuidv4()}`, userId, badgeType, issuedAt: new Date(),
    };
    this.badges.set(badge.id, badge);
    return { success: true, data: badge };
  }

  getBadge(id: string) {
    const badge = this.badges.get(id);
    if (!badge) throw new NotFoundException('Badge not found');
    return badge;
  }

  listBadges(userId: string) {
    return Array.from(this.badges.values()).filter((b) => b.userId === userId);
  }

  createPayout(userId: string, amount: number, currency: string) {
    const payout: EscrowPayout = {
      id: `payout_${uuidv4()}`, userId, amount, currency,
      status: 'pending', createdAt: new Date(),
    };
    this.payouts.set(payout.id, payout);
    return { success: true, data: payout };
  }

  getPayout(id: string) {
    const payout = this.payouts.get(id);
    if (!payout) throw new NotFoundException('Payout not found');
    return payout;
  }

  releasePayout(id: string) {
    const payout = this.payouts.get(id);
    if (!payout) throw new NotFoundException('Payout not found');
    payout.status = 'completed';
    return { success: true, data: payout };
  private readonly deployments = new Map<string, ContractDeployment>();
  private readonly invocationHistory = new Map<string, ContractInvocationResult[]>();
  private readonly invocationCounts = new Map<string, number>();

  async invokeContract(dto: InvokeContractDto): Promise<ContractInvocationResult> {
    this.validateContractId(dto.contractId);
    this.validateSourceAccount(dto.sourceAccount);

    const deployment = this.deployments.get(dto.contractId);
    if (!deployment) {
      throw new BadRequestException({
        error: 'CONTRACT_NOT_DEPLOYED',
        message: `Contract ${dto.contractId} has not been deployed yet`,
      });
    }

    const invocationId = uuidv4();
    const txHash = this.generateTransactionHash();
    const result = this.simulateInvocation(dto.method, dto.args);

    const invocationResult: ContractInvocationResult = {
      invocationId,
      contractId: dto.contractId,
      method: dto.method,
      success: result.success,
      result: result.value,
      error: result.error,
      transactionHash: txHash,
      executedAt: new Date(),
    };

    this.recordInvocation(dto.contractId, invocationResult);

    return invocationResult;
  }

  async deployContract(dto: DeployContractDto): Promise<ContractDeployment> {
    this.validateContractId(dto.contractId);

    if (this.deployments.has(dto.contractId)) {
      throw new BadRequestException({
        error: 'CONTRACT_ALREADY_DEPLOYED',
        message: `Contract ${dto.contractId} is already deployed`,
      });
    }

    const deployment: ContractDeployment = {
      contractId: dto.contractId,
      wasmHash: dto.wasmHash,
      deployedAt: new Date(),
      deployedBy: dto.deployedBy,
      network: dto.network as ContractDeployment['network'],
    };

    this.deployments.set(dto.contractId, deployment);
    return deployment;
  }

  async getContractInfo(contractId: string): Promise<ContractInfo> {
    const deployment = this.deployments.get(contractId);
    if (!deployment) {
      throw new BadRequestException({
        error: 'CONTRACT_NOT_FOUND',
        message: `Contract ${contractId} not found`,
      });
    }

    return {
      contractId: deployment.contractId,
      wasmHash: deployment.wasmHash,
      network: deployment.network,
      deployedBy: deployment.deployedBy,
      deployedAt: deployment.deployedAt,
      methods: ['transfer', 'balance', 'approve', 'burn', 'mint', 'allowance'],
    };
    this.proposals.set(proposal.id, proposal);
    return { success: true, message: 'Proposal created', data: proposal };
  }

  async getContractHealth(contractId: string): Promise<ContractHealth> {
    const count = this.invocationCounts.get(contractId) ?? 0;
    const history = this.invocationHistory.get(contractId) ?? [];
    const lastInvokedAt = history.length > 0 ? history[history.length - 1].executedAt : undefined;

    let status: ContractHealth['status'] = 'active';
    if (count === 0) {
      status = 'inactive';
    } else if (history.length > 0) {
      const last = history[history.length - 1];
      const hoursSinceLastInvocation =
        (Date.now() - last.executedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastInvocation > 24) {
        status = 'degraded';
      }
    }

    return {
      contractId,
      status,
      lastInvokedAt,
      invocationCount: count,
      network: this.deployments.get(contractId)?.network ?? 'testnet',
    };
  }

  async getInvocationHistory(contractId: string): Promise<ContractInvocationResult[]> {
    return this.invocationHistory.get(contractId) ?? [];
  }

  async getAllDeployments(): Promise<ContractDeployment[]> {
    return Array.from(this.deployments.values());
  }

  private validateContractId(contractId: string): void {
    if (!contractId || !contractId.trim()) {
      throw new BadRequestException({
        error: 'INVALID_CONTRACT_ID',
        message: 'contractId is required',
      });
    }
  }

  private validateSourceAccount(sourceAccount: string): void {
    if (!sourceAccount || !sourceAccount.trim()) {
      throw new BadRequestException({
        error: 'INVALID_SOURCE_ACCOUNT',
        message: 'sourceAccount is required',
      });
    }
    if (!sourceAccount.startsWith('G') || sourceAccount.length !== 56) {
      throw new BadRequestException({
        error: 'INVALID_SOURCE_ACCOUNT',
        message: 'sourceAccount must be a valid Stellar public key starting with G and 56 characters long',
      });
    }
  }

  private simulateInvocation(
    method: string,
    args: string[],
  ): { success: boolean; value?: unknown; error?: string } {
    const successRate = 0.9;
    const succeeded = Math.random() < successRate;

    if (!succeeded) {
      return {
        success: false,
        error: `Contract invocation failed: method ${method} reverted`,
      };
    }

    switch (method) {
      case 'balance':
        return {
          success: true,
          value: {
            amount: (Math.random() * 10000).toFixed(2),
            token: 'XLM',
          },
        };
      case 'transfer':
        return {
          success: true,
          value: {
            from: args[0] ?? 'unknown',
            to: args[1] ?? 'unknown',
            amount: args[2] ?? '0',
            timestamp: new Date().toISOString(),
          },
        };
      case 'allowance':
        return {
          success: true,
          value: {
            owner: args[0] ?? 'unknown',
            spender: args[1] ?? 'unknown',
            amount: '1000',
          },
        };
      default:
        return {
          success: true,
          value: {
            method,
            args,
            result: 'ok',
          },
        };
    }
  }

  private generateTransactionHash(): string {
    return Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16),
    ).join('');
  }

  private recordInvocation(contractId: string, result: ContractInvocationResult): void {
    if (!this.invocationHistory.has(contractId)) {
      this.invocationHistory.set(contractId, []);
    }
    this.invocationHistory.get(contractId)!.push(result);
    this.invocationCounts.set(contractId, (this.invocationCounts.get(contractId) ?? 0) + 1);
  getProposal(id: string) {
    const proposal = this.proposals.get(id);
    if (!proposal) throw new NotFoundException('Proposal not found');
    return proposal;
  }

  listProposals() {
    return Array.from(this.proposals.values());
  }

  castVote(proposalId: string, userId: string, vote: 'yes' | 'no') {
    const proposal = this.proposals.get(proposalId);
    if (!proposal) throw new NotFoundException('Proposal not found');
    if (proposal.status !== 'active') {
      return { success: false, message: 'Proposal is no longer active' };
    }
    if (vote === 'yes') proposal.yesVotes++;
    else proposal.noVotes++;
    return { success: true, message: `Vote cast as ${vote}`, data: proposal };
  }
}
