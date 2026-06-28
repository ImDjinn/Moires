import { Module } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { AdoModule } from "../ado/ado.module";

@Module({
  imports: [AdoModule],
  providers: [SyncService],
  exports: [SyncService],
})
export class SyncModule {}
