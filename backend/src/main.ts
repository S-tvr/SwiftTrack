import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/logging/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

  // ⚠️ A testing app does not inherit this — `test/helpers/app.ts` re-applies
  // it, for the same reason it re-applies the pipe above.
  app.useGlobalFilters(
    new AllExceptionsFilter(app.get(HttpAdapterHost).httpAdapter),
  );

  // Without this, `PrismaService.onModuleDestroy` never runs, so every
  // `docker compose restart/stop` drops the pool mid-flight.
  app.enableShutdownHooks();

  app.enableCors({
    origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('SwiftTrack API')
    .setDescription('Time tracking & payroll API — Phase 1')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const swaggerDocument = () =>
    SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api', app, swaggerDocument, {
    // Keeps the pasted bearer token across page reloads. The step-8 sweep is
    // driven entirely from this UI, and without it every refresh means logging
    // in again and re-authorizing before the next request.
    swaggerOptions: { persistAuthorization: true },
  });

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  new Logger('Bootstrap').log(
    `SwiftTrack API listening on :${port} (NODE_ENV=${process.env.NODE_ENV ?? 'development'})`,
  );
}
void bootstrap();
