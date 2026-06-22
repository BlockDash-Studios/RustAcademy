import { Module, forwardRef } from "@nestjs/common";

import { TransactionsModule } from "../transactions/transactions.module";
import { AssetMetadataModule } from "../asset-metadata/asset-metadata.module";
import { HorizonService } from "./horizon.service";
import { LinkService } from "./link.service";
import { PathPreviewService } from "./path-preview.service";
import { QuoteService } from "./quote.service";
import { StellarController } from "./stellar.controller";
import { ApiKeysModule } from "../api-keys/api-keys.module";
import { ApiKeyGuard } from "../auth/guards/api-key.guard";
import { FeatureFlagsModule } from "../feature-flags/feature-flags.module";
import { StellarSigningService } from "../common/stellar-signing.service";

@Module({
  imports: [TransactionsModule, ApiKeysModule, FeatureFlagsModule, forwardRef(() => AssetMetadataModule)],
  controllers: [StellarController],
  providers: [LinkService, HorizonService, PathPreviewService, QuoteService, ApiKeyGuard, StellarSigningService],
  exports: [LinkService, HorizonService, PathPreviewService, QuoteService, StellarSigningService],
})
export class StellarModule {}
