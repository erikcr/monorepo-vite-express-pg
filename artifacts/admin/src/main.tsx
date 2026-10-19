import { ErrorBoundary, installGlobalErrorReporting } from "@repo/api-client-react/errors";
import { createQueryClient } from "@repo/api-client-react/query-client";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { CrashScreen } from "./pages/CrashScreen.tsx";
import { createAppRouter } from "./router.tsx";

installGlobalErrorReporting("admin");

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Root element #root not found");
createRoot(rootElement).render(
  <StrictMode>
    <ErrorBoundary app="admin" fallback={() => <CrashScreen />}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>
);
