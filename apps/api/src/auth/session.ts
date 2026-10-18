import { createHash } from "node:crypto";
import type { Context } from "hono";
import type { ApiEnvironment } from "../config/env.js";
import type { AuthGateway, AuthenticatedUser, AuthSession } from "../types/auth.js";
import { clearSessionCookies, issueSessionCookies, readSessionCookies } from "./cookies.js";

export type ResolvedSession = {
  accessToken: string;
  user: AuthenticatedUser;
  renewed: boolean;
};

export class SessionManager {
  private readonly refreshes = new Map<string, Promise<AuthSession | null>>();

  constructor(
    private readonly gateway: AuthGateway,
    private readonly environment: ApiEnvironment,
  ) {}

  issue(context: Context, session: AuthSession): string {
    return issueSessionCookies(context, this.environment, session);
  }

  clear(context: Context): void {
    clearSessionCookies(context, this.environment);
  }

  async resolve(context: Context, allowBearer = false): Promise<ResolvedSession | null> {
    const cookies = readSessionCookies(context);
    if (cookies.accessToken) {
      const user = await this.gateway.verifyAccessToken(cookies.accessToken);
      if (user) return { accessToken: cookies.accessToken, user, renewed: false };
    }

    if (cookies.refreshToken) {
      const refreshed = await this.refreshOnce(cookies.refreshToken);
      if (refreshed) {
        this.issue(context, refreshed);
        return { accessToken: refreshed.accessToken, user: refreshed.user, renewed: true };
      }
      this.clear(context);
      return null;
    }

    if (cookies.accessToken) this.clear(context);

    if (allowBearer) {
      const match = context.req.header("authorization")?.match(/^Bearer\s+([^\s]+)$/i);
      if (match?.[1]) {
        const user = await this.gateway.verifyAccessToken(match[1]);
        if (user) return { accessToken: match[1], user, renewed: false };
      }
    }
    return null;
  }

  async logout(context: Context): Promise<void> {
    try {
      const session = await this.resolve(context);
      if (session) await this.gateway.revokeSession(session.accessToken);
    } finally {
      this.clear(context);
    }
  }

  private refreshOnce(refreshToken: string): Promise<AuthSession | null> {
    const key = createHash("sha256").update(refreshToken).digest("base64url");
    const active = this.refreshes.get(key);
    if (active) return active;
    const refresh = this.gateway.refreshSession(refreshToken);
    this.refreshes.set(key, refresh);
    const cleanup = setTimeout(() => this.refreshes.delete(key), 5_000);
    cleanup.unref();
    return refresh;
  }
}
