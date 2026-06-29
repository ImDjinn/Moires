import { Controller, Post, Body, Headers, UnauthorizedException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AdoWebhookService } from "./ado-webhook.service";

@Controller("ado")
export class AdoWebhookController {
  private readonly logger = new Logger(AdoWebhookController.name);

  constructor(
    private webhookService: AdoWebhookService,
    private config: ConfigService,
  ) {}

  @Post("webhook")
  async handleWebhook(
    @Body() body: any,
    @Headers("authorization") authorization: string | undefined,
  ): Promise<void> {
    const secret = this.config.get<string>("ADO_WEBHOOK_SECRET");
    if (secret) {
      const encoded = authorization?.replace(/^Basic /, "") ?? "";
      const [, password] = Buffer.from(encoded, "base64").toString().split(":");
      if (password !== secret) throw new UnauthorizedException("Invalid webhook secret");
    }

    const eventType: string = body?.eventType;
    if (eventType !== "workitem.updated" && eventType !== "workitem.created") return;

    const workItemId = String(body?.resource?.workItemId ?? body?.resource?.id ?? "");
    if (!workItemId) return;

    const baseUrl: string = body?.resourceContainers?.account?.baseUrl ?? "";
    const org = baseUrl ? new URL(baseUrl).pathname.replace(/^\/|\/$/g, "") : "";
    if (!org) {
      this.logger.warn(`Could not extract org from webhook payload, baseUrl: ${baseUrl}`);
      return;
    }

    await this.webhookService.handleWorkItemUpdated(workItemId, org);
  }
}
