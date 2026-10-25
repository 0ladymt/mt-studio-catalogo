import { randomBytes } from "node:crypto";

export type OAuthTransaction = {
  pkceStorage: Record<string, string>;
  expectedUserId?: string;
  sessionFingerprint?: string;
  expiresAt: number;
};

export class OAuthTransactionStore {
  private readonly transactions = new Map<string, OAuthTransaction>();

  constructor(
    private readonly ttlMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  create(pkceStorage: Record<string, string>, binding: Pick<OAuthTransaction, "expectedUserId" | "sessionFingerprint"> = {}): string {
    this.removeExpired();
    const id = randomBytes(32).toString("base64url");
    this.transactions.set(id, {
      pkceStorage: { ...pkceStorage },
      ...binding,
      expiresAt: this.now() + this.ttlMs,
    });
    return id;
  }

  consume(id: string | undefined): OAuthTransaction | null {
    if (!id) return null;
    const transaction = this.transactions.get(id);
    this.transactions.delete(id);
    if (!transaction || transaction.expiresAt <= this.now()) return null;
    return transaction;
  }

  private removeExpired(): void {
    const now = this.now();
    for (const [id, transaction] of this.transactions) {
      if (transaction.expiresAt <= now) this.transactions.delete(id);
    }
  }
}
