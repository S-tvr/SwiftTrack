import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Cross-field and clock-relative checks for the manual write path
 * (POST /time-entries, PUT /time-entries/:id). See spec §7a rules 2 and 4.
 *
 * Both validators pass an unparseable value through rather than failing it:
 * `@IsISO8601` on the same property already reports that, and failing here too
 * would return two error messages for one mistake.
 */

function toTime(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
}

/**
 * Asserts the timestamp is not *after* the moment the request is validated.
 * Equal to now passes, so submitting the minute that has just elapsed does not
 * race the request on its way to the server.
 *
 * This does more than reject obviously wrong data. Because time only moves
 * forward, a ledger in which no closed shift ever reaches `now` is one where a
 * clock-in at `now` cannot land inside an existing shift — which is what lets
 * clock-in keep its single cheap check instead of gaining an overlap query.
 */
export function IsNotInTheFuture(
  validationOptions?: ValidationOptions,
): (object: object, propertyName: string) => void {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isNotInTheFuture',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          const time = toTime(value);
          return time === null || time <= Date.now();
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} cannot be in the future.`;
        },
      },
    });
  };
}

/**
 * Asserts this timestamp is not *before* the one held by `property`. Equal is
 * allowed: a zero-length entry is harmless (it contributes 0 hours) and can
 * still carry notes, while a reversed one is impossible.
 *
 * Reversed shifts must be caught here rather than left to the arithmetic: the
 * payroll clipping clamps at 0, so an unvalidated reversed shift would sit in
 * the employee's list with real times on it and quietly pay nothing.
 */
export function IsNotBefore(
  property: string,
  validationOptions?: ValidationOptions,
): (object: object, propertyName: string) => void {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isNotBefore',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [relatedPropertyName] = args.constraints as [string];
          const time = toTime(value);
          const relatedTime = toTime(
            (args.object as Record<string, unknown>)[relatedPropertyName],
          );
          if (time === null || relatedTime === null) return true;
          return time >= relatedTime;
        },
        defaultMessage(args: ValidationArguments): string {
          const [relatedPropertyName] = args.constraints as [string];
          return `${args.property} cannot be before ${relatedPropertyName}.`;
        },
      },
    });
  };
}
