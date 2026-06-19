import "reflect-metadata";
import { ResponseValidationInterceptor } from "./response-validation.interceptor";
import { RESPONSE_DTO_KEY } from "../decorators/response-dto.decorator";
import { of, lastValueFrom } from "rxjs";
import { InternalServerErrorException } from "@nestjs/common";
import { plainToInstance } from "class-transformer";
import { IsString } from "class-validator";

class TestDto {
  @IsString()
  name!: string;
}

describe("ResponseValidationInterceptor", () => {
  const interceptor = new ResponseValidationInterceptor();

  it("passes when response matches DTO", async () => {
    const handler = () => {};
    Reflect.defineMetadata(RESPONSE_DTO_KEY, TestDto, handler);

    const context: any = {
      getHandler: () => handler,
      getClass: () => ({}),
    };

    const result$ = interceptor.intercept(context as any, {
      handle: () => of({ name: "Alice" }),
    } as any);

    const out = await lastValueFrom(result$);
    expect(out).toBeInstanceOf(TestDto);
    expect((out as any).name).toEqual("Alice");
  });

  it("throws when response is missing required fields", async () => {
    const handler = () => {};
    Reflect.defineMetadata(RESPONSE_DTO_KEY, TestDto, handler);

    const context: any = {
      getHandler: () => handler,
      getClass: () => ({}),
    };

    const result$ = interceptor.intercept(context as any, {
      handle: () => of({}),
    } as any);

    await expect(lastValueFrom(result$)).rejects.toThrow(InternalServerErrorException);
  });
});
