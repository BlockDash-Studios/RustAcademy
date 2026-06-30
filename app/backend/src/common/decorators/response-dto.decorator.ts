import { SetMetadata } from "@nestjs/common";

export const RESPONSE_DTO_KEY = "response:dto";

/**
 * Attach a response DTO class to a route handler or controller.
 * The global ResponseValidationInterceptor will validate outgoing
 * responses against this DTO and fail-fast if the shape drifts.
 */
export const ResponseDto = (dto: unknown) => SetMetadata(RESPONSE_DTO_KEY, dto);
