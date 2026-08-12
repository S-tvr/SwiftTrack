import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { App } from 'supertest/types';

import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';

export interface E2EContext {
  app: INestApplication;
  /**
   * What `request()` is called with. `app.getHttpServer()` is typed `any`, so
   * narrowing it once here keeps every spec free of unsafe-argument casts.
   */
  server: App;
  prisma: PrismaService;
}

/**
 * Boots the real AppModule — every module, every guard, every pipe.
 *
 * ⚠️ The global `ValidationPipe` and CORS are registered in `main.ts`, which a
 * testing application never executes: `createNestApplication()` builds the app
 * from the module graph only. They are therefore re-applied here, and the
 * settings must stay identical to `main.ts`. Without the pipe every validation
 * assertion in the suite passes for the wrong reason — a body with an
 * unexpected field would be accepted, and the test asserting 400 would be the
 * one reporting the bug rather than the code. `auth.e2e-spec.ts` has a smoke
 * test for exactly this, so the harness cannot rot silently.
 */
export interface CreateTestAppOptions {
  /**
   * Leave the real `ThrottlerGuard` in place. Off by default, and that default
   * is deliberate.
   *
   * `/auth/login` and `/auth/set-initial-password` allow 5 requests per 60s per
   * IP, and every request in this suite comes from the same IP. A suite that
   * logs in for each of ~25 tests would start collecting 429s that have nothing
   * to do with what the failing test asserts — the exact category of false red
   * that the 8b-1 smoke tests exist to rule out. Throttling is therefore proved
   * once, on purpose, in `throttling.e2e-spec.ts`, which passes `true` here.
   */
  throttling?: boolean;
}

export async function createTestApp(
  options: CreateTestAppOptions = {},
): Promise<E2EContext> {
  const builder = Test.createTestingModule({ imports: [AppModule] });

  if (!options.throttling) {
    builder
      .overrideGuard(ThrottlerGuard)
      .useValue({ canActivate: (): boolean => true });
  }

  const moduleRef = await builder.compile();

  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  });

  // Required before the app can serve requests (NestJS docs, e2e section).
  // Note it does NOT bind a port — supertest talks to the server object
  // directly, so the suite cannot collide with a dev server on 3000.
  await app.init();

  return {
    app,
    server: app.getHttpServer() as App,
    prisma: app.get(PrismaService),
  };
}
