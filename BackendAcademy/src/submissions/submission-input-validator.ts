export const MAX_SOURCE_BYTES = 200_000;
export const ALLOWED_LANGUAGES = ['rust', 'typescript', 'python', 'go'] as const;
export type AllowedLanguage = (typeof ALLOWED_LANGUAGES)[number];

export class InvalidSubmissionInputError extends Error {}

/** Rejects unbounded or unsupported submission source before persistence. */
export function validateSubmissionInput(
  content: string,
  language: string,
  encoding: string,
): void {
  const byteLength = Buffer.byteLength(content, 'utf8');
  if (byteLength > MAX_SOURCE_BYTES) {
    throw new InvalidSubmissionInputError(
      `Source exceeds ${MAX_SOURCE_BYTES} bytes (got ${byteLength})`,
    );
  }
  if (!ALLOWED_LANGUAGES.includes(language as AllowedLanguage)) {
    throw new InvalidSubmissionInputError(`Unsupported language: ${language}`);
  }
  if (encoding.toLowerCase() !== 'utf-8' && encoding.toLowerCase() !== 'utf8') {
    throw new InvalidSubmissionInputError(`Unsupported encoding: ${encoding}`);
  }
}
