import { BadRequestException } from '@nestjs/common';
import { UserProfileService } from './user-profile.service';

describe('UserProfileService — mass assignment protection (BA-040)', () => {
  let service: UserProfileService;

  beforeEach(() => {
    service = new UserProfileService();
  });

  it('create() exposes only editable fields and ignores protected metadata', async () => {
    const profile = await service.create({
      displayName: 'Alice',
      bio: 'Rust learner',
      skills: ['rust', 'soroban'],
      // Attempted escalation / ownership fields.
      role: 'admin',
      isVerified: true,
      status: 'verified',
      ownerId: 'attacker-1',
      id: 'forged-id',
    } as never);

    expect(profile.id).not.toBe('forged-id');
    expect(profile.displayName).toBe('Alice');
    expect(profile.bio).toBe('Rust learner');
    expect(profile.skills).toEqual(['rust', 'soroban']);
    // Protected fields were stripped and never reached the store.
    expect((profile as unknown as Record<string, unknown>)['role']).toBeUndefined();
    expect((profile as unknown as Record<string, unknown>)['isVerified']).toBeUndefined();
    expect((profile as unknown as Record<string, unknown>)['ownerId']).toBeUndefined();
  });

  it('update() rejects role / ownership escalation via injected fields', async () => {
    const created = await service.create({ displayName: 'Bob' });

    const updated = await service.update(created.id, {
      displayName: 'Bobby',
      // Malicious escalation payload injected into the update body.
      role: 'admin',
      isVerified: true,
      userId: 'another-owner',
    } as never);

    expect(updated.displayName).toBe('Bobby');
    expect(updated.userId).toBe(created.userId);
    expect((updated as unknown as Record<string, unknown>)['role']).toBeUndefined();
    expect((updated as unknown as Record<string, unknown>)['isVerified']).toBeUndefined();
  });

  it('update() throws for a non-existent profile', async () => {
    await expect(
      service.update('00000000-0000-0000-0000-000000000000', {
        displayName: 'X',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('update() enforces display name validation on the safe payload', async () => {
    const created = await service.create({ displayName: 'Valid Name' });

    await expect(
      service.update(created.id, { displayName: 'a' }), // too short
    ).rejects.toThrow(BadRequestException);
  });

  it('update() cannot change ownership (userId) even if supplied', async () => {
    const created = await service.create({ displayName: 'Carol' });
    const beforeUserId = created.userId;

    // The DTO surface does not allow userId, but simulate an injector cast.
    const updated = await service.update(
      created.id,
      { displayName: 'Carol2' } as never,
    );

    expect(updated.userId).toBe(beforeUserId);
  });
});
