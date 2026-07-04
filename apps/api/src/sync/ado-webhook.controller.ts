import { Controller, Post, Body, Headers, UnauthorizedException, Logger } from "@nestjs/common";
import { timingSafeEqual } from "crypto";
import { ConfigService } from "@nestjs/config";
import { AdoWebhookService } from "./ado-webhook.service";

// Comparaison à temps constant (évite un oracle temporel sur le secret).
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
    // Fail-closed : sans secret configuré, le webhook est refusé (un endpoint
    // ouvert permettrait de déclencher des fetch ADO avec un org arbitraire).
    const secret = this.config.get<string>("ADO_WEBHOOK_SECRET");
    if (!secret) {
      this.logger.error("ADO_WEBHOOK_SECRET non configuré — webhook refusé");
      throw new UnauthorizedException("Webhook not configured");
    }
    const encoded = authorization?.replace(/^Basic /, "") ?? "";
    const [, password = ""] = Buffer.from(encoded, "base64").toString().split(":");
    if (!secretMatches(password, secret)) {
      throw new UnauthorizedException("Invalid webhook secret");
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
