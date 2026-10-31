# No Nut November

Shared November 2026 calendar for seven accounts. The interface is in Italian. Each person marks a day **Sì** (+10) or **No** (−10). A No needs a short note and a photo. Everyone sees every result, and the standings sit at the top right.

Days follow **Europe/Rome**. A day unlocks at midnight in Italy and can be changed through November 30. A past day with no mark is **Dimenticato** and scores −10 until someone edits it. Today stays empty until midnight. Future days score 0. Totals can go negative. Ties are ordered alphabetically.

## Run locally

From two terminals:

```powershell
npm --prefix backend run dev
npm --prefix frontend run dev
```

Open http://localhost:5173. The API listens on http://localhost:3001. Local scores and photos are stored in `backend/data`, which is not committed.

Before November 1 you can preview an open day by starting the API with a date inside the month:

```powershell
$env:TODAY_OVERRIDE = "2026-11-15"
npm --prefix backend run dev
```

That override works only when `LOCAL_DEV` is set, which the local server sets itself. The deployed Lambda ignores it.

`npm run smoke` from the repo root runs the API checks against a temporary database.

## Deploy the API (Lambda)

The backend is one Node.js 22 function behind an HTTP API, a DynamoDB table (`NoNutTracker`, 5 read / 5 write capacity), and a private S3 bucket for photos. Proof images expire after 45 days.

Install the [AWS SAM CLI](https://docs.aws.amazon.com/serverless-application-model/latest/developerguide/install-sam-cli.html), then from `backend`:

```powershell
sam build
sam deploy --guided
```

When prompted:

- Stack name: `nonut-tracker`
- Region: the region you want the API in
- `JwtSecret`: at least 16 random characters. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`
- `CorsOrigins`: `*` until you know the Vercel URL, then lock it to `http://localhost:5173,https://your-app.vercel.app`
- Confirm changes, allow SAM to create IAM roles, and save the config

`samconfig.toml` stores the secret in plain text, so it is gitignored.

Copy the `ApiUrl` output. To tighten CORS later:

```powershell
sam deploy --parameter-overrides "JwtSecret=YOUR_SECRET" "CorsOrigins=http://localhost:5173,https://your-app.vercel.app"
```

The table stays inside the DynamoDB always-free provisioned allotment. Lambda stays inside the always-free request tier for this group. S3’s 5 GB free storage applies for the first 12 months of an AWS account; after that, a month of photos is a few cents.

Empty the bucket before deleting the stack. CloudFormation will not delete a bucket that still has objects.

## Deploy the site (Vercel)

In the Vercel project, set the root directory to `frontend` (Vite). Add this environment variable **before** building, then redeploy if you add it later. Vite bakes it in at build time.

```text
VITE_API_URL=https://your-api-id.execute-api.your-region.amazonaws.com
```

No trailing slash. After the site has a URL, redeploy the API with that origin in `CorsOrigins` if you did not use `*`.

## On a phone

Open the Vercel URL in the phone browser and install it. The home-screen icon is the same site, full screen, still signed in through the browser’s saved login.

- iPhone: Share, then Add to Home Screen.
- Android: Install from the browser menu.

Scores still come from the API, so the phone needs a connection. The installed app does not cache the board.
