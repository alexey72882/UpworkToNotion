import Link from "next/link";

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Your Upwork jobs, automatically synced to Notion
        </h1>
        <p className="text-lg text-gray-600 mb-8">
          UpworkToNotion monitors job listings matching your filters and tracks your contract hours — all in your own Notion workspace.
        </p>
        <div className="flex gap-4 mb-16">
          <Link
            href="/auth/signin"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
          >
            Get started free
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {[
            { title: "Job feed", desc: "Filter by category, budget, experience level and more. New jobs appear in Notion every 30 minutes." },
            { title: "Contract diary", desc: "Work hours tracked per day with rates. Know exactly how much you billed this week." },
            { title: "Your Notion", desc: "Data lands in databases you own. No new tool to learn — Notion views, filters, and formulas work as normal." },
          ].map((f) => (
            <div key={f.title} className="border border-gray-200 rounded-xl p-5">
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600">{f.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
