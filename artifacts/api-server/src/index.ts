import { env } from "@repo/env";
import express from "express";
import { healthRouter } from "./routes/health.js";
import { exampleRouter } from "./routes/example.js";

const app = express();
app.use(express.json());

app.use("/health", healthRouter);
app.use("/api/example", exampleRouter);

const port = Number(env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`api-server listening on :${port}`);
});
