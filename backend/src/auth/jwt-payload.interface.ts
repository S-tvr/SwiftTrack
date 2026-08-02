import { Role } from '../generated/prisma/client';

export interface JwtPayload {
  userId: number;
  role: Role;
}
