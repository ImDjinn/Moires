import { Module } from "@nestjs/common";
import { SyncService } from "./sync.service";
import { AdoWebhookService } from "./ado-webhook.service";
import { AdoWebhookController } from "./ado-webhook.controller";
import { AdoModule } from "../ado/ado.module";

@Module({
  imports: [AdoModule],
  controllers: [AdoWebhookController],
  providers: [SyncService, AdoWebhookService],
  exports: [SyncService],
})
export class SyncModule {}
