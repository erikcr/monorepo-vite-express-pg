// Imported first by every entry point, so a misconfigured deploy fails at startup with every bad
// variable listed, before any module (e.g. the db client) reads the environment.
import { validateServerEnv } from "@repo/env";

validateServerEnv();
