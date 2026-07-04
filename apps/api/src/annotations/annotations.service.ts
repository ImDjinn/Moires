import { Injectable } from "@nestjs/common";
import type { Milestone, RowPin } from "@moirai/shared";
import { PrismaService } from "../database/prisma.service";
import { RedisService } from "../database/redis.service";

type MilestoneRow = { id: string; title: string; iter: number; iterationPath: string | null; color: string };
type RowPinRow = { id: string; rowKey: string; iter: number; iterationPath: string | null; title: string; color: string };

@Injectable()
export class AnnotationsService {
  constructor(private prisma: PrismaService, private redis: RedisService) {}

  /** Projet ADO d'une session — clé de persistance partagée entre sessions. */
  private async projectOf(sessionId: string): Promise<string> {
    const s = await this.prisma.planningSession.findUniqueOrThrow({
      where: { id: sessionId },
      select: { adoProjectId: true },
    });
    return s.adoProjectId;
  }

  /**
   * Index d'itération d'une ligne, résolu pour la session courante : on suit le
   * chemin ADO stable (robuste au réordonnancement) ; à défaut (path absent ou
   * itération supprimée) on retombe sur le dernier index connu.
   */
  private iterOf(row: { iter: number; iterationPath: string | null }, pathToIndex: Map<string, number>): number {
    if (row.iterationPath) {
      const idx = pathToIndex.get(row.iterationPath);
      if (idx !== undefined) return idx;
    }
    return row.iter;
  }

  /** Chemin ADO stable de l'index d'itération, pour l'écrire comme clé durable. */
  private async pathForIter(sessionId: string, iter: number): Promise<string | null> {
    const iterations = await this.redis.getIterations(sessionId);
    return iterations[iter]?.path ?? null;
  }

  async list(sessionId: string): Promise<{ milestones: Milestone[]; rowPins: RowPin[] }> {
    const adoProjectId = await this.projectOf(sessionId);
    const iterations = await this.redis.getIterations(sessionId);
    const pathToIndex = new Map(iterations.map((it, i) => [it.path, i]));
    const [milestones, rowPins] = await Promise.all([
      this.prisma.milestone.findMany({ where: { adoProjectId } }),
      this.prisma.rowPin.findMany({ where: { adoProjectId } }),
    ]);
    return {
      milestones: (milestones as MilestoneRow[]).map((m) => ({
        id: m.id, title: m.title, color: m.color, iter: this.iterOf(m, pathToIndex),
      })),
      rowPins: (rowPins as RowPinRow[]).map((p) => ({
        id: p.id, rowKey: p.rowKey, title: p.title, color: p.color, iter: this.iterOf(p, pathToIndex),
      })),
    };
  }

  async createMilestone(sessionId: string, data: { title: string; iter: number; color: string }): Promise<Milestone> {
    const adoProjectId = await this.projectOf(sessionId);
    const iterationPath = await this.pathForIter(sessionId, data.iter);
    const m = await this.prisma.milestone.create({ data: { adoProjectId, iterationPath, ...data } });
    return { id: m.id, title: m.title, iter: m.iter, color: m.color };
  }

  async updateMilestone(sessionId: string, id: string, data: Partial<{ title: string; iter: number; color: string }>): Promise<Milestone> {
    const patch: Record<string, unknown> = { ...data };
    // Déplacement de sprint : on met à jour la clé stable en même temps que l'index.
    if (data.iter !== undefined) patch.iterationPath = await this.pathForIter(sessionId, data.iter);
    const m = await this.prisma.milestone.update({ where: { id }, data: patch });
    return { id: m.id, title: m.title, iter: m.iter, color: m.color };
  }

  async deleteMilestone(id: string): Promise<void> {
    await this.prisma.milestone.delete({ where: { id } });
  }

  async createRowPin(sessionId: string, data: { rowKey: string; iter: number; title: string; color: string }): Promise<RowPin> {
    const adoProjectId = await this.projectOf(sessionId);
    const iterationPath = await this.pathForIter(sessionId, data.iter);
    const p = await this.prisma.rowPin.create({ data: { adoProjectId, iterationPath, ...data } });
    return { id: p.id, rowKey: p.rowKey, iter: p.iter, title: p.title, color: p.color };
  }

  async updateRowPin(sessionId: string, id: string, data: Partial<{ iter: number; title: string; color: string }>): Promise<RowPin> {
    const patch: Record<string, unknown> = { ...data };
    if (data.iter !== undefined) patch.iterationPath = await this.pathForIter(sessionId, data.iter);
    const p = await this.prisma.rowPin.update({ where: { id }, data: patch });
    return { id: p.id, rowKey: p.rowKey, iter: p.iter, title: p.title, color: p.color };
  }

  async deleteRowPin(id: string): Promise<void> {
    await this.prisma.rowPin.delete({ where: { id } });
  }
}
