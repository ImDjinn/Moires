import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  ConfidentialClientApplication,
  AuthorizationCodeRequest,
} from "@azure/msal-node";
import { PrismaService } from "../database/prisma.service";

// Azure DevOps resource (well-known app id) — required so the token can call the ADO REST API.
const ADO_SCOPES = [
  "499b84ac-1321-427f-aa17-267ca6975798/user_impersonation",
  "offline_access",
  "openid",
  "profile",
  "email",
];

@Injectable()
export class AuthService {
  private msalClient: ConfidentialClientApplication;
  private redirectUri: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    this.redirectUri = config.get<string>("AZURE_AD_REDIRECT_URI")!;
    this.msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: config.get<string>("AZURE_AD_CLIENT_ID")!,
        clientSecret: config.get<string>("AZURE_AD_CLIENT_SECRET")!,
        authority: `https://login.microsoftonline.com/${config.get<string>("AZURE_AD_TENANT_ID")}`,
      },
    });
  }

  getLoginUrl(): string {
    const scopes = ADO_SCOPES;
    return this.msalClient.getAuthCodeUrl({
      scopes,
      redirectUri: this.redirectUri,
    }) as unknown as string;
  }

  async handleCallback(code: string) {
    const request: AuthorizationCodeRequest = {
      code,
      scopes: ADO_SCOPES,
      redirectUri: this.redirectUri,
    };
    const result = await this.msalClient.acquireTokenByCode(request);
    if (!result) throw new Error("MSAL authentication failed");

    const claims = result.idTokenClaims as Record<string, string>;
    const azureAdId = claims.oid || claims.sub;
    const displayName = claims.name || claims.preferred_username || "User";
    const email = claims.preferred_username || claims.email || "";

    const user = await this.prisma.user.upsert({
      where: { azureAdId },
      update: { displayName, email },
      create: { azureAdId, displayName, email },
    });

    return { user, accessToken: result.accessToken };
  }

  async refreshToken(accessToken: string): Promise<string> {
    const result = await this.msalClient.acquireTokenSilent({
      scopes: ADO_SCOPES,
      account: { homeAccountId: "", environment: "", tenantId: "", username: "", localAccountId: "" },
    });
    return result?.accessToken || accessToken;
  }
}
