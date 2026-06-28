import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { validateEnv } from "./config/env";
import { DatabaseModule } from "./database/database.module";
import { AuthModule } from "./auth/auth.module";
import { AdoModule } from "./ado/ado.module";
import { SessionsModule } from "./sessions/sessions.module";
import { SyncModule } from "./sync/sync.module";
import { WritebackModule } from "./writeback/writeback.module";
import { RealtimeModule } from "./realtime/realtime.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    DatabaseModule,
    AuthModule,
    AdoModule,
    SessionsModule,
    SyncModule,
    WritebackModule,
    RealtimeModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
