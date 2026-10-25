import { describe, expect, it } from "vitest";
import { sendSmtpMessage, SmtpDeliveryError } from "../src/services/smtp-email.js";

class FakeSocket {
  listeners = new Map<string, Array<(...args: any[]) => void>>();
  writes: string[] = [];
  on(event: string, listener: (...args: any[]) => void) { this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]); return this; }
  once(event: string, listener: (...args: any[]) => void) { return this.on(event, listener); }
  removeListener(event: string, listener: (...args: any[]) => void) { this.listeners.set(event, (this.listeners.get(event) ?? []).filter((item) => item !== listener)); return this; }
  emit(event: string, ...args: any[]) { for (const listener of this.listeners.get(event) ?? []) listener(...args); }
  write(value: string) { this.writes.push(value); const command = value.trim(); const response = command === "DATA" ? "354 continue\r\n" : command === "QUIT" ? "221 bye\r\n" : command.startsWith("AUTH") ? "235 authenticated\r\n" : command.startsWith("STARTTLS") ? "220 ready\r\n" : command.endsWith("\r\n.") ? "250 queued\r\n" : command === "EHLO mt-studio.local" ? "250-smtp\r\n250-STARTTLS\r\n250 ok\r\n" : "250 ok\r\n"; setTimeout(() => this.emit("data", Buffer.from(response)), 0); return true; }
  end() { return this; }
  destroy() { return this; }
  setTimeout() { return this; }
}

describe("SMTP Brevo transport", () => {
  const message = { from: "MT STUDIO <contato@mtstudiocriativo.com.br>", to: "test@example.invalid", subject: "Teste", text: "Olá", html: "<p>Olá</p>" };
  const config = { host: "smtp-relay.brevo.com", port: 587, user: "login", password: "secret", timeoutMs: 1000 };
  it("sends a STARTTLS message through the simulated SMTP server", async () => {
    const fake = new FakeSocket();
    const connector = async () => { setTimeout(() => fake.emit("data", Buffer.from("220 smtp ready\r\n")), 0); return fake; };
    await sendSmtpMessage(message, config, connector, async (socket) => socket);
    expect(fake.writes.some((write) => write.startsWith("STARTTLS"))).toBe(true);
    expect(fake.writes.some((write) => write.startsWith("AUTH PLAIN"))).toBe(true);
    expect(fake.writes.some((write) => write.includes("contato@mtstudiocriativo.com.br"))).toBe(true);
  });
  it("sanitizes connection failures", async () => {
    await expect(sendSmtpMessage(message, config, async () => { throw new Error("private socket detail"); })).rejects.toBeInstanceOf(SmtpDeliveryError);
  });
  it("rejects servers that do not advertise STARTTLS", async () => {
    const fake = new FakeSocket();
    fake.write = (value: string) => { fake.writes.push(value); setTimeout(() => fake.emit("data", Buffer.from("250 ok\r\n")), 0); return true; };
    const connector = async () => { setTimeout(() => fake.emit("data", Buffer.from("220 smtp ready\r\n")), 0); return fake; };
    await expect(sendSmtpMessage(message, config, connector, async (socket) => socket)).rejects.toBeInstanceOf(SmtpDeliveryError);
  });
});
