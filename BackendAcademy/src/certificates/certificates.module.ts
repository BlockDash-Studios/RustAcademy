import { Module } from '@nestjs/common';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

/**
 * Certification eligibility checks (BE-042).
 *
 * Exposes the eligibility oracle the certificate minting job consults before
 * minting a `certificate_nft`. The service is exported so a future minting job
 * running in-process can call it without going through HTTP.
 */
@Module({
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
