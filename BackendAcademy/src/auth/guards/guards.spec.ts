import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { JwtAdminGuard } from './jwt-admin.guard';
import { JwtTutorGuard } from './jwt-tutor.guard';
import { JwtLearnerGuard } from './jwt-learner.guard';
import { RolesGuard } from './roles.guard';
import { SubjectOwnershipGuard } from './subject-ownership.guard';
import { UserRole } from '../enums/user-role.enum';
import { JwtPayload } from '../interfaces/jwt-payload.interface';

function mockJwtService(verify?: jest.Mock) {
  return {
    verifyAsync: verify ?? jest.fn(),
  } as unknown as JwtService;
}

function mockContext(req: Record<string, unknown>): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function payload(sub: string, role: UserRole): JwtPayload {
  return { sub, role };
}

describe('JwtAuthGuard', () => {
  it('rejects requests without a Bearer token', async () => {
    const guard = new JwtAuthGuard(mockJwtService());
    await expect(
      guard.canActivate(mockContext({ headers: {} })),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects requests with an invalid token', async () => {
    const guard = new JwtAuthGuard(
      mockJwtService(jest.fn().mockRejectedValue(new Error('bad signature'))),
    );
    await expect(
      guard.canActivate(
        mockContext({ headers: { authorization: 'Bearer not.a.token' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects tokens without a subject', async () => {
    const guard = new JwtAuthGuard(
      mockJwtService(jest.fn().mockResolvedValue({ role: UserRole.LEARNER })),
    );
    await expect(
      guard.canActivate(
        mockContext({ headers: { authorization: 'Bearer valid' } }),
      ),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('attaches the decoded payload to request.user for any role', async () => {
    const guard = new JwtAuthGuard(
      mockJwtService(jest.fn().mockResolvedValue(payload('u-1', UserRole.LEARNER))),
    );
    const req: any = { headers: { authorization: 'Bearer valid' } };
    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
    expect(req.user).toMatchObject({ sub: 'u-1' });
  });
});

describe('JwtAdminGuard', () => {
  it('forbids non-admin JWTs', async () => {
    const guard = new JwtAdminGuard(
      mockJwtService(jest.fn().mockResolvedValue(payload('u-1', UserRole.LEARNER))),
    );
    const req: any = { headers: { authorization: 'Bearer valid' } };
    await expect(guard.canActivate(mockContext(req))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('allows admin JWTs and attaches request.user', async () => {
    const guard = new JwtAdminGuard(
      mockJwtService(jest.fn().mockResolvedValue(payload('a-1', UserRole.ADMIN))),
    );
    const req: any = { headers: { authorization: 'Bearer valid' } };
    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
    expect(req.user).toMatchObject({ sub: 'a-1', role: UserRole.ADMIN });
  });
});

describe('JwtTutorGuard', () => {
  it('forbids non-tutor JWTs', async () => {
    const guard = new JwtTutorGuard(
      mockJwtService(jest.fn().mockResolvedValue(payload('u-1', UserRole.LEARNER))),
    );
    await expect(
      guard.canActivate(
        mockContext({ headers: { authorization: 'Bearer valid' } }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows tutor JWTs and attaches a standardized request.user', async () => {
    const guard = new JwtTutorGuard(
      mockJwtService(jest.fn().mockResolvedValue(payload('t-1', UserRole.TUTOR))),
    );
    const req: any = { headers: { authorization: 'Bearer valid' } };
    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
    expect(req.user).toMatchObject({ sub: 't-1', role: UserRole.TUTOR });
  });
});

describe('JwtLearnerGuard', () => {
  it('forbids non-learner JWTs', async () => {
    const guard = new JwtLearnerGuard(
      mockJwtService(jest.fn().mockResolvedValue(payload('t-1', UserRole.TUTOR))),
    );
    await expect(
      guard.canActivate(
        mockContext({ headers: { authorization: 'Bearer valid' } }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('allows learner JWTs', async () => {
    const guard = new JwtLearnerGuard(
      mockJwtService(jest.fn().mockResolvedValue(payload('l-1', UserRole.LEARNER))),
    );
    const req: any = { headers: { authorization: 'Bearer valid' } };
    await expect(guard.canActivate(mockContext(req))).resolves.toBe(true);
    expect(req.user).toMatchObject({ sub: 'l-1', role: UserRole.LEARNER });
  });
});

describe('RolesGuard', () => {
  it('allows when no roles are declared', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as any);
    const req: any = { user: payload('u-1', UserRole.LEARNER) };
    expect(guard.canActivate(mockContext(req))).toBe(true);
  });

  it('rejects when the user does not hold a declared role', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.ADMIN]),
    } as any);
    const req: any = { user: payload('u-1', UserRole.LEARNER) };
    expect(() => guard.canActivate(mockContext(req))).toThrow(ForbiddenException);
  });

  it('allows when the user holds a declared role', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest
        .fn()
        .mockReturnValue([UserRole.LEARNER, UserRole.ADMIN]),
    } as any);
    const req: any = { user: payload('u-1', UserRole.LEARNER) };
    expect(guard.canActivate(mockContext(req))).toBe(true);
  });

  it('rejects when no authenticated user is present', () => {
    const guard = new RolesGuard({
      getAllAndOverride: jest.fn().mockReturnValue([UserRole.LEARNER]),
    } as any);
    expect(() => guard.canActivate(mockContext({}))).toThrow(ForbiddenException);
  });
});

describe('SubjectOwnershipGuard', () => {
  const reflector = (params?: string[]) =>
    ({ getAllAndOverride: jest.fn().mockReturnValue(params) }) as any;

  it('rejects when the user is not authenticated', () => {
    const guard = new SubjectOwnershipGuard(reflector(['userId']));
    expect(() =>
      guard.canActivate(
        mockContext({ params: { userId: 'u-1' } }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('rejects when the route param belongs to another subject', () => {
    const guard = new SubjectOwnershipGuard(reflector(['userId']));
    const req: any = {
      user: payload('u-1', UserRole.LEARNER),
      params: { userId: 'u-2' },
    };
    expect(() => guard.canActivate(mockContext(req))).toThrow(ForbiddenException);
  });

  it('allows when the route param matches the authenticated subject', () => {
    const guard = new SubjectOwnershipGuard(reflector(['userId']));
    const req: any = {
      user: payload('u-1', UserRole.LEARNER),
      params: { userId: 'u-1' },
    };
    expect(guard.canActivate(mockContext(req))).toBe(true);
  });

  it('allows admins to operate across subjects', () => {
    const guard = new SubjectOwnershipGuard(reflector(['userId']));
    const req: any = {
      user: payload('a-1', UserRole.ADMIN),
      params: { userId: 'u-999' },
    };
    expect(guard.canActivate(mockContext(req))).toBe(true);
  });

  it('allows when no ownership params are declared', () => {
    const guard = new SubjectOwnershipGuard(reflector(undefined));
    const req: any = { user: payload('u-1', UserRole.LEARNER) };
    expect(guard.canActivate(mockContext(req))).toBe(true);
  });
});