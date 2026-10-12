# EV Manual

An interactive owner's manual and troubleshooter for electric cars. Pick a car, describe a symptom, get a guided check that ends in one of four verdicts: it is normal, you can fix it, book a service visit, or stop driving. Every check cites the manual section it came from.

A chat tab answers free-form questions, grounded in that car's manual extract and told to say "the manual does not cover this" rather than guess.

## What is in here today

| Car | Status | Checks |
|---|---|---|
| Mahindra XEV 9e | Complete | 55 |
| Tata Punch EV | Partial | 5 |
| Tata Nexon EV | Stub, chat disabled | 0 |

The Punch EV and Nexon EV are deliberately incomplete and say so on their own pages. See `tools/INGEST.md` for how to fill them.

## Stack

Static HTML, CSS and vanilla JavaScript. No framework, no build step for the frontend, no client-side dependencies. One Netlify Function for chat. Car content lives in JSON files, so adding a car is a data change, not a code change.

```
public/                 the site, served as-is
  index.html            car picker
  car.html              the tool, rendered from JSON
  assets/               styles and two scripts
  data/cars.json        library index
  data/cars/*.json      one file per car, the content asset
digests/                manual extracts the chat reads, never served to the browser
netlify/functions/      chat.js, holds the API key
schema/car.schema.json  the shape a car file must follow
tools/validate.mjs      runs as the Netlify build command, fails the deploy on bad data
tools/INGEST.md         how to add a car
```

## Local development

```bash
npm install
cp .env.example .env        # put your real key in .env, which is gitignored
npx netlify dev             # serves the site and the function at http://localhost:8888
```

Without the Netlify CLI you can serve `public/` with any static server, but the chat tab will not work because the function is not running.

To check your data before pushing:

```bash
npm run validate
```

## Deploying

### 1. Push to GitHub

```bash
git init
git add .
git commit -m "Interactive EV owner's manual"
git branch -M main
git remote add origin git@github.com:<you>/ev-manual.git
git push -u origin main
```

### 2. Connect Netlify

1. Netlify, Add new site, Import an existing project, pick the GitHub repo.
2. Netlify reads `netlify.toml`, so the build command (`node tools/validate.mjs`), publish directory (`public`) and functions directory are already set. Leave them alone.
3. Deploy.

### 3. Add the API key

Site configuration, Environment variables, Add a variable:

| Key | Value |
|---|---|
| `OPENAI_API_KEY` | your key |
| `OPENAI_MODEL` | `gpt-4o` (optional) |
| `CHAT_DAILY_LIMIT_PER_IP` | `20` (optional) |

Redeploy after adding them. Functions read environment variables at cold start.

### 4. Set a spend cap

In the OpenAI dashboard, set a hard monthly usage limit before the site is public. The in-function rate limit is best effort; the dashboard cap is the real backstop.

## When the chat tab shows an error

The message on screen tells you which layer failed. The exact upstream reason is always in the Netlify function log: **Logs, then Functions, then chat**, on a line beginning `openai error`.

| Message on screen | What happened | Fix |
|---|---|---|
| Chat is not configured on this site yet | `OPENAI_API_KEY` is not set on the function | Add it under Site configuration, Environment variables, then redeploy |
| The site's API key was rejected | OpenAI returned 401 | Re-copy the key with no trailing space or newline, then redeploy |
| The site's API key is not permitted to use this model | OpenAI returned 403 | Check the key's project and its model permissions |
| The model is not available to the site's API key | OpenAI returned 404 | Set `OPENAI_MODEL` to a model the account can use |
| The site's assistant has run out of API credit | OpenAI returned 429 with a quota error | Top up the OpenAI account |
| The assistant is busy right now | OpenAI rate limit | Wait and retry |
| That is the daily question limit | This site's own per-IP limit | Expected. Raise `CHAT_DAILY_LIMIT_PER_IP` if it is too tight |
| Chat is off for this car | The car's status is `stub` | Add a digest and content for that car |

**Environment variables are read at cold start.** If you add or change one and do not redeploy, the running function keeps the old value. A trigger deploy is the fix, and it is the single most common cause of a key that "is definitely set" still failing.

## Security

- The API key exists only as a Netlify environment variable, read inside `netlify/functions/chat.js`. It is never sent to the browser, never in the repo, and never in an error message. Upstream errors are logged server side and replaced with a generic message.
- `carId` is validated against a pattern and resolved to a known file, so a crafted request cannot read arbitrary files.
- The chat is rate limited per IP, daily and per minute.
- A Content Security Policy in `netlify.toml` restricts scripts to same-origin and blocks framing.
- Manual digests live outside `public/`, so raw manual text is never served as a file.

**The rate limiter is in-memory.** It resets when a serverless instance recycles and is not shared across instances. Before you promote the site widely, move the counters to Netlify Blobs or Upstash.

## Adding a car

Read `tools/INGEST.md`. Short version: source the manual, write a digest, write the guided checks against `schema/car.schema.json`, register the car in `cars.json`, run `npm run validate`.

The validator refuses to build if a check has no manual reference, if a check reasons beyond the manual without saying so, or if the index disagrees with the data files. That is deliberate. The only thing this site has over asking a general chatbot is that its answers are traceable.

## Legal

Owner's manuals are copyrighted. This project stores condensed, restructured extracts with citations, not copies, and links owners back to the manufacturer's own manual. Do not commit manufacturer PDFs; `sources/raw/` is gitignored. If a manufacturer objects to a specific car's entry, remove that car's JSON and digest and redeploy.

Nothing here replaces an authorised service centre. No high voltage component is user serviceable.
