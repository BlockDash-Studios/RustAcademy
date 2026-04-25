import { Injectable, ForbiddenException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class InvitesService {
  constructor(private readonly supabase: SupabaseService) {}

  async create(orgId: string, email: string, role: string, actorRole: string) {
    this.validateRoleScope(role, actorRole);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    return this.supabase.createInvite(orgId, email, role, expiresAt);
  }

  async accept(id: string) {
    return this.supabase.acceptInvite(id);
  }

  async revoke(id: string) {
    return this.supabase.revokeInvite(id);
  }

  async list(orgId: string) {
    return this.supabase.listInvites(orgId);
  }

  private validateRoleScope(targetRole: string, actorRole: string) {
    if (actorRole === 'admin') return;
    if (actorRole === 'ngo') {
      if (targetRole === 'admin') {
        throw new ForbiddenException('NGO cannot invite Admin');
      }
      return;
    }
    throw new ForbiddenException('Insufficient permissions to invite');
  }
}
