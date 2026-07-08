import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Derrière Caddy (un seul proxy) : req.ip = X-Forwarded-For réel au lieu de
  // l'IP du conteneur proxy — sinon le rate-limit login partage un unique bucket
  // global et 10 échecs cumulés verrouillent la connexion de tout le monde.
  app.set("trust proxy", 1);
  // Secret requis (validé par le schéma env) : signe les cookies d'identité.
  app.use(cookieParser(process.env.SESSION_SECRET));
  app.enableCors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  });
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
