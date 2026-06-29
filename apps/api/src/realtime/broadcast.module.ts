import { Global, Module } from "@nestjs/common";
import { BroadcastService } from "./broadcast.service";

@Global()
@Module({
  providers: [BroadcastService],
  exports: [BroadcastService],
})
export class BroadcastModule {}
