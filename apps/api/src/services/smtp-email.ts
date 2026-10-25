import net from "node:net";
import tls from "node:tls";

export type SmtpMessage = { from: string; to: string; subject: string; text: string; html: string };
type SocketLike = { on(event: string, listener: (...args: any[]) => void): any; once(event: string, listener: (...args: any[]) => void): any; removeListener?(event: string, listener: (...args: any[]) => void): any; write(data: string): any; end(): any; destroy(): any; setTimeout(ms: number, listener?: (...args: any[]) => void): any };
type Connector = (host: string, port: number, timeoutMs: number) => Promise<SocketLike>;
type Upgrader = (socket: SocketLike, host: string, timeoutMs: number) => Promise<SocketLike>;

export class SmtpDeliveryError extends Error { constructor() { super("smtp-delivery-failed"); } }

function responseError(): never { throw new SmtpDeliveryError(); }

async function defaultConnector(host: string, port: number, timeoutMs: number): Promise<SocketLike> {
  const socket = net.createConnection({ host, port });
  socket.setTimeout(timeoutMs);
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", resolve);
    socket.once("error", () => reject(new SmtpDeliveryError()));
    socket.once("timeout", () => { socket.destroy(); reject(new SmtpDeliveryError()); });
  });
  return socket;
}

async function defaultUpgrader(socket: SocketLike, host: string, timeoutMs: number): Promise<SocketLike> {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket: socket as any, servername: host, rejectUnauthorized: true });
    secure.once("secureConnect", () => resolve(secure as unknown as SocketLike));
    secure.once("error", () => reject(new SmtpDeliveryError()));
    secure.setTimeout(timeoutMs, () => { secure.destroy(); reject(new SmtpDeliveryError()); });
  });
}

function readResponse(socket: SocketLike, timeoutMs: number): Promise<{ code: number; lines: string[] }> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timer = setTimeout(() => { socket.destroy(); reject(new SmtpDeliveryError()); }, timeoutMs);
    const onData = (chunk: Buffer | string) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      const complete = lines.filter(Boolean);
      const last = complete.at(-1);
      if (!last || !/^\d{3} /.test(last)) return;
      clearTimeout(timer);
      socket.removeListener?.("data", onData);
      const code = Number(last.slice(0, 3));
      if (code >= 400) reject(new SmtpDeliveryError()); else resolve({ code, lines: complete });
    };
    socket.on("data", onData);
    socket.once("error", () => { clearTimeout(timer); reject(new SmtpDeliveryError()); });
  });
}

async function command(socket: SocketLike, value: string, timeoutMs: number, expected: number[] = [250]): Promise<{ code: number; lines: string[] }> {
  socket.write(`${value}\r\n`);
  const response = await readResponse(socket, timeoutMs);
  if (!expected.includes(response.code)) responseError();
  return response;
}

function escapeHeader(value: string): string {
  return value.replace(/[\r\n]/g, " ").trim();
}

export async function sendSmtpMessage(message: SmtpMessage, config: { host: string; port: number; user: string; password: string; timeoutMs: number }, connector: Connector = defaultConnector, upgrader: Upgrader = defaultUpgrader): Promise<void> {
  let socket: SocketLike | undefined;
  try {
    socket = await connector(config.host, config.port, config.timeoutMs);
    await readResponse(socket, config.timeoutMs);
    const ehlo = await command(socket, "EHLO mt-studio.local", config.timeoutMs);
    if (!ehlo.lines.some((line) => /^250[ -]STARTTLS$/i.test(line))) responseError();
    await command(socket, "STARTTLS", config.timeoutMs, [220]);
    const upgraded = await upgrader(socket, config.host, config.timeoutMs);
    socket = upgraded;
    await command(socket, "EHLO mt-studio.local", config.timeoutMs);
    await command(socket, `AUTH PLAIN ${Buffer.from(`\0${config.user}\0${config.password}`).toString("base64")}`, config.timeoutMs, [235]);
    const envelopeFrom = message.from.match(/<([^<>\s]+)>/)?.[1] ?? message.from;
    await command(socket, `MAIL FROM:<${escapeHeader(envelopeFrom)}>`, config.timeoutMs);
    await command(socket, `RCPT TO:<${escapeHeader(message.to)}>`, config.timeoutMs, [250, 251]);
    socket.write("DATA\r\n");
    await readResponse(socket, config.timeoutMs);
    const body = message.text.replace(/^\./gm, ".." );
    const html = message.html.replace(/^\./gm, ".." );
    socket.write(`From: ${escapeHeader(message.from)}\r\nTo: ${escapeHeader(message.to)}\r\nSubject: ${escapeHeader(message.subject)}\r\nMIME-Version: 1.0\r\nContent-Type: multipart/alternative; boundary=mtstudio-boundary\r\n\r\n--mtstudio-boundary\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}\r\n--mtstudio-boundary\r\nContent-Type: text/html; charset=utf-8\r\n\r\n${html}\r\n--mtstudio-boundary--\r\n.\r\n`);
    await readResponse(socket, config.timeoutMs);
    await command(socket, "QUIT", config.timeoutMs, [221, 250]);
  } catch (error) {
    if (error instanceof SmtpDeliveryError) throw error;
    throw new SmtpDeliveryError();
  } finally { socket?.end(); }
}
