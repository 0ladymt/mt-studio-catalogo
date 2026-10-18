import { Hono } from "hono";
import { authenticate, type AuthVariables } from "./middleware/authenticate.js";
import type { AuthGateway } from "./types/auth.js";

export function createApp(gateway: AuthGateway) {
  const app = new Hono<{ Variables: AuthVariables }>();

  app.get("/api/health", (context) => context.json({ status: "ok" }));

  app.get("/api/profile", authenticate(gateway), async (context) => {
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
