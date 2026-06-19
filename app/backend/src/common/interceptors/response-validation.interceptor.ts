import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  InternalServerErrorException,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { Reflector } from "@nestjs/core";
import { RESPONSE_DTO_KEY } from "../decorators/response-dto.decorator";

@Injectable()
export class ResponseValidationInterceptor implements NestInterceptor {
  constructor(private readonly reflector = new Reflector()) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const handler = context.getHandler();
    const controller = context.getClass();

    const dto = this.reflector.get<any>(RESPONSE_DTO_KEY, handler) ||
      this.reflector.get<any>(RESPONSE_DTO_KEY, controller);

    if (!dto) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => {
        // Validate arrays of items as a whole by mapping each element.
        if (Array.isArray(data)) {
          const instances = data.map((d) => plainToInstance(dto, d));
          const allErrors = instances
            .map((inst) => validateSync(inst as object, { whitelist: true }))
            .flat();
          if (allErrors.length > 0) {
            throw new InternalServerErrorException({
              code: "RESPONSE_VALIDATION_ERROR",
              message: "Response validation failed (array)",
              details: allErrors,
            });
          }
          return instances;
        }

        const instance = plainToInstance(dto, data);
        const errors = validateSync(instance as object, { whitelist: true });
        if (errors.length > 0) {
          throw new InternalServerErrorException({
            code: "RESPONSE_VALIDATION_ERROR",
            message: "Response validation failed",
            details: errors,
          });
        }
        return instance;
      }),
    );
  }
}
