const HOP_BY_HOP = new Set(["connection", "host", "content-length"]);

function backendOrigin(env) {
  const value = String(env.BACKEND_ORIGIN || "").trim().replace(/\/$/, "");
  if (!/^https:\/\/mt-studio-catalogo-production\.up\.railway\.app$/i.test(value)) {
    throw new Error("invalid_backend_origin");
  }
  return value;
}

export async function onRequest(context) {
  let origin;
  try {
    origin = backendOrigin(context.env);
  } catch {
    return Response.json({ error: "proxy_not_configured" }, { status: 503 });
  }

  const incoming = new URL(context.request.url);
  const target = `${origin}${incoming.pathname}${incoming.search}`;
  const headers = new Headers();
  context.request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) headers.set(key, value);
  });
  headers.set("x-forwarded-host", incoming.host);
  headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));

  const upstream = await fetch(target, {
    method: context.request.method,
    headers,
    body: ["GET", "HEAD"].includes(context.request.method) ? undefined : context.request.body,
    redirect: "manual",
  });

  const responseHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") responseHeaders.set(key, value);
  });
  const cookies = typeof upstream.headers.getSetCookie === "function"
    ? upstream.headers.getSetCookie()
    : (upstream.headers.get("set-cookie") ? [upstream.headers.get("set-cookie")] : []);
  for (const cookie of cookies) responseHeaders.append("set-cookie", cookie);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}
