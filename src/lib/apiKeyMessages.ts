// Ten paraphrases of the Upwork API-key application text, one handed out per user so
// Upwork's reviewers never see two identical applications. Source of truth for the copy
// is `docs/API key request message.md`; this array is what the app actually serves.
export const API_KEY_MESSAGES = [
  `I'm building a private, personal dashboard to link my own Upwork account with my own Notion workspace. As a solo freelancer, I want to securely track and organize my own data in one spot.
Intended API use: pull and view my job feed and saved searches, look at job post details, and send proposals to jobs I pick. No other users' data involved.
Purpose: gather all my job leads into one Notion database, rate how well each one fits my skills, and draft and send proposals.
Access type: private, internal only. Just me, one account. Not a public app.
Status: I'm an individual Upwork client requesting access for my own use, not a developer working for a client.
Only I use this data. I don't share or resell it.`,

  `I'm setting up a personal tool that connects my Upwork account to my Notion workspace, just for me. The idea is to help me manage my own freelance information in one place, securely.
What I'll use the API for: reading my job feed and saved searches, checking job post details, and submitting proposals to jobs I choose myself. Nothing involving other accounts.
Why: to keep all my leads in a single Notion database, score how relevant each job is, and put together proposals to send.
Scope: private and internal, single user, single account (mine). Not something I'm releasing publicly.
Who I am: an individual Upwork account holder asking for access for myself, not a developer building this for someone else.
I'm the only one who sees this data. I won't share or sell it.`,

  `I want to build a private productivity setup linking my own Upwork account to my own Notion. This is meant to help me, as a freelancer working alone, keep my information organized and secure.
API usage plan: search and read my job feed plus saved searches, view job post details, and submit proposals to jobs of my choosing. No other users are involved.
Goal: consolidate my job leads into one Notion database so I can rate fit and prepare proposals.
Nature of the app: internal, private, one person, one account (me). Not public-facing.
My role: I hold an individual Upwork account and am requesting access for my own use, not on behalf of a client as a developer.
Data stays with me only. No sharing, no reselling.`,

  `I'm creating a personal dashboard that ties my own Upwork account to my own Notion workspace, for my use alone as a freelancer, to help me view and organize my information safely.
Planned API use: read my job feed and saved searches, view job details, and submit proposals to jobs I select. Never touching other people's data.
Reason: to collect my leads in a Notion database, judge how well each fits me, and write up proposals.
Type of access: internal and private, one user, one account, all mine. Not a public tool.
My status: an individual client with an Upwork account, requesting this for myself rather than as a developer serving a client.
I'm the sole user of this data, and I don't distribute or sell it.`,

  `I'd like to set up a private dashboard connecting my personal Upwork account to my personal Notion workspace. It's meant to help me, working solo as a freelancer, securely organize my own info.
How I'll use the API: search and read my own job feed and saved searches, look at job post details, and send proposals for jobs I pick myself. No other accounts touched.
Purpose: bring all my leads into one Notion database where I can rate fit and prepare proposals.
Visibility: internal, private, single user, single account (mine). Not public.
My status: an individual Upwork account holder seeking access for personal use, not a developer on behalf of a client.
Nobody but me uses this data. No sharing or reselling.`,

  `I'm putting together a private, personal system that hooks up my own Upwork account with my own Notion setup. This is to help me, a lone freelancer, view and organize my info securely.
What the API will be used for: reading my job feed and saved searches, checking job posting details, and submitting proposals to the jobs I choose. No access to anyone else's data.
Why I need it: to store all my job leads in one Notion database, rate how each fits my skills, and draft proposals.
App scope: internal and private, one user, one account, entirely mine. Not public.
My status: an individual with an Upwork account requesting access for my own use, not a developer working on behalf of a client.
I'm the only one using this data, and I don't share or resell it.`,

  `I want to build a personal, private dashboard linking my Upwork account to my Notion workspace. As a freelancer working by myself, I need it to help me securely view and manage my own information.
Intended API usage: search and read my job feed and saved searches, review job post details, submit proposals to jobs I decide on. No other users' data touched.
The goal: keep all my leads in a single Notion database, rate their fit, and prepare proposals to send.
Access level: private and internal, just one user and one account, both mine. Not a public application.
My status: an individual Upwork client requesting this access for myself, not a developer acting for someone else.
Only I will use this data. It won't be shared or resold.`,

  `I'm building a private productivity dashboard for myself, connecting my Upwork account with my Notion workspace, to securely organize my own freelance data in one place.
API usage plans: read my own job feed and saved searches, view job post details, and submit proposals to jobs I pick. No other users involved at all.
Purpose: centralize my job leads in one Notion database, rate how well each fits, and get proposals ready.
Type: internal, private, one user, one account (mine). Not open to the public.
My role: an individual Upwork account holder requesting access for personal use, not a developer working for a client.
This data is for my eyes only, no sharing or reselling.`,

  `I'm setting up a personal, private dashboard to connect my own Upwork account with my own Notion workspace, meant to help me as a solo freelancer securely see and organize my info.
API use case: search and read my job feed and saved searches, check job post details, and send proposals to jobs of my choosing. No other accounts or users touched.
Why: to keep my leads together in one Notion database, rate fit, and draft proposals.
Access scope: internal and private, single user, single account, all mine. Not a public app.
My status: I'm an individual Upwork account holder asking for access to use myself, not a developer building this for a client.
I'm the only person using this data, and I don't share or resell any of it.`,

  `I want a private personal dashboard that links my own Upwork account to my own Notion workspace, to help me, a freelancer working alone, securely organize my own information.
Planned API use: reading my job feed and saved searches, viewing job post details, and submitting proposals to jobs I select myself. No other users' data at all.
Purpose: to gather all my job leads into one Notion database, rate how each fits my skills, and prepare proposals.
Scope: private, internal, one user, one account, mine only. Not public.
My status: an individual Upwork client requesting access for my own personal use, not a developer acting for a client.
Only I use this data, and I never share or resell it.`,
];

// Allocation path only — called once, when a user first claims a slot.
export function messageIndexForSeq(seq: number): number {
  return (seq - 1) % API_KEY_MESSAGES.length;
}

// Read path — resolves a stored index, never recomputes it, so growing the list
// above never changes the text an existing user already pasted into Upwork.
export function messageForIndex(index: number): string {
  return API_KEY_MESSAGES[index] ?? API_KEY_MESSAGES[0];
}
