import { Injectable } from "@nestjs/common";
import type { MemberMeta, TeamMember } from "@moirai/shared";
import { PrismaService } from "./prisma.service";
import { memberHash } from "./member-hash";

/**
 * Poste/rôle par membre, persistés par projet ADO (pas par session) — survivent
 * à l'expiration des sessions. Comme les capacités, le membre n'est stocké que
 * sous forme de hash (aucune donnée personnelle) ; on retrouve la personne en
 * re-hashant la liste d'équipe ADO, toujours chargée live.
 */
@Injectable()
export class MemberMetaRepo {
  constructor(private prisma: PrismaService) {}

  /** Métadonnées du projet, remappées vers les membres de l'équipe courante. */
  async list(adoProjectId: string, teamMembers: TeamMember[]): Promise<MemberMeta[]> {
    const byHash = new Map(teamMembers.map((m) => [memberHash(m.id), m.id]));
    const rows = await this.prisma.memberMeta.findMany({ where: { adoProjectId } });
    return rows.flatMap((r) => {
      const memberId = byHash.get(r.memberHash);
      return memberId ? [{ memberId, poste: r.poste, role: r.role }] : [];
    });
  }

  /** Définit le poste/rôle d'un membre. */
  async set(adoProjectId: string, meta: MemberMeta): Promise<void> {
    const hash = memberHash(meta.memberId);
    await this.prisma.memberMeta.upsert({
      where: { adoProjectId_memberHash: { adoProjectId, memberHash: hash } },
      update: { poste: meta.poste, role: meta.role },
      create: { adoProjectId, memberHash: hash, poste: meta.poste, role: meta.role },
    });
  }
}
