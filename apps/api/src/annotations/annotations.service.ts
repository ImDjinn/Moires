import { Injectable } from "@nestjs/common";
import type { Milestone, RowPin } from "@moires/shared";
import { PrismaService } from "../database/prisma.service";

type MilestoneRow = { id: string; title: string; iter: number; color: string };
type RowPinRow = { id: string; rowKey: string; iter: number; title: string; color: string };

const toMilestone = (m: MilestoneRow): Milestone => ({ id: m.id, title: m.title, iter: m.iter, color: m.color });
const toRowPin = (p: RowPinRow): RowPin => ({ id: p.id, rowKey: p.rowKey, iter: p.iter, title: p.title, color: p.color });

@Injectable()
export class AnnotationsService {
  constructor(private prisma: PrismaService) {}

  async list(sessionId: string): Promise<{ milestones: Milestone[]; rowPins: RowPin[] }> {
    const [milestones, rowPins] = await Promise.all([
      this.prisma.milestone.findMany({ where: { sessionId } }),
      this.prisma.rowPin.findMany({ where: { sessionId } }),
    ]);
    return { milestones: milestones.map(toMilestone), rowPins: rowPins.map(toRowPin) };
  }

  async createMilestone(sessionId: string, data: { title: string; iter: number; color: string }): Promise<Milestone> {
    return toMilestone(await this.prisma.milestone.create({ data: { sessionId, ...data } }));
  }

  async updateMilestone(id: string, data: Partial<{ title: string; iter: number; color: string }>): Promise<Milestone> {
    return toMilestone(await this.prisma.milestone.update({ where: { id }, data }));
  }

  async deleteMilestone(id: string): Promise<void> {
    await this.prisma.milestone.delete({ where: { id } });
  }

  async createRowPin(sessionId: string, data: { rowKey: string; iter: number; title: string; color: string }): Promise<RowPin> {
    return toRowPin(await this.prisma.rowPin.create({ data: { sessionId, ...data } }));
  }

  async updateRowPin(id: string, data: Partial<{ iter: number; title: string; color: string }>): Promise<RowPin> {
    return toRowPin(await this.prisma.rowPin.update({ where: { id }, data }));
  }

  async deleteRowPin(id: string): Promise<void> {
    await this.prisma.rowPin.delete({ where: { id } });
  }
}
