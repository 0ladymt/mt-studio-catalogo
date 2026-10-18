import { Hono } from "hono";
import { authenticate, type AuthVariables } from "./middleware/authenticate.js";
import type { AuthGateway } from "./types/auth.js";
import type { ApiEnvironment } from "./config/env.js";
import { SessionManager } from "./auth/session.js";
import { protectMutation, restrictedCors } from "./middleware/security.js";

export function createApp(gateway: AuthGateway, environment: ApiEnvironment) {
  const app = new Hono<{ Variables: AuthVariables }>();
  const sessions = new SessionManager(gateway, environment);

  app.use("/api/*", restrictedCors(environment));

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.get("/api/auth/session", async (context) => {
    const session = await sessions.resolve(context);
    if (!session) return context.json({ authenticated: false }, 200);
    return context.json({ authenticated: true, user: { id: session.user.id } });
  });

  app.post("/api/auth/logout", protectMutation(environment), async (context) => {
    await sessions.logout(context);
    return context.json({ authenticated: false });
  });

  app.get("/api/profile", authenticate(sessions, true), async (context) => {
    const user = context.get("user");
    const token = context.get("accessToken");

    try {
      const profile = await gateway.getOwnProfile(token, user.id);
      if (!profile) return context.json({ error: "profile_not_found" }, 404);
      return context.json({ profile });
    } catch {
      return context.json({ error: "profile_unavailable" }, 503);
    }
  });

  app.notFound((context) => context.json({ error: "not_found" }, 404));
  return app;
}
