import { ReportClientErrorBody } from "@repo/api-zod";
import { Router } from "express";
import { trackClientError } from "../lib/error-tracker.js";
import { publicRoute } from "../middleware/access.js";
import { validate } from "../middleware/validate.js";

// Browser crash reports (lib/api-client-react's reportClientError). They land in the API's logs,
// tagged with the request id, and in Sentry if it's on. Public: a crash can happen before sign-in.
export function createClientErrorsRouter(): Router {
  const router = Router();

  router.post("/", publicRoute, validate({ body: ReportClientErrorBody }), (req, res) => {
    const { url, ...report } = req.body;
    // Query strings can carry tokens or personal data: keep only the path.
    const page = url?.split(/[?#]/)[0];
    req.log.error({ clientError: { ...report, url: page } }, "client error");
    trackClientError({ ...report, path: page && URL.parse(page)?.pathname });
    res.status(204).end();
  });

  return router;
}
