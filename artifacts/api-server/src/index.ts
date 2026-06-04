import { env } from "@repo/env";
import { db } from "@repo/db";
import { createApp } from "./app.js";

const app = createApp(db);
const port = Number(env.PORT ?? 3000);

app.listen(port, () => {
  console.log(`api-server listening on :${port}`);
});
