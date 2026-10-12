/**
 * Build-time guard. Netlify runs this as the build command, so a car file
 * that breaks the rules below fails the deploy instead of shipping a page
 * that quietly gives an owner an ungrounded answer.
 */

import fs from "node:fs";
import path from "node:path";

const ROOT     = path.resolve(process.cwd());
const CARS_DIR = path.join(ROOT, "public/data/cars");
const INDEX    = path.join(ROOT, "public/data/cars.json");
const DIGESTS  = path.join(ROOT, "digests");

const errors = [];
const warns  = [];
const SEVS   = new Set(["stop", "service", "diy", "normal"]);

const read = p => JSON.parse(fs.readFileSync(p, "utf8"));

const files = fs.readdirSync(CARS_DIR).filter(f => f.endsWith(".json"));
if (!files.length) errors.push("No car files in public/data/cars");

const seen = new Map();

for (const file of files) {
  const p = path.join(CARS_DIR, file);
  let car;
  try { car = read(p); } catch (e) { errors.push(`${file}: not valid JSON (${e.message})`); continue; }

  const id = car.id;
  const where = m => errors.push(`${file}: ${m}`);

  if (!id) where("missing id");
  if (id && `${id}.json` !== file) where(`id "${id}" does not match the filename`);
  if (id && seen.has(id)) where(`duplicate id "${id}"`);
  if (id) seen.set(id, car);

  for (const k of ["make", "model", "status", "manual", "categories", "issues"]) {
    if (car[k] === undefined) where(`missing required field "${k}"`);
  }
  if (!["complete", "partial", "stub"].includes(car.status)) where(`status must be complete, partial or stub`);
  if (car.status !== "complete" && !car.coverageNote) where(`status "${car.status}" needs a coverageNote so users know what is missing`);

  const catIds = new Set((car.categories || []).map(c => c.id));
  const issueIds = new Set();

  for (const i of car.issues || []) {
    const at = `issue "${i.id || "(no id)"}"`;
    if (!i.id) where(`${at}: missing id`);
    if (issueIds.has(i.id)) where(`${at}: duplicate id`);
    issueIds.add(i.id);
    if (!catIds.has(i.cat)) where(`${at}: cat "${i.cat}" is not in categories`);
    if (!SEVS.has(i.sev)) where(`${at}: sev must be one of stop, service, diy, normal`);
    if (!i.title) where(`${at}: missing title`);
    if (!i.summary) where(`${at}: missing summary`);
    if (!Array.isArray(i.steps) || !i.steps.length) where(`${at}: needs at least one step`);
    for (const s of i.steps || []) if (!s || !s.d) where(`${at}: a step has no instruction`);
    if (!i.ref) where(`${at}: missing ref. Every check must cite where it came from.`);
    if (i.inferred && !i.note) where(`${at}: inferred is true, so it needs a note explaining what the manual does and does not say`);
    if (!i.inferred && /^inferred/i.test(i.ref || "")) where(`${at}: ref says inferred but the inferred flag is not set`);
  }

  // Signal links must point at real issues.
  for (const g of car.signalGroups || []) {
    for (const s of g.items || []) {
      if (s.link && !issueIds.has(s.link)) where(`signal "${s.id}" links to unknown issue "${s.link}"`);
      if (s.sev && !SEVS.has(s.sev)) where(`signal "${s.id}": bad sev "${s.sev}"`);
    }
  }

  // Service schedule: every row must line up with the interval columns.
  if (car.service) {
    const s = car.service;
    if (!s.source) where("service: missing source. Say which document the schedule came from.");
    if (!Array.isArray(s.intervals) || !s.intervals.length) where("service: needs an intervals array");
    const codes = new Set(Object.keys(s.legend || {}));
    for (const op of s.operations || []) {
      if (!op.n) where("service: an operation has no name");
      if (!Array.isArray(op.c)) { where(`service "${op.n}": missing code array`); continue; }
      if (op.c.length !== (s.intervals || []).length) {
        where(`service "${op.n}": ${op.c.length} codes for ${(s.intervals || []).length} intervals`);
      }
      for (const c of op.c) if (c !== "" && !codes.has(c)) where(`service "${op.n}": code "${c}" is not in the legend`);
    }
    for (const km of s.freeLabourAt || []) {
      if (!(s.intervals || []).includes(km)) warns.push(`${file}: free labour listed at ${km} km, which is not one of the intervals shown`);
    }
  }

  // Non-stub cars must have a digest, or the chat has nothing to ground in.
  if (car.status !== "stub") {
    const d = path.join(DIGESTS, `${id}.md`);
    if (!fs.existsSync(d)) where(`no digest at digests/${id}.md, so chat would have nothing to ground in`);
    else if (fs.statSync(d).size < 400) warns.push(`${file}: digest is very short, chat answers will be thin`);
  }
  if (car.status === "complete" && (car.issues || []).length < 10) {
    warns.push(`${file}: marked complete with only ${(car.issues || []).length} checks. Is it really complete?`);
  }
}

// Index must match the files on disk.
try {
  const index = read(INDEX);
  const listed = new Set((index.cars || []).map(c => c.id));
  for (const id of seen.keys()) if (!listed.has(id)) errors.push(`cars.json is missing "${id}"`);
  for (const c of index.cars || []) {
    if (!seen.has(c.id)) { errors.push(`cars.json lists "${c.id}" but there is no data file`); continue; }
    const real = seen.get(c.id).issues.length;
    if (c.issueCount !== real) errors.push(`cars.json says ${c.id} has ${c.issueCount} checks, the file has ${real}`);
    if (c.status !== seen.get(c.id).status) errors.push(`cars.json status for ${c.id} does not match its data file`);
  }
} catch (e) {
  errors.push(`public/data/cars.json: ${e.message}`);
}

for (const w of warns) console.warn(`warning  ${w}`);

if (errors.length) {
  console.error(`\n${errors.length} problem${errors.length === 1 ? "" : "s"} found:\n`);
  for (const e of errors) console.error(`  ${e}`);
  console.error("");
  process.exit(1);
}

console.log(`Checked ${files.length} car file${files.length === 1 ? "" : "s"}. All good.`);
