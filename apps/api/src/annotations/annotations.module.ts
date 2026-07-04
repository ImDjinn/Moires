import { Module } from "@nestjs/common";
import { AnnotationsController } from "./annotations.controller";
import { AnnotationsService } from "./annotations.service";
import { SessionMemberGuard } from "../sessions/session-access";

@Module({
  controllers: [AnnotationsController],
  providers: [AnnotationsService, SessionMemberGuard],
})
export class AnnotationsModule {}
