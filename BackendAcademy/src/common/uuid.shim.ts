import * as crypto from 'node:crypto';

export const v4 = (): string => crypto.randomUUID();
export const validate = (uuid: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid);

export default {
  v4,
  validate,
};
