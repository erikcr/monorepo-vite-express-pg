// Run by the "Tests with code" CI job with the PR's changed files and description.
import { optOutReason, untestedPackages } from "../tests-with-code.ts";

const untested = untestedPackages((process.env.CHANGED_FILES ?? "").split("\n").filter(Boolean));
const reason = optOutReason(process.env.PR_BODY ?? "");

if (untested.length === 0) {
  console.log("Every package whose source changed has test changes.");
} else if (reason) {
  console.log(`Source changed without tests in ${untested.join(", ")}. The PR says why: ${reason}`);
} else {
  console.log(
    `::error::Source changed without any test changes in ${untested.join(", ")}. Add the tests ` +
      "(docs/TESTING.md; the testing skill), or add this line to the PR description: " +
      "Tests: none needed — <reason>. Then re-run this job."
  );
  process.exitCode = 1;
}
