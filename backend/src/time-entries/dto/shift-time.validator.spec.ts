import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateTimeEntryDto } from './create-time-entry.dto';
import { UpdateTimeEntryDto } from './update-time-entry.dto';

/**
 * Rules 1, 2 and 4 of spec §7a live in the DTOs, so they are proved here rather
 * than in the service spec — a service test would never see them, because Nest
 * applies validation in the HTTP layer.
 *
 * These run against the real DTO classes on purpose: testing the decorators in
 * isolation would still pass if one were attached to the wrong property or
 * carried the wrong message, and the messages are the §8a strings.
 *
 * What this does NOT prove: that main.ts actually registers the pipe. That is
 * step 8b's job.
 */

const NOW = new Date('2026-08-04T12:00:00.000Z');

async function messagesFor(
  cls: new () => object,
  payload: Record<string, unknown>,
): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, payload));
  return errors.flatMap((error) => Object.values(error.constraints ?? {}));
}

const validShift = {
  startTime: '2026-08-04T08:00:00.000Z',
  endTime: '2026-08-04T11:00:00.000Z',
};

describe('time-entry DTO validation', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('rule 2 — endTime may not precede startTime', () => {
    it('accepts a normal shift', async () => {
      await expect(
        messagesFor(CreateTimeEntryDto, validShift),
      ).resolves.toEqual([]);
    });

    it('accepts a zero-length shift, which is harmless and can carry notes', async () => {
      await expect(
        messagesFor(CreateTimeEntryDto, {
          startTime: '2026-08-04T08:00:00.000Z',
          endTime: '2026-08-04T08:00:00.000Z',
          notes: 'Placeholder',
        }),
      ).resolves.toEqual([]);
    });

    it('rejects a reversed shift with the §8a wording', async () => {
      await expect(
        messagesFor(CreateTimeEntryDto, {
          startTime: '2026-08-04T11:00:00.000Z',
          endTime: '2026-08-04T08:00:00.000Z',
        }),
      ).resolves.toContain('End time cannot be before start time.');
    });

    it('applies on update too, not only on create', async () => {
      await expect(
        messagesFor(UpdateTimeEntryDto, {
          startTime: '2026-08-04T11:00:00.000Z',
          endTime: '2026-08-04T08:00:00.000Z',
        }),
      ).resolves.toContain('End time cannot be before start time.');
    });
  });

  describe('rule 4 — neither timestamp may be in the future', () => {
    it('rejects a future startTime', async () => {
      await expect(
        messagesFor(CreateTimeEntryDto, {
          startTime: '2026-08-04T13:00:00.000Z',
          endTime: '2026-08-04T14:00:00.000Z',
        }),
      ).resolves.toContain('Start time cannot be in the future.');
    });

    it('rejects a future endTime on an otherwise valid shift', async () => {
      const messages = await messagesFor(CreateTimeEntryDto, {
        startTime: '2026-08-04T08:00:00.000Z',
        endTime: '2026-08-04T13:00:00.000Z',
      });
      expect(messages).toContain('End time cannot be in the future.');
      expect(messages).not.toContain('Start time cannot be in the future.');
    });

    it('accepts a timestamp exactly equal to now, so submitting the minute that just passed does not race', async () => {
      await expect(
        messagesFor(CreateTimeEntryDto, {
          startTime: '2026-08-04T08:00:00.000Z',
          endTime: NOW.toISOString(),
        }),
      ).resolves.toEqual([]);
    });
  });

  describe('rule 1 — the manual path never leaves a shift open', () => {
    it('rejects a missing endTime', async () => {
      const messages = await messagesFor(CreateTimeEntryDto, {
        startTime: '2026-08-04T08:00:00.000Z',
      });
      expect(messages.length).toBeGreaterThan(0);
    });

    it('rejects an explicitly null endTime, which would reopen a closed shift', async () => {
      const messages = await messagesFor(UpdateTimeEntryDto, {
        startTime: '2026-08-04T08:00:00.000Z',
        endTime: null,
      });
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('field hygiene', () => {
    it('reports an unparseable date once, not twice', async () => {
      // The cross-field validators pass a bad value through so @IsISO8601 owns
      // the error — otherwise one typo yields three messages.
      const messages = await messagesFor(CreateTimeEntryDto, {
        startTime: '2026-08-04T08:00:00.000Z',
        endTime: 'not-a-date',
      });
      expect(messages).toHaveLength(1);
    });

    it('rejects an impossible calendar date', async () => {
      const messages = await messagesFor(CreateTimeEntryDto, {
        startTime: '2026-02-30T08:00:00.000Z',
        endTime: '2026-08-04T11:00:00.000Z',
      });
      expect(messages.length).toBeGreaterThan(0);
    });

    it('caps notes at 500 characters', async () => {
      const messages = await messagesFor(CreateTimeEntryDto, {
        ...validShift,
        notes: 'x'.repeat(501),
      });
      expect(messages.length).toBeGreaterThan(0);
    });
  });

  describe('userId is accepted on create and forbidden on update', () => {
    // Rejection of an unknown property is the pipe's job, not validate()'s, so
    // this runs a pipe configured exactly as main.ts configures the global one.
    const pipe = new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    it('allows userId through CreateTimeEntryDto', async () => {
      await expect(
        pipe.transform(
          { ...validShift, userId: 2 },
          { type: 'body', metatype: CreateTimeEntryDto },
        ),
      ).resolves.toMatchObject({ userId: 2 });
    });

    it('rejects userId on UpdateTimeEntryDto — editing must never move a shift between people', async () => {
      // The pipe puts the field-level messages in the response body, not in
      // error.message, so asserting on the latter would pass for any 400.
      const rejection: unknown = await pipe
        .transform(
          { ...validShift, userId: 2 },
          { type: 'body', metatype: UpdateTimeEntryDto },
        )
        .then(
          () => null,
          (error: unknown) => error,
        );

      expect(rejection).toBeInstanceOf(BadRequestException);
      expect(
        JSON.stringify((rejection as BadRequestException).getResponse()),
      ).toContain('userId should not exist');
    });
  });
});
