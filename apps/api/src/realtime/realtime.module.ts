import { Module } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";
import { OperationsHandler } from "./operations.handler";
import { PresenceHandler } from "./presence.handler";
import { SessionsModule } from "../sessions/sessions.module";

@Module({
  imports: [SessionsModule],
  providers: [RealtimeGateway, OperationsHandler, PresenceHandler],
})
export class RealtimeModule {}
