import { Role } from '../generated/prisma/client';

/**
 * What is signed into the JWT, and what `req.user` holds — the two are kept
 * identical on purpose, so a reader never has to ask which one they are looking
 * at. `JwtStrategy.validate()` fills every field from the **database row**
 * rather than echoing the payload back, so `req.user` is current rather than
 * whatever was true when the token was signed.
 *
 * `tokenVersion` (step 8f) is what makes a password change revoke every token
 * already issued: it is compared against the row on each request, and
 * `changePassword` increments it. Nothing outside `JwtStrategy` reads it.
 */
export interface JwtPayload {
  userId: number;
  role: Role;
  tokenVersion: number;
}
