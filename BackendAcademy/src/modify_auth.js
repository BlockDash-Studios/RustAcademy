const fs = require('fs');
let code = fs.readFileSync('auth/auth-session.service.ts', 'utf8');

code = code.replace(
  "import { JwtService } from '@nestjs/jwt';",
  "import { JwtService } from '@nestjs/jwt';\nimport { AuditLogService } from '../audit/audit.service';"
);

code = code.replace(
  "constructor(\n    private readonly jwtService: JwtService,",
  "constructor(\n    private readonly jwtService: JwtService,\n    private readonly auditService: AuditLogService,"
);

// We need to instrument the methods to log audit events.
// Instead of complex regex, let's just write another script or manually do it.
fs.writeFileSync('auth/auth-session.service.ts', code);
