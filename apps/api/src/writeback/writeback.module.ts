import { Module } from "@nestjs/common";
import { WritebackService } from "./writeback.service";
import { WritebackProcessor } from "./writeback.processor";
import { AdoModule } from "../ado/ado.module";

@Module({
  imports: [AdoModule],
  providers: [WritebackService, WritebackProcessor],
  exports: [WritebackService],
})
export class WritebackModule {}
