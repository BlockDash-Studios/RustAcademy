import {
  PipeTransform,
  Injectable,
  BadRequestException,
  ArgumentMetadata,
} from '@nestjs/common';
import { ErrorCode } from './error-codes.constants';

export interface ValidationSchema {
  required?: string[];
  optional?: string[];
  optionalArrays?: string[];
  properties?: Record<string, { type: string; enum?: string[] }>;
}

@Injectable()
export class ValidationPipe implements PipeTransform<any> {
  private readonly schema: ValidationSchema;

  constructor(schema: ValidationSchema) {
    this.schema = schema;
  }

  transform(value: any, metadata: ArgumentMetadata): any {
    if (!value || typeof value !== 'object') {
      throw new BadRequestException({
        error: ErrorCode.VALIDATION_ERROR,
        message: 'Request body must be a JSON object',
      });
      throw new BadRequestException('Request body must be a JSON object');
    }

    if (this.schema.required) {
      for (const field of this.schema.required) {
        if (value[field] === undefined || value[field] === null) {
          throw new BadRequestException({
            error: ErrorCode.MISSING_PARAMETER,
            message: `Missing required field: ${field}`,
          });
          throw new BadRequestException(`Missing required field: ${field}`);
        }
      }
    }

    if (this.schema.properties) {
      for (const [field, rules] of Object.entries(this.schema.properties)) {
        const fieldValue = value[field];
        if (fieldValue !== undefined && fieldValue !== null) {
          if (rules.type === 'string' && typeof fieldValue !== 'string') {
            throw new BadRequestException({
              error: ErrorCode.INVALID_PARAMETER,
              message: `Field "${field}" must be a string`,
            });
          }
          if (rules.type === 'number' && typeof fieldValue !== 'number') {
            throw new BadRequestException({
              error: ErrorCode.INVALID_PARAMETER,
              message: `Field "${field}" must be a number`,
            });
          }
          if (rules.type === 'object' && (typeof fieldValue !== 'object' || Array.isArray(fieldValue))) {
            throw new BadRequestException({
              error: ErrorCode.INVALID_PARAMETER,
              message: `Field "${field}" must be an object`,
            });
          }
          if (rules.type === 'array' && !Array.isArray(fieldValue)) {
            throw new BadRequestException({
              error: ErrorCode.INVALID_PARAMETER,
              message: `Field "${field}" must be an array`,
            });
          }
          if (rules.enum && !rules.enum.includes(fieldValue)) {
            throw new BadRequestException({
              error: ErrorCode.INVALID_PARAMETER,
              message: `Field "${field}" must be one of: ${rules.enum.join(', ')}`,
            });
            throw new BadRequestException(`Field "${field}" must be a string`);
          }
          if (rules.type === 'number' && typeof fieldValue !== 'number') {
            throw new BadRequestException(`Field "${field}" must be a number`);
          }
          if (rules.type === 'object' && (typeof fieldValue !== 'object' || Array.isArray(fieldValue))) {
            throw new BadRequestException(`Field "${field}" must be an object`);
          }
          if (rules.type === 'array' && !Array.isArray(fieldValue)) {
            throw new BadRequestException(`Field "${field}" must be an array`);
          }
          if (rules.enum && !rules.enum.includes(fieldValue)) {
            throw new BadRequestException(
              `Field "${field}" must be one of: ${rules.enum.join(', ')}`,
            );
          }
        }
      }
    }

    return value;
  }
}