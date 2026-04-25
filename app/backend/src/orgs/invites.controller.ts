import { Controller, Post, Get, Delete, Param, Body, Req } from '@nestjs/common';
import { InvitesService } from './invites.service';
import { Throttle } from '@nestjs/throttler';

interface CreateInviteDto {
  email: string;
  role: string;
}

interface RequestWithUser {
  user?: {
    role: string;
  };
}

@Controller()
export class InvitesController {
  constructor(private readonly invitesService: InvitesService) {}

  @Post('orgs/:id/invites')
  async create(
    @Param('id') orgId: string,
    @Body() body: CreateInviteDto,
    @Req() req: RequestWithUser,
  ) {
    // Assuming req.user is set by some guard
    const actorRole = req.user?.role || 'admin';
    return this.invitesService.create(orgId, body.email, body.role, actorRole);
  }

  @Post('invites/:id/accept')
  @Throttle({ name: 'burst', limit: 5, ttl: 10000 })
  async accept(@Param('id') id: string) {
    return this.invitesService.accept(id);
  }

  @Delete('invites/:id')
  async revoke(@Param('id') id: string) {
    return this.invitesService.revoke(id);
  }

  @Get('orgs/:id/invites')
  async list(@Param('id') orgId: string) {
    return this.invitesService.list(orgId);
  }
}
