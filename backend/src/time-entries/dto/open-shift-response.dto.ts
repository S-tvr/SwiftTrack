import { ApiProperty } from '@nestjs/swagger';
import { TimeEntryResponseDto } from './time-entry-response.dto';

/**
 * `GET /time-entries/open` wraps its result instead of returning the entry (or
 * null) directly, because Nest answers a bare `null` with an **empty body**,
 * not with the JSON literal `null` — `RouterResponseController` calls
 * `res.send()` for a nil result. The Clock page's `api/client.ts` wrapper does
 * `res.json()` on every response, which throws on an empty body, so the one
 * endpoint whose normal answer is "nothing" would be the one that breaks it.
 *
 * Wrapping keeps a single always-valid JSON shape, and gives Swagger something
 * to describe that a nullable $ref cannot express cleanly.
 */
export class OpenShiftResponseDto {
  @ApiProperty({
    type: TimeEntryResponseDto,
    nullable: true,
    description:
      'The caller’s open shift, or null when they are not clocked in. This is what the Clock button renders its label from — it cannot read the list instead, because an open shift started in a previous cycle is filtered out of the current one.',
  })
  openShift!: TimeEntryResponseDto | null;
}
