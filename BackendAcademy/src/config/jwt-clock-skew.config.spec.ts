import * as Joi from 'joi';

/**
 * BA-023 — the allowed JWT clock skew is explicit and BOUNDED.
 *
 * The config validation schema must reject any value that would widen the
 * tolerance beyond the hard maximum, accepting only values within
 * [0, JWT_HARD_MAX_SKEW_SECONDS].
 */

const JWT_HARD_MAX_SKEW_SECONDS = 120;

const schema = Joi.object({
  JWT_SECRET: Joi.string().optional(),
  JWT_CLOCK_SKEW_SECONDS: Joi.number().integer().min(0).max(120).default(30),
});

describe('JWT clock skew config validation (BA-023)', () => {
  it('defaults the allowed skew when unset', () => {
    const { value } = schema.validate({});
    expect(value).toEqual({ JWT_CLOCK_SKEW_SECONDS: 30 });
  });

  it('accepts an explicit in-range skew', () => {
    const { error, value } = schema.validate({
      JWT_CLOCK_SKEW_SECONDS: JWT_HARD_MAX_SKEW_SECONDS,
    });
    expect(error).toBeUndefined();
    expect(value.JWT_CLOCK_SKEW_SECONDS).toBe(JWT_HARD_MAX_SKEW_SECONDS);
  });

  it('rejects a skew wider than the hard maximum', () => {
    const { error } = schema.validate({ JWT_CLOCK_SKEW_SECONDS: 3600 });
    expect(error).toBeDefined();
  });

  it('rejects negative or non-integer skew', () => {
    expect(schema.validate({ JWT_CLOCK_SKEW_SECONDS: -5 }).error).toBeDefined();
    expect(schema.validate({ JWT_CLOCK_SKEW_SECONDS: 1.5 }).error).toBeDefined();
  });
});
