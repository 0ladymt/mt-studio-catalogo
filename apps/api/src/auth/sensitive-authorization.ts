import { createHash, randomBytes } from "node:crypto";

type SensitiveAuthorization = {
  userId: string;
  sessionFingerprint: string;
  expiresAt: number;
};

export class SensitiveAuthorizationStore {
  private readonly authorizations = new Map<string, SensitiveAuthorization>();

  constructor(private readonly ttlMs: number, private readonly now: () => number = Date.now) {}

  create(userId: string, accessToken: string): string {
    this.removeExpired();
    const id = randomBytes(32).toString("base64url");
    this.authorizations.set(id, {
      userId,
      sessionFingerprint: fingerprintSession(accessToken),
      expiresAt: this.now() + this.ttlMs,
    });
    return id;
  }

  consume(id: string | undefined, userId: string, accessToken: string): boolean {
    if (!id) return false;
    const authorization = this.authorizations.get(id);
    this.authorizations.delete(id);
    return Boolean(
      authorization &&
      authorization.expiresAt > this.now() &&
      authorization.userId === userId &&
      authorization.sessionFingerprint === fingerprintSession(accessToken)
    );
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [id, authorization] of this.authorizations) {
      if (authorization.expiresAt <= now) this.authorizations.delete(id);
    }
  }
}

export function fingerprintSession(accessToken: string): string {
  return createHash("sha256").update(accessToken).digest("base64url");
}
