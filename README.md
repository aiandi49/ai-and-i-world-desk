# AI&I World Desk

A world-news and politics engine for everyday decisions. You ask about any country, crisis, election, shortage or market theme. The engine checks live, free news feeds, grounds itself in a verified guide, and replies with what it means for your daily life and, if you invest, for markets. It ranks the stories, gives a next step, and lets you download a briefing.

- `/` is the engine (the home page).
- `/guide` is the guide hub: 18 verified topics rendered from `data/gub.json`.
- `/api/chat` is the serverless function. It holds the Anthropic key server-side, pulls the live feeds and talks to Claude.

## 1. Put it on GitHub with GitHub Desktop

1. Unzip `ai-and-i-world-desk.zip`. The folder `ai-and-i-world-desk` is already a Git repository on branch `main`, with no commits yet.
2. Open GitHub Desktop and choose **File → Add local repository…**, then pick the `ai-and-i-world-desk` folder.
3. All files show as changes. Type the summary `Initial commit` and click **Commit to main**.
4. Click **Publish repository**. Keep **Keep this code private** ticked, then click **Publish repository**.

## 2. Deploy on Vercel

1. In Vercel, click **Add New → Project** and import the `ai-and-i-world-desk` repository. There's no build step, so leave the framework preset as **Other**.
2. Before the first deploy, open **Settings → Environment Variables** and add `ANTHROPIC_API_KEY` for **Production**. Create the key in its own Claude Console workspace with a monthly spend limit.
3. Optional variables:
   - `GUARDIAN_API_KEY`: a free Guardian Open Platform developer key, for non-commercial use.
   - `FRED_API_KEY`: a free key from the St. Louis Fed, for oil prices, the 10-year yield, the VIX and the dollar index.
   - `ANTHROPIC_MODEL`: the model to use. Defaults to `claude-sonnet-5-5`.
   - `WEB_SEARCH=off`: turns off Claude's built-in web search ($10 per 1,000 searches). It's on by default and capped at 3 searches per question.
   - `SITE_ORIGINS`: extra allowed origins. Your Vercel and custom domains are detected automatically.
4. Deploy, then redeploy whenever you change a variable.
5. Add the rate-limit rule under **Firewall** (see the checklist below).

## What works, and what doesn't

**Works now**
- A real conversation. When a question is ambiguous, the engine asks one clarifying question.
- Live headlines from GDELT and six world news desks: BBC, Al Jazeera, UN News, NPR, DW and France 24.
- GDACS disaster alerts and USGS earthquake data.
- Guardian articles and FRED market data, if you add those keys.
- Claude web search with citations.
- Ranked story cards, voice input, the downloadable `.txt` briefing and full-page chat.
- Nothing gets cut off. Card heights are measured from your real window and recomputed on resize, zoom and text-size changes. Long content scrolls inside its card with a "Scroll for more" cue, and Next step stays pinned. New replies open at their first line. If a reply hits the token limit, the server continues it, and it repairs missing story lines with one short follow-up call.

**Needs a bigger build**
- Push or email alerts when something breaks.
- Saved history across devices, and accounts.
- Real-time stock quotes (FRED data lags about a day).
- Placing trades.

**Before the key is set**, the chat answers with a polite "not set up yet" message.

GDELT allows about one request every five seconds per server IP. When it's busy, the engine retries once and then carries on with the other feeds.

Market content is information, not financial advice.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `assets/engine.css`, `assets/engine.js` | The engine page |
| `guide/index.html`, `assets/guide.css`, `assets/guide.js` | The guide hub and topic pages |
| `assets/prefs.js` | The text-size selector and theme toggle, shared by both pages |
| `data/gub.json` | The guide content, which is also the engine's grounding data |
| `api/chat.js` | The serverless function |
| `vercel.json` | Security headers, the CSP, and function settings (`includeFiles: data/**`) |

## Security

- The Anthropic key exists only in Vercel environment variables. The browser only ever calls `/api/chat`.
- `/api/chat` accepts POST only, requires JSON, rejects bodies over 32 KB, caps message count and length, and accepts only user and assistant roles.
- It rejects other websites' origins with a 403. This stops other sites, not scripts, so the rate limit and spend cap still matter.
- It allows 20 requests per IP per 10 minutes and times out upstream calls.
- Everything is rendered with `textContent` and DOM nodes. There's no `innerHTML` and there are no third-party scripts.
- The CSP allows only this site plus Google Fonts. The inline theme script is allowed by its sha256 hash.
- If you edit the inline `<script>` in `index.html` or `guide/index.html`, recompute its hash and update `vercel.json`.
