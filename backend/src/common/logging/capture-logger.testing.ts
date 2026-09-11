import { Logger } from '@nestjs/common';

/**
 * Collects what the Nest logger was asked to write, at every level. Shared by
 * both logging specs so they cannot disagree about what "nothing was logged"
 * captures.
 *
 * ⚠️ `.testing.ts`, not `.spec.ts` — jest's `testRegex` matches the latter and a
 * helper with no `it()` fails the run.
 */
export function captureLogger() {
  const lines: string[] = [];
  const record = (message: unknown, ...rest: unknown[]) => {
    lines.push([message, ...rest].join(' '));
  };

  const spies = [
    jest.spyOn(Logger.prototype, 'error').mockImplementation(record),
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(record),
    jest.spyOn(Logger.prototype, 'log').mockImplementation(record),
  ];

  return {
    lines,
    /** Everything written, as one string — what the `toContain` checks read. */
    get text() {
      return lines.join('\n');
    },
    restore: () => spies.forEach((spy) => spy.mockRestore()),
  };
}
