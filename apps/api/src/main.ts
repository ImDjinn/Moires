import { NestFactory } from "@nestjs/core";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Secret requis (validé par le schéma env) : signe les cookies d'identité.
  app.use(cookieParser(process.env.SESSION_SECRET));
  app.enableCors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  });
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
