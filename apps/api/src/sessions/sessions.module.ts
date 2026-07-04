import { Module } from "@nestjs/common";
import { SessionsController } from "./sessions.controller";
import { SessionsService } from "./sessions.service";
import { SessionMemberGuard } from "./session-access";
import { AdoModule } from "../ado/ado.module";
import { SyncModule } from "../sync/sync.module";
import { WritebackModule } from "../writeback/writeback.module";

@Module({
  imports: [AdoModule, SyncModule, WritebackModule],
  controllers: [SessionsController],
  providers: [SessionsService, SessionMemberGuard],
  exports: [SessionsService, SessionMemberGuard],
})
export class SessionsModule {}
