import { createAppBase } from "./app-base";
import { config } from "./config";
import { registerAuditRoutes } from "./routes/audits";
import { registerAuthRoutes } from "./routes/auth";
import { registerExportRoutes } from "./routes/exports";
import { registerOrgRoutes } from "./routes/orgs";

const app = registerExportRoutes(registerAuditRoutes(registerOrgRoutes(registerAuthRoutes(createAppBase()))));

app.listen(config.appPort);

console.log(`API running on http://localhost:${config.appPort}`);
console.log(`Swagger docs at http://localhost:${config.appPort}/docs`);
