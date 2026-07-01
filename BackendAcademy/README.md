# BackendAcademy

RustAcademy backend module — placeholder for future NestJS backend implementation.

## Getting Started

```bash
pnpm install
pnpm run dev
```

## Structure

- `src/` — Application source code (NestJS modules, controllers, services)
- `test/` — Test files

See `app/backend/` for the primary backend implementation and conventions.

---

# Backend Guide for shadcn/ui

When integrating a frontend built with **shadcn/ui**, backend endpoints should provide consistent and predictable JSON responses to simplify component integration.

## Success Response

```json
{
  "success": true,
  "data": {},
  "message": "Request completed successfully"
}
```

## Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "fields": {
      "email": "Email is required"
    }
  }
}
```

## Recommendations

- Return consistent response structures.
- Use proper HTTP status codes.
- Include field-level validation errors.
- Support pagination for table components.
- Keep payloads predictable for frontend consumers.
- Avoid exposing internal implementation details.

## Example Table Response

```json
{
  "success": true,
  "data": {
    "items": [],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 0
    }
  }
}
```

## Example Select Response

```json
{
  "success": true,
  "data": [
    {
      "label": "Admin",
      "value": "admin"
    },
    {
      "label": "User",
      "value": "user"
    }
  ]
}
```