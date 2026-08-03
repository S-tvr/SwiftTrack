import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Asserts that this property is exactly `<other property> - 1`.
 *
 * Used to keep `cycleEndDay` pinned to `cycleStartDay - 1`, so consecutive pay
 * cycles are contiguous — no shift can fall into a gap between two cycles or
 * into both at once. The admin UI (step 13) offers only valid pairs, which
 * makes the mistake impossible by accident; this makes it impossible at all,
 * including from Swagger UI, curl, or a future rewrite of the form.
 */
export function IsDayBefore(
  property: string,
  validationOptions?: ValidationOptions,
): (object: object, propertyName: string) => void {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isDayBefore',
      target: object.constructor,
      propertyName,
      constraints: [property],
      options: validationOptions,
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const [relatedPropertyName] = args.constraints as [string];
          const relatedValue = (args.object as Record<string, unknown>)[
            relatedPropertyName
          ];
          return (
            typeof value === 'number' &&
            typeof relatedValue === 'number' &&
            value === relatedValue - 1
          );
        },
        defaultMessage(args: ValidationArguments): string {
          const [relatedPropertyName] = args.constraints as [string];
          return `${args.property} must be exactly ${relatedPropertyName} - 1.`;
        },
      },
    });
  };
}
