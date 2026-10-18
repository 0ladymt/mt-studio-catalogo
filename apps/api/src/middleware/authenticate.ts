import type { Context, Next } from "hono";
import type { AuthGateway, AuthenticatedUser } from "../types/auth.js";

export type AuthVariables = {
  accessToken: string;
  user: AuthenticatedUser;
};

export function authenticate(gateway: AuthGateway) {
  return async (context: Context<{ Variables: AuthVariables }>, next: Next) => {
    const authorization = context.req.header("authorization");
    const match = authorization?.match(/^Bearer\s+([^\s]+)$/i);
    if (!match?.[1]) return context.json({ error: "authentication_required" }, 401);

    const user = await gateway.verifyAccessToken(match[1]);
    if (!user) return context.json({ error: "invalid_session" }, 401);

    context.set("accessToken", match[1]);
    context.set("user", user);
    await next();
  };
}
