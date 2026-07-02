import { Body, Controller, Delete, Get, Param, Patch, Post, BadRequestException, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { AnnotationsService } from "./annotations.service";

interface MilestoneBody {
  title?: unknown;
  iter?: unknown;
  color?: unknown;
}
interface RowPinBody extends MilestoneBody {
  rowKey?: unknown;
}

function str(v: unknown, field: string): string {
  if (typeof v !== "string" || !v.trim()) throw new BadRequestException(`${field} requis`);
  return v;
}
function int(v: unknown, field: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) throw new BadRequestException(`${field} invalide`);
  return n;
}

@Controller("sessions/:id")
@UseGuards(AuthGuard)
export class AnnotationsController {
  constructor(private svc: AnnotationsService) {}

  @Get("annotations")
  list(@Param("id") id: string) {
    return this.svc.list(id);
  }

  @Post("milestones")
  createMilestone(@Param("id") id: string, @Body() b: MilestoneBody) {
    return this.svc.createMilestone(id, { title: str(b.title, "title"), iter: int(b.iter, "iter"), color: str(b.color, "color") });
  }

  @Patch("milestones/:mid")
  updateMilestone(@Param("mid") mid: string, @Body() b: MilestoneBody) {
    const data: Partial<{ title: string; iter: number; color: string }> = {};
    if (b.title !== undefined) data.title = str(b.title, "title");
    if (b.iter !== undefined) data.iter = int(b.iter, "iter");
    if (b.color !== undefined) data.color = str(b.color, "color");
    return this.svc.updateMilestone(mid, data);
  }

  @Delete("milestones/:mid")
  deleteMilestone(@Param("mid") mid: string) {
    return this.svc.deleteMilestone(mid);
  }

  @Post("row-pins")
  createRowPin(@Param("id") id: string, @Body() b: RowPinBody) {
    return this.svc.createRowPin(id, {
      rowKey: str(b.rowKey, "rowKey"),
      iter: int(b.iter, "iter"),
      title: str(b.title, "title"),
      color: str(b.color, "color"),
    });
  }

  @Patch("row-pins/:pid")
  updateRowPin(@Param("pid") pid: string, @Body() b: RowPinBody) {
    const data: Partial<{ iter: number; title: string; color: string }> = {};
    if (b.iter !== undefined) data.iter = int(b.iter, "iter");
    if (b.title !== undefined) data.title = str(b.title, "title");
    if (b.color !== undefined) data.color = str(b.color, "color");
    return this.svc.updateRowPin(pid, data);
  }

  @Delete("row-pins/:pid")
  deleteRowPin(@Param("pid") pid: string) {
    return this.svc.deleteRowPin(pid);
  }
}
