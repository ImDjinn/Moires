import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AdoService } from "../ado/ado.service";

@Injectable()
export class AuthService {
  constructor(
    private ado: AdoService,
    private prisma: PrismaService,
  ) {}

  // Valide un PAT contre son organisation Azure DevOps, puis upsert l'utilisateur.
  // Lève (UnauthorizedException via AdoService) si le PAT/l'org est invalide.
  async loginWithPat(pat: string, org: string) {
    const identity = await this.ado.getConnectionData(org, pat);
    const user = await this.prisma.user.upsert({
      where: { azureAdId: identity.id },
      update: { displayName: identity.displayName, defaultAdoOrg: org },
      create: { azureAdId: identity.id, displayName: identity.displayName, email: "", defaultAdoOrg: org },
    });
    return { user, pat, org };
  }
}
