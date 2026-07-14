import { NestFactory } from "@nestjs/core";
import { NestExpressApplication } from "@nestjs/platform-express";
import cookieParser from "cookie-parser";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Derrière DEUX proxys en prod (edge byimad → Caddy interne) : il faut
  // remonter 2 sauts dans X-Forwarded-For pour retrouver l'IP client réelle —
  // sinon req.ip = IP de l'edge, le rate-limit login partage un unique bucket
  // global et 10 échecs cumulés verrouillent la connexion de tout le monde.
  // Nécessite trusted_proxies sur le Caddy interne (deploy/Caddyfile), sans quoi
  // il remplace le X-Forwarded-For posé par l'edge.
  app.set("trust proxy", 2);
  // Secret requis (validé par le schéma env) : signe les cookies d'identité.
  app.use(cookieParser(process.env.SESSION_SECRET));
  app.enableCors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  });
  await app.listen(process.env.PORT || 3000);
}
bootstrap();
