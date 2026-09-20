// Cloudflare Worker: vote recording + vote-claim API for the RSPS toplist.
// Deploy docs: see worker/README.md

const VOTE_COOLDOWN_MS = 12 * 60 * 60 * 1000; // 1 vote per player per server
const IP_COOLDOWN_MS = 10 * 60 * 1000; // basic anti-script throttle
const CLAIM_WINDOW_MS = 48 * 60 * 60 * 1000; // how long a vote stays claimable

const SITE_SERVERS_URL = "https://yenxenshi.github.io/servers.json";

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

async function getJSON(kv, key) {
  const raw = await kv.get(key);
  return raw ? JSON.parse(raw) : null;
}

function putJSON(kv, key, value) {
  return kv.put(key, JSON.stringify(value));
}

async function findServer(slug) {
  const res = await fetch(SITE_SERVERS_URL, { cf: { cacheTtl: 60 } });
  if (!res.ok) return null;
  const data = await res.json();
  return data.servers.find((s) => s.slug === slug) || null;
}

function htmlPage(title, body) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>body{font-family:sans-serif;background:#0f1115;color:#e6e8ee;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
  .box{background:#171a21;border:1px solid #262b36;border-radius:10px;padding:24px;max-width:400px;text-align:center}
  input{padding:8px;border-radius:6px;border:1px solid #262b36;background:#0f1115;color:#e6e8ee;width:100%;margin:8px 0;box-sizing:border-box}
  button{padding:10px 16px;border-radius:6px;border:none;background:#ffb020;color:#1a1300;font-weight:600;cursor:pointer;width:100%}
  a{color:#ffb020}</style></head>
  <body><div class="box">${body}</div></body></html>`;
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

async function handleVoteGet(url) {
  const slug = url.searchParams.get("server") || "";
  const user = url.searchParams.get("user") || "";
  const server = await findServer(slug);
  if (!server) {
    return new Response(htmlPage("Server not found", "<h2>Server not found</h2><p>Check the vote link and try again.</p>"), {
      status: 404,
      headers: { "Content-Type": "text/html" },
    });
  }
  const body = `
    <h2>Vote for ${escapeHtml(server.name)}</h2>
    <form method="POST">
      <input type="hidden" name="server" value="${escapeHtml(slug)}">
      <label>Your in-game username</label>
      <input type="text" name="user" value="${escapeHtml(user)}" required maxlength="32">
      <button type="submit">Vote</button>
    </form>`;
  return new Response(htmlPage("Vote", body), { headers: { "Content-Type": "text/html" } });
}

async function handleVotePost(request, env) {
  const contentType = request.headers.get("Content-Type") || "";
  let slug, user;
  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      slug = body.server;
      user = body.user;
    } else {
      const form = await request.formData();
      slug = form.get("server");
      user = form.get("user");
    }
  } catch {
    return new Response(htmlPage("Error", "<p>Malformed request body.</p>"), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  if (!slug || !user) {
    return new Response(htmlPage("Error", "<p>Missing server or username.</p>"), { status: 400, headers: { "Content-Type": "text/html" } });
  }

  const server = await findServer(slug);
  if (!server) {
    return new Response(htmlPage("Error", "<p>Unknown server.</p>"), { status: 404, headers: { "Content-Type": "text/html" } });
  }

  const userKey = user.trim().toLowerCase();
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const now = Date.now();

  const lastVote = await getJSON(env.VOTES, `voted:${slug}:${userKey}`);
  if (lastVote && now - lastVote.ts < VOTE_COOLDOWN_MS) {
    const hoursLeft = Math.ceil((VOTE_COOLDOWN_MS - (now - lastVote.ts)) / 3600000);
    return new Response(htmlPage("Already voted", `<p>You already voted for ${escapeHtml(server.name)}. Try again in about ${hoursLeft}h.</p>`), {
      headers: { "Content-Type": "text/html" },
    });
  }

  const lastIpVote = await getJSON(env.VOTES, `ipvoted:${slug}:${ip}`);
  if (lastIpVote && now - lastIpVote.ts < IP_COOLDOWN_MS) {
    return new Response(htmlPage("Slow down", "<p>Too many votes from this connection. Try again in a few minutes.</p>"), {
      headers: { "Content-Type": "text/html" },
    });
  }

  await putJSON(env.VOTES, `voted:${slug}:${userKey}`, { ts: now });
  await putJSON(env.VOTES, `ipvoted:${slug}:${ip}`, { ts: now });
  await env.VOTES.delete(`claimed:${slug}:${userKey}`);

  const countRaw = await env.VOTES.get(`count:${slug}`);
  const count = (countRaw ? parseInt(countRaw, 10) : 0) + 1;
  await env.VOTES.put(`count:${slug}`, String(count));

  return new Response(htmlPage("Vote recorded", `<h2>Thanks for voting!</h2><p>Vote recorded for ${escapeHtml(server.name)}. Hop back in-game and use the claim command to get your reward.</p>`), {
    headers: { "Content-Type": "text/html" },
  });
}

async function handleVoteStatus(url, env) {
  const slug = url.searchParams.get("server") || "";
  const user = (url.searchParams.get("user") || "").trim().toLowerCase();
  const key = url.searchParams.get("key") || "";

  const storedKey = await env.VOTES.get(`apikey:${slug}`);
  if (!storedKey || storedKey !== key) {
    return Response.json({ error: "invalid server or key" }, { status: 403 });
  }

  const voted = await getJSON(env.VOTES, `voted:${slug}:${user}`);
  const now = Date.now();
  if (!voted || now - voted.ts > CLAIM_WINDOW_MS) {
    return Response.json({ pending: false });
  }

  const claimed = await getJSON(env.VOTES, `claimed:${slug}:${user}`);
  return Response.json({ pending: !claimed, voted_at: voted.ts });
}

async function handleVoteClaim(request, env) {
  const body = await request.json();
  const { server: slug, user, key } = body;
  const userKey = (user || "").trim().toLowerCase();

  const storedKey = await env.VOTES.get(`apikey:${slug}`);
  if (!storedKey || storedKey !== key) {
    return Response.json({ claimed: false, reason: "invalid server or key" }, { status: 403 });
  }

  const voted = await getJSON(env.VOTES, `voted:${slug}:${userKey}`);
  const now = Date.now();
  if (!voted || now - voted.ts > CLAIM_WINDOW_MS) {
    return Response.json({ claimed: false, reason: "no pending vote" });
  }

  const claimed = await getJSON(env.VOTES, `claimed:${slug}:${userKey}`);
  if (claimed) {
    return Response.json({ claimed: false, reason: "already claimed" });
  }

  await putJSON(env.VOTES, `claimed:${slug}:${userKey}`, { ts: now });
  return Response.json({ claimed: true, voted_at: voted.ts });
}

async function handleVoteCounts(env) {
  const list = await env.VOTES.list({ prefix: "count:" });
  const counts = {};
  for (const key of list.keys) {
    const slug = key.name.slice("count:".length);
    counts[slug] = parseInt(await env.VOTES.get(key.name), 10) || 0;
  }
  return Response.json(counts);
}

async function handleAdminRegister(request, env) {
  const body = await request.json();
  if (!body.adminSecret || body.adminSecret !== env.ADMIN_SECRET) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!body.slug) {
    return Response.json({ error: "slug is required" }, { status: 400 });
  }
  const apiKey = crypto.randomUUID().replace(/-/g, "");
  await env.VOTES.put(`apikey:${body.slug}`, apiKey);
  return Response.json({ slug: body.slug, apiKey });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");
    const headers = cors(origin);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    try {
      let response;
      if (url.pathname === "/vote" && request.method === "GET") {
        response = await handleVoteGet(url);
      } else if (url.pathname === "/vote" && request.method === "POST") {
        response = await handleVotePost(request, env);
      } else if (url.pathname === "/api/vote-status" && request.method === "GET") {
        response = await handleVoteStatus(url, env);
      } else if (url.pathname === "/api/vote-claim" && request.method === "POST") {
        response = await handleVoteClaim(request, env);
      } else if (url.pathname === "/api/vote-counts" && request.method === "GET") {
        response = await handleVoteCounts(env);
      } else if (url.pathname === "/api/admin/register-server" && request.method === "POST") {
        response = await handleAdminRegister(request, env);
      } else {
        response = new Response("Not found", { status: 404 });
      }
      for (const [k, v] of Object.entries(headers)) response.headers.set(k, v);
      return response;
    } catch (err) {
      return Response.json({ error: "internal error", message: String(err) }, { status: 500, headers });
    }
  },
};
