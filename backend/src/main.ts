import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );

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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
