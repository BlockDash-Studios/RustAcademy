import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { AuthSessionService } from './auth-session.service';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthTokensResponse, Session } from './interfaces/session.interface';
import { UserRole } from './enums/user-role.enum';
import { AntiCheatService } from '../security/anti-cheat.service';

export class HeartbeatDto {
  sessionId: string;
}

@Controller('auth/session')
export class AuthSessionController {
  constructor(
    private readonly authSessionService: AuthSessionService,
    private readonly antiCheatService: AntiCheatService,
  ) {}

  @Post('login')
  @HttpCode(HttpStatus.CREATED)
  async login(@Body() dto: LoginDto): Promise<AuthTokensResponse> {
    return this.authSessionService.createSession(
      dto.userId,
      dto.role as UserRole,
    );
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthTokensResponse> {
    return this.authSessionService.refreshTokens(dto.refreshToken);
  }

  @Post('heartbeat')
  @HttpCode(HttpStatus.OK)
  async heartbeat(@Body() dto: HeartbeatDto): Promise<{ updated: boolean }> {
    await this.authSessionService.updateLastActivity(dto.sessionId);
    return { updated: true };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Query('sessionId') sessionId: string): Promise<void> {
    await this.authSessionService.revokeSession(sessionId);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(@Query('userId') userId: string): Promise<void> {
    await this.authSessionService.revokeAllUserSessions(userId);
  }

  @Get(':userId')
  @HttpCode(HttpStatus.OK)
  async getActiveSessions(
    @Param('userId') userId: string,
  ): Promise<Omit<Session, 'refreshTokenHash'>[]> {
    return this.authSessionService.getActiveSessions(userId);
  }

  // ---------------------------------------------------------------------------
  // API Key Issuance & Revocation — Issue #410
  // ---------------------------------------------------------------------------

  @Post('api-keys')
  @HttpCode(HttpStatus.CREATED)
  createApiKey(
    @Body() body: { userId: string; label: string; scopes?: string[]; expiresInDays?: number },
  ): { id: string; rawKey: string } {
    return this.antiCheatService.createApiKey(
      body.userId,
      body.label,
      body.scopes,
      body.expiresInDays,
    );
  }

  @Get('api-keys/:userId')
  @HttpCode(HttpStatus.OK)
  listApiKeys(@Param('userId') userId: string) {
    return this.antiCheatService.getUserApiKeys(userId);
  }

  @Post('api-keys/:keyId/revoke')
  @HttpCode(HttpStatus.OK)
  revokeApiKey(@Param('keyId') keyId: string) {
    const revoked = this.antiCheatService.revokeApiKey(keyId);
    if (!revoked) {
      return { success: false, message: 'Key not found' };
    }
    return { success: true, message: 'API key revoked' };
  }

  @Post('api-keys/:keyId/rotate')
  @HttpCode(HttpStatus.CREATED)
  rotateApiKey(@Param('keyId') keyId: string) {
    const newKey = this.antiCheatService.rotateApiKey(keyId);
    if (!newKey) {
      return { success: false, message: 'Key not found' };
    }
    return { success: true, ...newKey };
  }
}
