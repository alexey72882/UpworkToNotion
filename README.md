# UpworkToNotion

Serverless Next.js + TypeScript scaffold for syncing Upwork data to Notion.

## Spec

Spec: [0001](./specs/specs/0001-upwork-notion-v0.1.md)

## Getting Started

Install dependencies and run the local development server:

```bash
npm install
npm run dev
```

Once the server is running, verify the health check endpoint:

```bash
curl http://localhost:3000/api/ping
```

The API returns:

```json
{"ok":true,"service":"UpworkToNotion","version":"v0.1"}
```

## Scheduled Sync Stub

`vercel.json` defines a placeholder cron job that will call `/api/sync` every three hours when deployed to Vercel.
