import { Module } from "@nestjs/common";
import { AdoController } from "./ado.controller";
import { AdoService } from "./ado.service";
import { AdoMapper } from "./ado.mapper";

@Module({
  controllers: [AdoController],
  providers: [AdoService, AdoMapper],
  exports: [AdoService, AdoMapper],
})
export class AdoModule {}
