import {
  Controller,
  Get,
  Query,
  Post,
  Body,
  Param,
  UseGuards,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";

import { HorizonService } from "../transactions/horizon.service";
import { SensitiveMutation } from "../auth/decorators/sensitive-mutation.decorator";
import { PaymentsService } from "./payments.service";
import { PayoutDto } from "./dto/payout.dto";
import { Roles } from "../auth/decorators/roles.decorator";
import { UserRole } from "../auth/enums/user-role.enum";
import { RolesGuard } from "../auth/guards/roles.guard";

type RecentPaymentsQuery = {
  address: string;
  since?: string; // ISO timestamp or epoch ms
  limit?: number;
};

@ApiTags("payments")
@Controller("payments")
export class PaymentsController {
  constructor(
    private readonly horizonService: HorizonService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Post("payout")
  @Roles(UserRole.Admin)
  @UseGuards(RolesGuard)
  @SensitiveMutation("payments.payout.create")
  @ApiOperation({ summary: "Create a payout" })
  @ApiResponse({ status: 201, description: "Payout created" })
  async createPayout(@Body() payoutDto: PayoutDto) {
    return this.paymentsService.createPayout(payoutDto);
  }

  @Post("payout/:id/release")
  @Roles(UserRole.Admin)
  @UseGuards(RolesGuard)
  @SensitiveMutation("payments.payout.release")
  @ApiOperation({ summary: "Release a payout" })
  @ApiResponse({ status: 200, description: "Payout released" })
  async releasePayout(@Param("id") id: string) {
    return this.paymentsService.releasePayout(id);
  }

  // Read-only, but payment-sensitive: exposes an address's payment history,
  // which is a reconnaissance target for scraping/enumeration. Tagged
  // "sensitive" (Issue #551) for the stricter per-user+per-IP limits and
  // the audit trail, even though it has no side effects of its own.
  @Get("recent")
  @SensitiveMutation("payments.recent.query")
  @ApiOperation({
    summary: "Fetch recent payments for an address (since timestamp)",
  })
  @ApiResponse({ status: 200, description: "List of recent payments" })
  async recent(@Query() query: RecentPaymentsQuery) {
    const { address, since, limit = 20 } = query;

    if (!address) {
      return { items: [] };
    }

    // HorizonService.getPayments returns items sorted desc by created_at
    const resp = await this.horizonService.getPayments(
      address,
      undefined,
      Number(limit),
    );

    const sinceTs = since ? parseSince(since) : undefined;

    const filtered = sinceTs
      ? resp.items.filter((it) => new Date(it.timestamp).getTime() > sinceTs)
      : resp.items;

    return { items: filtered };
  }
}

function parseSince(raw?: string): number | undefined {
  if (!raw) return undefined;
  // accept epoch ms or ISO
  const n = Number(raw);
  if (!Number.isNaN(n) && n > 0) return n;
  const d = Date.parse(raw);
  return Number.isNaN(d) ? undefined : d;
}
