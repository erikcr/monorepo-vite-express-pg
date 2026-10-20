// The "Tests with code" check (docs/TESTING.md): a PR that changes a package's source without
// changing any of its tests fails, unless its description says why no tests are needed.

/** Where a package's tests live, when not (only) in the package itself. */
const TEST_HOMES: Record<string, string[]> = {
  // The schema and the hand-written client are exercised by the apps' tests.
  "lib/db": ["lib/db", "artifacts/api-server"],
  "lib/api-client-react": ["lib/api-client-react", "artifacts/web", "artifacts/admin"],
  // A page change can be covered by an end-to-end test as well as its component test.
  "artifacts/web": ["artifacts/web", "e2e"],
  "artifacts/admin": ["artifacts/admin", "e2e"],
};

// Not code to test: generated from openapi.yaml (tested through the code that uses them), and the
// deploy check's table of live URLs (data, validated on every run by deploy-targets.test.ts).
const NOT_SOURCE = new Set([
  "lib/api-zod/src/index.ts",
  "lib/api-client-react/src/index.ts",
  "lib/ci/src/deploy-targets.ts",
]);

const isTest = (file: string) =>
  file.includes("/__tests__/") || /\.test\.tsx?$/.test(file) || file.startsWith("e2e/tests/");

/** The package (`artifacts/web`, `lib/env`…) whose source `file` is, or null if it isn't source. */
function sourcePackage(file: string): string | null {
  const match = /^((?:artifacts|lib)\/[^/]+)\/src\//.exec(file);
  if (!match?.[1] || isTest(file) || file.includes("/test-helpers/") || NOT_SOURCE.has(file)) {
    return null;
  }
  return match[1];
}

/** Packages whose source changed while none of their tests did. */
export function untestedPackages(changedFiles: string[]): string[] {
  const packages = new Set(changedFiles.map(sourcePackage).filter((p) => p !== null));
  const tests = changedFiles.filter(isTest);
  return [...packages]
    .filter((pkg) => {
      const homes = TEST_HOMES[pkg] ?? [pkg];
      return !tests.some((test) => homes.some((home) => test.startsWith(`${home}/`)));
    })
    .sort();
}

/**
 * The reason in a `Tests: none needed — <reason>` line of a PR description, or null. Lines inside
 * HTML comments don't count (the PR template's example is in one), nor does the bare placeholder.
 */
export function optOutReason(body: string): string | null {
  const visible = body.replace(/<!--[\s\S]*?-->/g, "");
  const match = /^[ \t]*Tests:[ \t]*none needed[ \t]*(?:—|–|-{1,2})[ \t]*(\S.*?)[ \t\r]*$/im.exec(
    visible
  );
  const reason = match?.[1];
  return reason && reason !== "<reason>" ? reason : null;
}
