ALTER TABLE "agents" ADD COLUMN "apiTokenHash" TEXT;

CREATE UNIQUE INDEX "agents_apiTokenHash_key" ON "agents"("apiTokenHash");
