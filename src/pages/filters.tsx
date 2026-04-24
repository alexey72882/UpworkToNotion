import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import AppLayout from "@/components/AppLayout";

// Category → subcategory label mapping (display label → full key for API)
const SUBCATEGORIES: Record<string, { key: string; label: string }[]> = {
  "Web / Mobile & Software Dev": [
    { key: "Dev › Web Development",                 label: "Web Development" },
    { key: "Dev › Web & Mobile Design",             label: "Web & Mobile Design" },
    { key: "Dev › Mobile Development",              label: "Mobile Development" },
    { key: "Dev › Desktop Application Development", label: "Desktop Application Development" },
    { key: "Dev › Ecommerce Development",           label: "Ecommerce Development" },
    { key: "Dev › Game Design & Development",       label: "Game Design & Development" },
    { key: "Dev › AI Apps & Integration",           label: "AI Apps & Integration" },
    { key: "Dev › Blockchain, NFT & Cryptocurrency",label: "Blockchain, NFT & Cryptocurrency" },
    { key: "Dev › Scripts & Utilities",             label: "Scripts & Utilities" },
    { key: "Dev › Product Management & Scrum",      label: "Product Management & Scrum" },
    { key: "Dev › QA Testing",                      label: "QA Testing" },
    { key: "Dev › Other - Software Development",    label: "Other - Software Development" },
  ],
  "Design & Creative": [
    { key: "Design › Art & Illustration",                       label: "Art & Illustration" },
    { key: "Design › Branding & Logo Design",                   label: "Branding & Logo Design" },
    { key: "Design › Graphic, Editorial & Presentation Design", label: "Graphic, Editorial & Presentation Design" },
    { key: "Design › Product Design",                           label: "Product Design" },
    { key: "Design › Video & Animation",                        label: "Video & Animation" },
    { key: "Design › Audio & Music Production",                 label: "Audio & Music Production" },
    { key: "Design › Photography",                              label: "Photography" },
    { key: "Design › NFT, AR/VR & Game Art",                    label: "NFT, AR/VR & Game Art" },
    { key: "Design › Performing Arts",                          label: "Performing Arts" },
  ],
  "IT & Networking": [
    { key: "IT › Database Management & Administration", label: "Database Management & Administration" },
    { key: "IT › ERP/CRM Software",                    label: "ERP/CRM Software" },
    { key: "IT › Information Security & Compliance",   label: "Information Security & Compliance" },
    { key: "IT › Network & System Administration",     label: "Network & System Administration" },
    { key: "IT › DevOps & Solution Architecture",      label: "DevOps & Solution Architecture" },
  ],
  "Data Science & Analytics": [
    { key: "Data › Data Analysis & Testing",  label: "Data Analysis & Testing" },
    { key: "Data › Data Extraction/ETL",      label: "Data Extraction/ETL" },
    { key: "Data › Data Mining & Management", label: "Data Mining & Management" },
    { key: "Data › AI & Machine Learning",    label: "AI & Machine Learning" },
  ],
  "Sales & Marketing": [
    { key: "Marketing › Digital Marketing",               label: "Digital Marketing" },
    { key: "Marketing › Lead Generation & Telemarketing", label: "Lead Generation & Telemarketing" },
    { key: "Marketing › Marketing, PR & Brand Strategy",  label: "Marketing, PR & Brand Strategy" },
  ],
  "Writing": [
    { key: "Writing › Content Writing",                    label: "Content Writing" },
    { key: "Writing › Sales & Marketing Copywriting",      label: "Sales & Marketing Copywriting" },
    { key: "Writing › Editing & Proofreading Services",    label: "Editing & Proofreading Services" },
    { key: "Writing › Professional & Business Writing",    label: "Professional & Business Writing" },
  ],
  "Admin Support": [
    { key: "Admin › Data Entry & Transcription Services", label: "Data Entry & Transcription Services" },
    { key: "Admin › Virtual Assistance",                  label: "Virtual Assistance" },
    { key: "Admin › Project Management",                  label: "Project Management" },
    { key: "Admin › Market Research & Product Reviews",   label: "Market Research & Product Reviews" },
  ],
  "Accounting & Consulting": [
    { key: "Accounting › Accounting & Bookkeeping",          label: "Accounting & Bookkeeping" },
    { key: "Accounting › Financial Planning",                label: "Financial Planning" },
    { key: "Accounting › Management Consulting & Analysis",  label: "Management Consulting & Analysis" },
    { key: "Accounting › Recruiting & Human Resources",      label: "Recruiting & Human Resources" },
    { key: "Accounting › Personal & Professional Coaching",  label: "Personal & Professional Coaching" },
    { key: "Accounting › Other - Accounting & Consulting",   label: "Other - Accounting & Consulting" },
  ],
};

const CATEGORIES = Object.keys(SUBCATEGORIES);
const JOB_TYPES = ["Hourly", "Fixed-Price"] as const;
const EXP_LEVELS = ["Entry", "Intermediate", "Expert"] as const;

type WebFilter = {
  category: string;
  subcategoryIds: string[];
  jobType: string[];
  experienceLevel: string[];
  verifiedPaymentOnly: boolean;
};

const EMPTY: WebFilter = {
  category: "",
  subcategoryIds: [],
  jobType: [],
  experienceLevel: [],
  verifiedPaymentOnly: false,
};

function hasChanges(f: WebFilter) {
  return !!(f.category || f.subcategoryIds.length || f.jobType.length || f.experienceLevel.length || f.verifiedPaymentOnly);
}

export default function FiltersPage() {
  const router = useRouter();
  const [form, setForm] = useState<WebFilter>(EMPTY);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const categoryDropdownRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    getSupabaseBrowser().auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/auth/signin");
    });
    fetch("/api/user/settings").then(r => r.json()).then(d => {
      if (d.ok && d.settings?.web_filter) {
        setForm(d.settings.web_filter);
      }
    });
  }, [router]);

  function toggleSubcat(key: string) {
    setForm(f => ({
      ...f,
      subcategoryIds: f.subcategoryIds.includes(key)
        ? f.subcategoryIds.filter(k => k !== key)
        : [...f.subcategoryIds, key],
    }));
    setSaved(false);
  }

  function toggleJobType(v: string) {
    setForm(f => ({
      ...f,
      jobType: f.jobType.includes(v) ? f.jobType.filter(x => x !== v) : [...f.jobType, v],
    }));
    setSaved(false);
  }

  function toggleExpLevel(v: string) {
    setForm(f => ({
      ...f,
      experienceLevel: f.experienceLevel.includes(v) ? f.experienceLevel.filter(x => x !== v) : [...f.experienceLevel, v],
    }));
    setSaved(false);
  }

  function onCategoryChange(cat: string) {
    setForm(f => ({ ...f, category: cat }));
    setSaved(false);
  }

  function resetAll() {
    setForm(EMPTY);
    setSaved(false);
  }

  async function applyFilters() {
    setSaving(true);
    await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ web_filter: form }),
    });
    setSaving(false);
    setSaved(true);
  }

  const subcats = form.category ? (SUBCATEGORIES[form.category] ?? []) : [];

  const activeChips: { key: string; label: string; onRemove: () => void }[] = [
    ...form.subcategoryIds.map(key => ({
      key,
      label: SUBCATEGORIES[form.category]?.find(s => s.key === key)?.label ?? key,
      onRemove: () => toggleSubcat(key),
    })),
    ...form.jobType.map(v => ({
      key: `jobType:${v}`,
      label: v,
      onRemove: () => toggleJobType(v),
    })),
    ...form.experienceLevel.map(v => ({
      key: `exp:${v}`,
      label: v,
      onRemove: () => toggleExpLevel(v),
    })),
    ...(form.verifiedPaymentOnly ? [{
      key: "verifiedPayment",
      label: "Verified Payment",
      onRemove: () => { setForm(f => ({ ...f, verifiedPaymentOnly: false })); setSaved(false); },
    }] : []),
  ];
  const dirty = hasChanges(form);
  const half = Math.ceil(subcats.length / 2);

  return (
    <AppLayout>
      <div className="flex flex-col gap-6">
        <h2 className="text-2xl font-semibold text-base-content">Upwork Job Filter</h2>

        {/* Success alert */}
        {saved && (
          <div role="alert" className="alert alert-success alert-soft">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 shrink-0 stroke-current" fill="none" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>Filters successfully applied!</span>
          </div>
        )}

        {/* Active filter chips */}
        <div className={`grid transition-all duration-300 ease-in-out ${activeChips.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
          <div className="flex flex-wrap gap-2 items-center pb-0">
            {activeChips.map(({ key, label, onRemove }) => (
              <button key={key} onClick={onRemove} className="btn btn-neutral btn-sm rounded-full gap-1">
                {label}
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ))}
            <button onClick={resetAll} className="btn btn-outline btn-neutral btn-sm rounded-full">
              Reset All
            </button>
          </div>
          </div>
        </div>

        {/* Filter card */}
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body gap-6">
            <h3 className="text-lg font-bold text-base-content">Filters</h3>
            <div className="divider my-0" />

            {/* Category */}
            <div className="flex items-start gap-4">
              <span className="text-sm text-base-content w-36 shrink-0 mt-2">Category</span>
              <details ref={categoryDropdownRef} className="dropdown w-72 shrink-0">
                <summary className="select select-bordered w-full flex items-center list-none cursor-pointer">
                  <span className={form.category ? "text-base-content" : "text-base-content/40"}>
                    {form.category || "Select one"}
                  </span>
                </summary>
                <ul className="dropdown-content menu bg-base-100 rounded-box shadow-lg w-full z-20 max-h-64 overflow-y-auto flex-nowrap">
                  <li>
                    <button onClick={() => { onCategoryChange(""); categoryDropdownRef.current?.removeAttribute("open"); }}>
                      <span className="text-base-content/40">Select one</span>
                    </button>
                  </li>
                  {CATEGORIES.map(c => (
                    <li key={c}>
                      <button
                        className={form.category === c ? "active" : ""}
                        onClick={() => { onCategoryChange(c); categoryDropdownRef.current?.removeAttribute("open"); }}
                      >
                        {c}
                      </button>
                    </li>
                  ))}
                </ul>
              </details>
              <div className={`grid transition-all duration-300 ease-in-out flex-1 ml-4 ${subcats.length > 0 ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                <div className="overflow-hidden">
                  <div className="flex gap-8">
                    <div className="flex flex-col gap-2.5 flex-1">
                      {subcats.slice(0, half).map(s => (
                        <label key={s.key} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={form.subcategoryIds.includes(s.key)}
                            onChange={() => toggleSubcat(s.key)}
                          />
                          <span className="text-sm">{s.label}</span>
                        </label>
                      ))}
                    </div>
                    <div className="flex flex-col gap-2.5 flex-1">
                      {subcats.slice(half).map(s => (
                        <label key={s.key} className="flex items-center gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            className="checkbox checkbox-sm"
                            checked={form.subcategoryIds.includes(s.key)}
                            onChange={() => toggleSubcat(s.key)}
                          />
                          <span className="text-sm">{s.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="divider my-0" />

            {/* Job type */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-base-content w-36 shrink-0">Job type</span>
              <div className="w-72 shrink-0" />
              <div className="flex gap-6 ml-4">
                {JOB_TYPES.map(t => (
                  <label key={t} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={form.jobType.includes(t)}
                      onChange={() => toggleJobType(t)}
                    />
                    <span className="text-sm">{t}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="divider my-0" />

            {/* Experience level */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-base-content w-36 shrink-0">Experience level</span>
              <div className="w-72 shrink-0" />
              <div className="flex gap-6 ml-4">
                {EXP_LEVELS.map(l => (
                  <label key={l} className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="checkbox checkbox-sm"
                      checked={form.experienceLevel.includes(l)}
                      onChange={() => toggleExpLevel(l)}
                    />
                    <span className="text-sm">{l}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="divider my-0" />

            {/* Verified payment only */}
            <div className="flex items-center gap-4">
              <span className="text-sm text-base-content w-36 shrink-0">Verified Payment only</span>
              <div className="w-72 shrink-0" />
              <label className="flex items-center gap-3 cursor-pointer ml-4">
                <input
                  type="checkbox"
                  className="toggle toggle-sm"
                  checked={form.verifiedPaymentOnly}
                  onChange={e => { setForm(f => ({ ...f, verifiedPaymentOnly: e.target.checked })); setSaved(false); }}
                />
                <span className="text-sm">Show only clients with verified payment method</span>
              </label>
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex justify-end gap-4">
          <button
            className="btn btn-outline btn-sm"
            onClick={resetAll}
            disabled={!dirty}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={applyFilters}
            disabled={!dirty || saving}
          >
            {saving && <span className="loading loading-spinner loading-xs" />}
            Apply filters
          </button>
        </div>
      </div>
    </AppLayout>
  );
}
