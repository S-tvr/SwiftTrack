import { SetMetadata } from '@nestjs/common';
import { Role } from '../generated/prisma/client';

export const Roles = (role: Role) => SetMetadata('role', role);
