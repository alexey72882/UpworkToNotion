import Link from "next/link";
import Logo from "@/components/Logo";

const features = [
  { title: "Job feed", desc: "Filter by category, budget, experience level and more. New jobs appear in Notion every 30 minutes." },
  { title: "Contract diary", desc: "Work hours tracked per day with rates. Know exactly how much you billed this week." },
  { title: "Your Notion", desc: "Data lands in databases you own. No new tool to learn — Notion views, filters, and formulas work as normal." },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-base-100">
      <div className="max-w-2xl mx-auto px-6 py-20">
        <div className="mb-8"><Logo size={40} /></div>
        <h1 className="text-4xl font-bold tracking-tight mb-4">
          Your Upwork jobs, automatically synced to Notion
        </h1>
        <p className="text-lg text-base-content/60 mb-8">
          UpworkToNotion monitors job listings matching your filters and tracks your contract hours — all in your own Notion workspace.
        </p>
        <div className="flex gap-4 mb-16">
          <Link href="/auth/signin" className="btn btn-soft btn-primary">
            Get started free
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="card border border-base-300 bg-base-100">
              <div className="card-body p-5">
                <h3 className="card-title text-base">{f.title}</h3>
                <p className="text-sm text-base-content/60">{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
