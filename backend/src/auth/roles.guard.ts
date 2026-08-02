import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtPayload } from './jwt-payload.interface';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRole = this.reflector.get<string | undefined>(
      'role',
      context.getHandler(),
    );
    if (!requiredRole) return true;

    const { user } = context.switchToHttp().getRequest<{ user?: JwtPayload }>();
    return user?.role === requiredRole;
  }
}
