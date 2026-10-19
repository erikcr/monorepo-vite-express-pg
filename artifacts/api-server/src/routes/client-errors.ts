import { ReportClientErrorBody } from "@repo/api-zod";
import { Router } from "express";
import { validate } from "../middleware/validate.js";

// Browser crash reports (lib/api-client-react's reportClientError). They land in the API's logs,
// tagged with the request id; forward them to an error tracker here if you add one.
export function createClientErrorsRouter(): Router {
  const router = Router();

  router.post("/", validate({ body: ReportClientErrorBody }), (req, res) => {
    const { url, ...report } = req.body;
    // Query strings can carry tokens or personal data: keep only the path.
    req.log.error({ clientError: { ...report, url: url?.split(/[?#]/)[0] } }, "client error");
    res.status(204).end();
  });

  return router;
}
