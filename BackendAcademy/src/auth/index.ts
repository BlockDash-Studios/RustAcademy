export { AuthModule } from './auth.module';
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { JwtLearnerGuard } from './guards/jwt-learner.guard';
export { JwtTutorGuard } from './guards/jwt-tutor.guard';
export { JwtAdminGuard } from './guards/jwt-admin.guard';
export { RolesGuard } from './guards/roles.guard';
export { SubjectOwnershipGuard } from './guards/subject-ownership.guard';
export { Roles, ROLES_KEY } from './decorators/roles.decorator';
export { Ownership, OWNERSHIP_KEY } from './decorators/ownership.decorator';
export { assertSameSubject, assertOwnerOrStaff } from './helpers/subject.helper';
export { UserRole } from './enums/user-role.enum';
export { JwtPayload } from './interfaces/jwt-payload.interface';
export { AuthSessionService } from './auth-session.service';
export { AuthSessionController } from './auth-session.controller';
export { LoginDto } from './dto/login.dto';
export { RefreshTokenDto } from './dto/refresh-token.dto';
export type {
  Session,
  RefreshTokenPayload,
  AuthTokensResponse,
} from './interfaces/session.interface';
