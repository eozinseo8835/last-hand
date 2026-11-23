# Online mode (up to 8 guests)

## How it works

- **Room server:** `server/` is a Cloudflare Worker with one Durable Object per room code. It is the only place that knows the deck, both hands and the bullet chamber; every browser receives a view made for its own seat (`src/online/room.ts → viewFor`).
- **Game rules online:** `src/online/room.ts`. Eight seats; empty seats become computer guests when the host starts. Guests are paired into 1v1 tables (8 → 4 → 2 → 1 across rooms 1–3). Each hand: both players decide at the same time (20 s, a timeout stands), the hands are revealed, the loser takes the table's revolver (one spin per room, 20 s to pull or the Host does it), and a fired chamber ends the table. Both busting, or a tie, means no shot. FOLD (three per room, only before a hit) ends the hand with no shot.
- **Dropped players:** the computer plays the seat until the player rejoins (the browser keeps a rejoin token for the tab and reconnects by itself).
- **Browser:** `src/online/useOnline.ts` (connection), `src/online/onlineScene.ts` (server view → the same 3D scene as story mode; you are always the player, your opponent sits in the captive's chair), `src/online/OnlineGame.tsx` (lobby and table UI).

## Deploying the server (once)

```
cd server
npm install
npx wrangler login      # a browser window opens: click Allow
npx wrangler deploy     # prints the server address, e.g. https://last-hand-server.<name>.workers.dev
```

The first deploy may ask you to choose a workers.dev subdomain; any name works.

Then put the address in `.env.production` in the project root:

```
VITE_SERVER_URL=https://last-hand-server.<name>.workers.dev
```

and rebuild the site (`npm run build`). Until this is set, the menu shows Online 1v1 as "Coming soon".

`server/wrangler.toml` lists the sites allowed to open rooms (`ALLOWED_ORIGINS`); add any new Netlify address there and deploy again.

## Testing locally

`cd server && npx wrangler dev` runs the server on http://localhost:8787. Put `VITE_SERVER_URL=http://localhost:8787` in `.env.local` and run `npm run dev`; open two browser windows to play yourself.
