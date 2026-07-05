import { Injectable } from "@nestjs/common";
import { PrismaService } from "../database/prisma.service";
import { AdoService } from "../ado/ado.service";

@Injectable()
export class AuthService {
  constructor(
    private ado: AdoService,
    private prisma: PrismaService,
  ) {}

  // Valide un PAT Azure DevOps en lisant le profil, puis upsert l'utilisateur.
  // Lève (UnauthorizedException via AdoService) si le PAT est invalide.
  async loginWithPat(pat: string) {
    const profile = await this.ado.getProfile(pat);
    const user = await this.prisma.user.upsert({
      where: { azureAdId: profile.id },
      update: { displayName: profile.displayName, email: profile.email },
      create: { azureAdId: profile.id, displayName: profile.displayName, email: profile.email },
    });
    return { user, pat };
  }
}
