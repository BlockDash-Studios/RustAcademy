import { Body, Controller, HttpCode, HttpStatus, Post } from "@nestjs/common";
import { AuthSessionService } from "./auth-session.service";
import { LogoutDto } from "./dto/logout.dto";

@Controller("auth")
export class AuthSessionController {
  constructor(private readonly authSessionService: AuthSessionService) {}

  /**
   * Logout is intentionally idempotent at the HTTP layer too: it always
   * returns 204, whether the session existed, was already revoked, or
   * the token was missing/malformed. Retried logout requests (double
   * click, client retry after a dropped response, etc.) must produce the
   * exact same, stable response every time.
   */
  @Post("logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto): Promise<void> {
    await this.authSessionService.logout(dto.refreshToken);
  }
}
