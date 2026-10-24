import { ClerkProvider, getToken } from "@clerk/react";
import { configureApiClient } from "@repo/api-client-react/client";
import { ErrorBoundary, installGlobalErrorReporting } from "@repo/api-client-react/errors";
import { createQueryClient } from "@repo/api-client-react/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { getCurrentOrgId } from "./org.ts";
import { CrashScreen } from "./pages/CrashScreen.tsx";
import { MissingClerkKey } from "./pages/MissingClerkKey.tsx";
import { createAppRouter } from "./router.tsx";

installGlobalErrorReporting("web");

// Every API request carries the Clerk session token and the org on screen.
configureApiClient({ getToken: () => getToken(), getOrgId: getCurrentOrgId });

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);
const publishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary app="web" fallback={() => <CrashScreen />}>
      {publishableKey ? (
        <ClerkProvider
          publishableKey={publishableKey}
          // Clerk navigates through the app's router, not full page loads.
          routerPush={(to) => router.navigate({ to })}
          routerReplace={(to) => router.navigate({ to, replace: true })}
          signInUrl="/sign-in"
          afterSignOutUrl="/"
        >
          <QueryClientProvider client={queryClient}>
            <RouterProvider router={router} />
          </QueryClientProvider>
        </ClerkProvider>
      ) : (
        <MissingClerkKey />
      )}
    </ErrorBoundary>
  </StrictMode>
);
