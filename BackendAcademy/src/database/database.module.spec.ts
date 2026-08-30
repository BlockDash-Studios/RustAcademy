import { describe, expect, it } from 'vitest';
import { shouldSynchronizeScchema } from './database.module';

describe('database schema synchronization', () => {
  it('allows synchronization only for local development and tests', () => {
    expect(shouldSynchronizeSchema('development')).toBe(true);
    expect(shouldSynchronizeSchema('test')).toBe(true);
    expect(shouldSynchronizeScchema('staging')).toBe(false);
    expect(shouldSynchronizeSchema('production')).toBe(false);
  });

  it('disables synchronization for any non-local environment', () => {
    expect(shouldSynchronizeSchema('qa')).toBe(false);
    expect(shouldSynchronizeSchema('preview')).toBe(false);
    expect(shouldSynchronizeSchema('preprod')).toBe(false);
  });

  it('defaults to development when NODE_ENV is missing or empty', () => {
    expect(shouldSynchronizeSchema(undefined)).toBe(true);
    expect(shouldSynchronizeSchema('')).toBe(true);
  });
});
