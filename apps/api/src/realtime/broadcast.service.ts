import { Injectable } from "@nestjs/common";
import { Server } from "socket.io";
import { ROOM } from "@moires/shared";

@Injectable()
export class BroadcastService {
  private server: Server | null = null;

  setServer(server: Server) {
    this.server = server;
  }

  send(sessionId: string, event: string, data: unknown) {
    this.server?.to(ROOM(sessionId)).emit(event, data);
  }
}
