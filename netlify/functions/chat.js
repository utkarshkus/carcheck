/**
 * Grounded chat for one car's owner's manual.
 *
 * The API key is read from the environment and never leaves this function.
 * The browser only ever sees { reply, cite } or { error }.
 */

import fs from "node:fs";
import path from "node:path";

const MODEL             = process.env.OPENAI_MODEL || "gpt-4o";
const DAILY_LIMIT       = Number(process.env.CHAT_DAILY_LIMIT_PER_IP || 20);
const BURST_LIMIT       = Number(process.env.CHAT_BURST_LIMIT_PER_MIN || 4);
const MAX_OUTPUT_TOKENS = Number(process.env.CHAT_MAX_OUTPUT_TOKENS || 700);

const MAX_CHARS_PER_MESSAGE = 1200;
const MAX_TURNS             = 10;

/* ------------------------------------------------------------------ *
 * Rate limiting
 *
 * In-memory, so it resets when a serverless instance is recycled and is
 * not shared between instances. It stops casual abuse, not a determined
 * attacker. Before you advertise this site publicly, move the counters to
 * Netlify Blobs or Upstash so they survive across instances, and set a
 * hard monthly spend cap in the OpenAI dashboard as the real backstop.
 * ------------------------------------------------------------------ */
const hits = new Map();

function rateLimit(ip) {
  const now = Date.now();
  const rec = hits.get(ip) || { day: [], min: [] };
  rec.day = rec.day.filter(t => now - t < 86_400_000);
  rec.min = rec.min.filter(t => now - t < 60_000);

  if (rec.day.length >= DAILY_LIMIT) {
    return { ok: false, msg: `That is the daily question limit (${DAILY_LIMIT}). The guided checks stay available, and the limit resets in 24 hours.` };
  }
  if (rec.min.length >= BURST_LIMIT) {
    return { ok: false, msg: "Too many questions at once. Wait a minute and ask again." };
  }
  rec.day.push(now); rec.min.push(now);
  hits.set(ip, rec);

  if (hits.size > 5000) { for (const k of hits.keys()) { hits.delete(k); if (hits.size <= 4000) break; } }
  return { ok: true };
}

/* ------------------------------------------------------------------ */

function readFirst(relPaths) {
  for (const rel of relPaths) {
    for (const base of [process.cwd(), path.resolve(process.cwd(), "../.."), "/var/task"]) {
      const p = path.resolve(base, rel);
      try { if (fs.existsSync(p)) return fs.readFileSync(p, "utf8"); } catch (e) { /* keep trying */ }
    }
  }
  return null;
}

function loadCar(carId) {
  if (!/^[a-z0-9-]{2,60}$/.test(carId)) return null;
  const raw = readFirst([`public/data/cars/${carId}.json`]);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}

function systemPrompt(car, digest) {
  const issueIndex = (car.issues || [])
    .map(i => `- ${i.title} [${i.sev}] (ref: ${i.ref})`)
    .join("\n");

  return `You answer questions from the owner of a ${car.make} ${car.model} (${car.years || "current"}), using only that car's owner's manual.

RULES, in priority order:

1. Safety first. If the question involves smoke, fire, a burning smell, a crash, leaking fluid, damaged orange high voltage cabling, or a suspected battery problem, tell the person to stop, get everyone away from the car, and call roadside assistance. Answer nothing else in that reply.
2. Never give instructions for servicing, opening, bypassing or repairing any high voltage component, the airbag system, or the immobiliser. Those have no user serviceable parts. Say so and point to an authorised service centre.
3. Ground every factual claim in the manual extract below. If the extract does not cover it, say plainly that the manual does not cover it and suggest what to check or who to ask. Never invent a number, a menu path, a warning light colour, a torque figure or a section reference.
4. Give a verdict early. Every answer should make clear which of these it is: normal behaviour, something the owner can fix, something that needs a service booking, or a reason to stop driving.
5. Note variant differences. Features vary by variant, so when a feature may not be fitted, say so.
6. Be brief. Two to six sentences, or a short numbered list when the answer is a sequence of steps. No preamble, no restating the question.
7. Write plain sentences. Do not use em dashes.

CITATION:
End your reply with a line starting exactly "REF: " naming the manual section you used, for example "REF: Owner's Manual 3.1.9". If you could not ground the answer, write "REF: not covered in the manual extract".

EXISTING GUIDED CHECKS on this site, which you may point the person to by name:
${issueIndex || "(none yet)"}

MANUAL EXTRACT for the ${car.make} ${car.model}:
---
${digest}
---`;
}

export default async (req) => {
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  if (req.method !== "POST") return json({ error: "Use POST." }, 405);

  if (!process.env.OPENAI_API_KEY) {
    return json({ error: "Chat is not configured on this site yet. The guided checks still work." }, 503);
  }

  const ip =
    (req.headers.get("x-nf-client-connection-ip") ||
     (req.headers.get("x-forwarded-for") || "").split(",")[0] ||
     "unknown").trim();

  const limit = rateLimit(ip);
  if (!limit.ok) return json({ error: limit.msg }, 429);

  let body;
  try { body = await req.json(); } catch (e) { return json({ error: "Could not read that request." }, 400); }

  const { carId, messages } = body || {};
  const car = loadCar(String(carId || ""));
  if (!car) return json({ error: "That car is not in the library." }, 404);
  if (car.status === "stub") {
    return json({ error: "Chat is off for this car because its manual has not been added yet." }, 409);
  }

  const digest = readFirst([`digests/${car.id}.md`]);
  if (!digest) {
    return json({ error: "The manual extract for this car is missing, so there is nothing to ground an answer in." }, 503);
  }

  if (!Array.isArray(messages) || !messages.length) return json({ error: "Ask a question first." }, 400);

  const turns = messages
    .slice(-MAX_TURNS)
    .filter(m => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .map(m => ({ role: m.role, content: m.content.slice(0, MAX_CHARS_PER_MESSAGE) }));

  if (!turns.length || turns[turns.length - 1].role !== "user") {
    return json({ error: "Ask a question first." }, 400);
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);

    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.2,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [{ role: "system", content: systemPrompt(car, digest) }, ...turns]
      })
    });
    clearTimeout(timer);

    if (!res.ok) {
      // Log the upstream detail server side; never return it to the browser.
      const detail = (await res.text()).slice(0, 500);
      console.error("openai error", res.status, detail);

      // Tell a site owner enough to fix a misconfiguration without leaking
      // anything about the key itself. Visitors see the same words, which say
      // the site is misconfigured rather than blaming their question.
      let msg = "The assistant could not answer that. The guided checks still work.";
      if (res.status === 429) {
        msg = /quota|billing|insufficient/i.test(detail)
          ? "The site's assistant has run out of API credit. The site owner needs to top up the account."
          : "The assistant is busy right now. Try again in a minute.";
      } else if (res.status === 401) {
        msg = "The site's API key was rejected. The site owner needs to check OPENAI_API_KEY, then redeploy.";
      } else if (res.status === 403) {
        msg = "The site's API key is not permitted to use this model. The site owner needs to check the key's project and model permissions.";
      } else if (res.status === 404) {
        msg = `The model "${MODEL}" is not available to the site's API key. The site owner needs to set OPENAI_MODEL to one the account can use.`;
      }
      return json({ error: msg, upstreamStatus: res.status }, 502);
    }

    const data = await res.json();
    let reply = data?.choices?.[0]?.message?.content?.trim();
    if (!reply) return json({ error: "The assistant returned nothing. Try rephrasing." }, 502);

    let cite = "";
    const m = reply.match(/\n?REF:\s*(.+)\s*$/i);
    if (m) { cite = `Manual reference: ${m[1].trim()}`; reply = reply.slice(0, m.index).trim(); }

    return json({ reply, cite });
  } catch (e) {
    console.error("chat failure", e?.name, e?.message);
    const msg = e?.name === "AbortError"
      ? "That took too long. Ask again, or use the guided checks."
      : "Something went wrong answering that. The guided checks still work.";
    return json({ error: msg }, 502);
  }
};
