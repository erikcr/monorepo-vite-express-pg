import { env } from "@repo/env";
import { db } from "@repo/db";
import { createApp } from "./app.js";
import { logger } from "./logger.js";

const app = createApp(db);
const port = Number(env.PORT ?? 3000);

app.listen(port, () => {
  logger.info({ port }, "api-server started");
});
