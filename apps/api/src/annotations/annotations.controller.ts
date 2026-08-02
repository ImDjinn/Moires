import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { AuthGuard } from "../auth/auth.guard";
import { SessionMemberGuard } from "../sessions/session-access";
import { str, int, color } from "../common/validate";
import { AnnotationsService } from "./annotations.service";

interface MilestoneBody {
  title?: unknown;
  iter?: unknown;
  color?: unknown;
}
interface RowPinBody extends MilestoneBody {
  rowKey?: unknown;
}

@Controller("sessions/:id")
@UseGuards(AuthGuard, SessionMemberGuard)
export class AnnotationsController {
  constructor(private svc: AnnotationsService) {}

  @Get("annotations")
  list(@Param("id") id: string) {
    return this.svc.list(id);
  }

  @Post("milestones")
  createMilestone(@Param("id") id: string, @Body() b: MilestoneBody) {
    return this.svc.createMilestone(id, { title: str(b.title, "title", 200), iter: int(b.iter, "iter"), color: color(b.color, "color") });
  }

  @Patch("milestones/:mid")
  updateMilestone(@Param("id") id: string, @Param("mid") mid: string, @Body() b: MilestoneBody) {
    const data: Partial<{ title: string; iter: number; color: string }> = {};
    if (b.title !== undefined) data.title = str(b.title, "title", 200);
    if (b.iter !== undefined) data.iter = int(b.iter, "iter");
    if (b.color !== undefined) data.color = color(b.color, "color");
    return this.svc.updateMilestone(id, mid, data);
  }

  @Delete("milestones/:mid")
  deleteMilestone(@Param("id") id: string, @Param("mid") mid: string) {
    return this.svc.deleteMilestone(id, mid);
  }

  @Post("row-pins")
  createRowPin(@Param("id") id: string, @Body() b: RowPinBody) {
    return this.svc.createRowPin(id, {
      rowKey: str(b.rowKey, "rowKey", 200),
      iter: int(b.iter, "iter"),
      title: str(b.title, "title", 200),
      color: color(b.color, "color"),
    });
  }

  @Patch("row-pins/:pid")
  updateRowPin(@Param("id") id: string, @Param("pid") pid: string, @Body() b: RowPinBody) {
    const data: Partial<{ iter: number; title: string; color: string }> = {};
    if (b.iter !== undefined) data.iter = int(b.iter, "iter");
    if (b.title !== undefined) data.title = str(b.title, "title", 200);
    if (b.color !== undefined) data.color = color(b.color, "color");
    return this.svc.updateRowPin(id, pid, data);
  }

  @Delete("row-pins/:pid")
  deleteRowPin(@Param("id") id: string, @Param("pid") pid: string) {
    return this.svc.deleteRowPin(id, pid);
  }
}
