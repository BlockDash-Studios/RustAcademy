import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from "@nestjs/swagger";
import { InAppNotificationRepository } from "./in-app-notification.repository";

@ApiTags("Notifications")
@Controller("notifications")
export class InAppNotificationController {
  private readonly logger = new Logger(InAppNotificationController.name);

  constructor(private readonly repository: InAppNotificationRepository) {}

  @Get(":publicKey")
  @ApiOperation({ summary: "Get paginated in-app notifications for a user" })
  @ApiParam({ name: "publicKey", description: "User's Stellar public key" })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiResponse({ status: 200, description: "List of notifications" })
  async getNotifications(
    @Param("publicKey") publicKey: string,
    @Query("limit") limit?: number,
    @Query("offset") offset?: number,
  ) {
    const l = limit ? Number(limit) : 20;
    const o = offset ? Number(offset) : 0;
    
    return this.repository.findMany(publicKey, l, o);
  }

  @Patch(":publicKey/:id/read")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark a notification as read" })
  @ApiParam({ name: "publicKey", description: "User's Stellar public key" })
  @ApiParam({ name: "id", description: "Notification UUID" })
  @ApiResponse({ status: 200, description: "Notification marked as read" })
  async markAsRead(
    @Param("publicKey") publicKey: string,
    @Param("id") id: string,
  ) {
    await this.repository.markAsRead(id, publicKey);
    return { success: true };
  }

  @Post(":publicKey/read-all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Mark all notifications as read for a user" })
  @ApiParam({ name: "publicKey", description: "User's Stellar public key" })
  @ApiResponse({ status: 200, description: "All notifications marked as read" })
  async markAllAsRead(@Param("publicKey") publicKey: string) {
    await this.repository.markAllAsRead(publicKey);
    return { success: true };
  }
}
