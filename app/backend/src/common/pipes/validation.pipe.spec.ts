import { ValidationPipe, BadRequestException } from "@nestjs/common";
import { IsString, IsNumber, IsOptional } from "class-validator";
import { Type } from "class-transformer";

class TestQueryDto {
@IsOptional()
@Type(() => Number)
@IsNumber()
limit?: number;

@IsString()
name!: string;
}

describe("Global ValidationPipe (BA-008)", () => {
let pipe: ValidationPipe;

beforeEach(() => {
pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});
});

it("should transform primitive query types", async () => {
const result = await pipe.transform(
  { name: "test", limit: "25" },
  { type: "query", metatype: TestQueryDto }
);
expect(result.limit).toBe(25);
expect(typeof result.limit).toBe("number");
});

it("should throw 400 Bad Request when unknown non-whitelisted properties are passed", async () => {
await expect(
  pipe.transform(
    { name: "test", unknownField: "hacked" },
    { type: "body", metatype: TestQueryDto }
  )
).rejects.toThrow(BadRequestException);
});
});
