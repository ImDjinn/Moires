-- Le cache Postgres des tickets ne servait qu'au mapping work item -> session
-- du webhook ADO, supprimé. Redis est la seule source de vérité de la session.
DROP TABLE "tickets_cache";
