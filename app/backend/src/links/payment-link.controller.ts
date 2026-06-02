import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  Inject,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { PaymentLinkService } from "./payment-link.service";
import { PaymentLinkStatusDto } from "../dto/link/payment-link-status.dto";
import { ContractCompatibilityService } from "../contracts/contract-compatibility.service";
import { ContractCompatibilityMetadata } from "../contracts/dto/contract-compatibility.dto";

@ApiTags("payment-links")
@Controller("payment-links")
export class PaymentLinkController {
  constructor(
    private readonly paymentLinkService: PaymentLinkService,
    @Inject('ContractCompatibilityService')
    private readonly compatibilityService: ContractCompatibilityService,
  ) {}

  @Get("status")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Get payment link status",
    description:
      "Returns the current state (active/expired/paid/refunded) of a payment link " +
      "based on username, amount, and optional memo. Checks on-chain to determine if paid.",
  })
  @ApiQuery({
    name: "username",
    description: "Username for the payment link",
    example: "john_doe",
  })
  @ApiQuery({ name: "amount", description: "Payment amount", example: 100 })
  @ApiQuery({
    name: "asset",
    description: "Asset code (default: XLM)",
    example: "XLM",
    required: false,
  })
  @ApiQuery({
    name: "memo",
    description: "Optional memo text",
    example: "Invoice #123",
    required: false,
  })
  @ApiQuery({
    name: "acceptedAssets",
    description: "Comma-separated list of accepted assets",
    example: "XLM,USDC",
    required: false,
  })
  @ApiResponse({
    status: 200,
    description: "Payment link status retrieved successfully",
    type: PaymentLinkStatusDto,
  })
  @ApiResponse({
    status: 404,
    description: "Username not found",
  })
  async getPaymentLinkStatus(
    @Query("username") username: string,
    @Query("amount") amount: string,
    @Query("asset") asset?: string,
    @Query("memo") memo?: string,
    @Query("acceptedAssets") acceptedAssets?: string,
  ): Promise<{ data: PaymentLinkStatusDto; compatibility?: ContractCompatibilityMetadata }> {
    if (!username) {
      throw new BadRequestException("username is required");
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      throw new BadRequestException("amount must be a valid positive number");
    }

    const acceptedAssetsArray = acceptedAssets
      ? acceptedAssets.split(",").map((a) => a.trim())
      : undefined;

    const data = await this.paymentLinkService.getPaymentLinkStatus({
      username,
      amount: amountNum,
      asset: asset || "XLM",
      memo,
      acceptedAssets: acceptedAssetsArray,
    });

    // Get compatibility metadata for this endpoint
    const compatibility = await this.compatibilityService.getEndpointCompatibilityMetadata(
      'payment-links/status',
      'GET',
    );

    return {
      data,
      compatibility: compatibility || undefined,
    };
  }
}
