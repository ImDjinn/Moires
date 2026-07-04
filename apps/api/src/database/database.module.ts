import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";
import { RedisService } from "./redis.service";
import { CapacitiesRepo } from "./capacities.repo";
import { MemberMetaRepo } from "./member-meta.repo";

@Global()
@Module({
  providers: [PrismaService, RedisService, CapacitiesRepo, MemberMetaRepo],
  exports: [PrismaService, RedisService, CapacitiesRepo, MemberMetaRepo],
})
export class DatabaseModule {}
