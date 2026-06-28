import { CanActivate, ExecutionContext } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
export interface TutorJwtPayload {
    sub: string;
    role: string;
    iat?: number;
    exp?: number;
}
export declare class JwtTutorGuard implements CanActivate {
    private readonly jwtService;
    constructor(jwtService: JwtService);
    canActivate(context: ExecutionContext): Promise<boolean>;
    private extractBearerToken;
}
