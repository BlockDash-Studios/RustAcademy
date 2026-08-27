import { UserRole } from '../enums/user-role.enum';

export interface JwtPayload {
  sub: string;
  role: UserRole;
  sessionId?: string;
  iat?: number;
  exp?: number;
}
