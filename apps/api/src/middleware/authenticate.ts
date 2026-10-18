import type { Context, Next } from "hono";
import type { AuthenticatedUser } from "../types/auth.js";
import type { SessionManager } from "../auth/session.js";

export type AuthVariables = {
  accessToken: string;
  user: AuthenticatedUser;
};

export function authenticate(sessions: SessionManager, allowBearer = false) {
  return async (context: Context<{ Variables: AuthVariables }>, next: Next) => {
    const session = await sessions.resolve(context, allowBearer);
    if (!session) {
      const hasBearer = allowBearer && /^Bearer\s+/i.test(context.req.header("authorization") ?? "");
      return context.json({ error: hasBearer ? "invalid_session" : "authentication_required" }, 401);
    }
    context.set("accessToken", session.accessToken);
    context.set("user", session.user);
    await next();
  };
}
