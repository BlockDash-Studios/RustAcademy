import { Module } from '@nestjs/common';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { ContractRegistryService } from './contract-registry.service';
import { MonitoringModule } from '../monitoring/monitoring.module';

/**
 * Contracts module with feature-flagged ingestion (#395).
 *
 * The contract ingestion pipeline (invocation, deployment processing)
 * is gated behind the CONTRACT_INGESTION_ENABLED feature flag checked
 * at runtime in ContractsService. Registry and event replay are
 * always available but their behavior adapts based on configuration.
 * Monitoring metrics are tracked via MetricsService from MonitoringModule.
 */
@Module({
  imports: [MonitoringModule],
  controllers: [ContractsController],
  providers: [ContractsService, ContractRegistryService],
  exports: [ContractsService, ContractRegistryService],
})
export class ContractsModule {}