import { Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import type { Capacity, TeamMember } from "@moirai/shared";
import { PrismaService } from "./prisma.service";

/**
 * Persistance des capacités par projet ADO (et non par session) : elles
 * survivent à l'expiration des sessions. En base, le membre n'est stocké que
 * sous forme de hash (aucune donnée personnelle) ; on retrouve la personne en
 * session en re-hashant la liste d'équipe ADO, toujours chargée live.
 */
@Injectable()
export class CapacitiesRepo {
  constructor(private prisma: PrismaService) {}

  /** Hash déterministe de l'identifiant ADO — non réversible en base. */
  private hash(memberId: string): string {
    return createHash("sha256").update(memberId).digest("hex");
  }

  /**
   * Capacités du projet, remappées vers les membres de l'équipe courante.
   * Les lignes dont le membre n'est plus dans l'équipe sont ignorées.
   */
  async list(adoProjectId: string, teamMembers: TeamMember[]): Promise<Capacity[]> {
    const byHash = new Map(teamMembers.map((m) => [this.hash(m.id), m.id]));
    const rows = await this.prisma.capacity.findMany({ where: { adoProjectId } });
    return rows.flatMap((r) => {
      const memberId = byHash.get(r.memberHash);
      return memberId ? [{ memberId, iterationPath: r.iterationPath, storyPoints: r.value }] : [];
    });
  }

  /** Définit une capacité. 0 = absent (ligne conservée) ; négatif = suppression (retour au défaut). */
  async set(adoProjectId: string, cap: Capacity): Promise<void> {
    const memberHash = this.hash(cap.memberId);
    const id = { adoProjectId_iterationPath_memberHash: { adoProjectId, iterationPath: cap.iterationPath, memberHash } };
    if (cap.storyPoints < 0) {
      await this.prisma.capacity.deleteMany({ where: { adoProjectId, iterationPath: cap.iterationPath, memberHash } });
      return;
    }
    await this.prisma.capacity.upsert({
      where: id,
      update: { value: cap.storyPoints },
      create: { adoProjectId, iterationPath: cap.iterationPath, memberHash, value: cap.storyPoints },
    });
  }

  /**
   * Amorce les capacités depuis ADO sans écraser l'existant : seules les lignes
   * absentes sont créées (skipDuplicates). Une capacité déjà saisie est préservée.
   */
  async seed(adoProjectId: string, capacities: Capacity[]): Promise<void> {
    if (!capacities.length) return;
    await this.prisma.capacity.createMany({
      data: capacities.map((c) => ({
        adoProjectId,
        iterationPath: c.iterationPath,
        memberHash: this.hash(c.memberId),
        value: c.storyPoints,
      })),
      skipDuplicates: true,
    });
  }
}
