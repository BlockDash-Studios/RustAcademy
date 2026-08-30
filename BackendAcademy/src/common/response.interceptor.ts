import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs-common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface ResponseEnvelope<T> {
  success: boolean;
  code: string;
  data: T;
}

@Injectable()\nexport class ResponseInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T>> {
  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ResponseEnvelope<T>> {
    return next.handle().pipe(
      map((rawData) => {
        // If the service already returned an envelope, unwrap it for consistency
        let data = rawData;
        if (this.isEnvelope(rawData)) {
          data = (rawData as any).data;
        }
        return {
          success: true,
          code: 'OK',
          data,
        };
      }),
    );
  }

  private isEnvelope(value: any): boolean {
    return value !== null && typeof value === 'object' && 'success' in value && 'data' in value;
  }
}
