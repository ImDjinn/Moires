// Nom d'organisation Azure DevOps : alphanumériques et tirets uniquement.
// Interpolé dans https://dev.azure.com/<org>/... — le valider empêche
// d'injecter des chemins/query strings arbitraires dans les appels ADO.
export const ADO_ORG_RE = /^[A-Za-z0-9][A-Za-z0-9-]*$/;
