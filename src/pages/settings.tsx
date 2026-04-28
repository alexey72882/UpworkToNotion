import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import AppLayout from "@/components/AppLayout";

const CALLBACK_URL = "https://upwork-to-notion.vercel.app/api/upwork/callback";
const UPWORK_INSTRUCTIONS_URL = "https://www.upwork.com/developer/keys/new";
const NOTION_INSTRUCTIONS_URL = "https://www.notion.so/my-integrations";

type Settings = {
  notion_token?: string;
  job_feed_db_id?: string;
  diary_db_id?: string;
  upwork_person_id?: string;
  upwork_client_id?: string;
  upwork_client_secret?: string;
};

type Tab = "upwork" | "notion";

function UpworkLogo() {
  return (
    <svg width="86" height="25" viewBox="0 0 86 25" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#upwork-clip)">
        <path d="M55.5977 5.54244C51.8456 5.56045 48.789 8.64444 48.8062 12.4843C48.8235 16.3242 51.9106 19.3792 55.6627 19.362C59.4149 19.3448 62.4723 16.26 62.4542 12.4217C62.4362 8.58334 59.3499 5.52599 55.5962 5.544L55.5977 5.54244ZM55.6494 16.5459C54.5857 16.5522 53.5634 16.1347 52.8075 15.3866C52.0516 14.6385 51.6325 13.6194 51.6207 12.5556C51.609 11.4919 52.032 10.4696 52.7801 9.71369C53.5282 8.95777 54.5473 8.53869 55.611 8.52694C56.6748 8.51519 57.6971 8.93819 58.453 9.68627C59.2089 10.4344 59.628 11.4535 59.6397 12.5172C59.6507 14.6518 57.7832 16.535 55.6494 16.5459ZM70.7991 8.79719C68.8368 8.80659 67.3086 10.4344 67.318 12.3966L67.3493 18.9649L64.3632 18.979L64.3029 5.92627L67.289 5.91217L67.2992 7.95902C67.2992 7.95902 68.5682 5.90669 71.1281 5.89494L71.9819 5.89024L71.996 8.79014L70.7991 8.79719ZM41.0121 6.0375L43.2728 14.9847L45.6196 6.01557L48.6057 6.00225L44.9115 19.08L42.0116 19.0933L39.6663 9.97689L37.4056 19.1145L34.5049 19.1278L30.6055 6.09312L33.5054 6.0798L36.106 15.0255L38.1975 6.05787L41.0121 6.0375ZM80.7075 11.8232C82.7481 10.62 84.1894 8.39455 84.1776 5.8354L81.1916 5.8495C81.2025 8.0679 79.4181 9.868 77.2859 9.87584L76.859 9.8774L76.812 -0.44458L73.8259 -0.43048L73.9175 18.9335L76.902 18.9202L76.8738 12.7789L77.2146 12.7773C77.5561 12.7757 77.8984 12.9449 77.9854 13.2003L82.1919 18.8951L85.6895 18.8795L80.7075 11.8232Z" fill="#4B4B4B"/>
        <path d="M23.693 5.69285C20.4524 5.70852 17.988 7.8525 17.066 11.2686C15.519 8.88729 14.3118 6.16364 13.6194 3.86377L10.208 3.87944L10.2503 12.9215C10.254 13.7811 9.91625 14.6072 9.31122 15.2179C8.70619 15.8287 7.88341 16.1742 7.02371 16.1786C6.16402 16.1823 5.33801 15.8445 4.72726 15.2395C4.1165 14.6345 3.77097 13.8117 3.76661 12.952L3.72353 3.90999L0.310547 3.92565L0.352847 12.9677C0.370864 16.7198 3.36868 19.6934 7.03781 19.6754C10.7069 19.6573 13.6789 16.658 13.6617 12.905L13.6538 11.3697C14.3416 12.7303 15.2017 14.1764 16.1472 15.4524L14.0612 25.4423L17.558 25.4266L19.062 18.1682C20.4305 19.0158 21.9603 19.5195 23.7588 19.5109C27.5126 19.4928 30.5699 16.4089 30.5503 12.4844C30.5361 10.6762 29.8071 8.94714 28.5225 7.67458C27.2379 6.40202 25.502 5.68932 23.6938 5.69207L23.693 5.69285ZM23.7416 16.0148C22.377 16.0211 21.0101 15.4305 19.897 14.4967L20.2315 13.1314V13.0531C20.4822 11.6008 21.2357 9.12385 23.7957 9.11289C24.6983 9.11139 25.565 9.46645 26.2071 10.1008C26.8492 10.7352 27.2148 11.5974 27.2243 12.5C27.1475 14.4623 25.5347 16.0054 23.7424 16.0141L23.7416 16.0148Z" fill="#6FDA44"/>
      </g>
      <defs>
        <clipPath id="upwork-clip">
          <rect width="86" height="25" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  );
}

function NotionLogo() {
  return (
    <svg width="86" height="26" viewBox="0 0 86 26" fill="none" xmlns="http://www.w3.org/2000/svg">
      <g clipPath="url(#notion-clip)">
        <path d="M1.57163 1.12167L16.0245 0.059069C17.7998 -0.0925081 18.2559 0.00966989 19.3722 0.817474L23.9858 4.05259C24.7466 4.60898 25 4.76056 25 5.36635V23.1092C25 24.2212 24.5944 24.879 23.1742 24.9793L6.39072 25.9912C5.32503 26.0414 4.81753 25.8898 4.25935 25.1819L0.861952 20.7843C0.252578 19.9749 0 19.3692 0 18.6609V2.88963C0 1.98043 0.40564 1.22229 1.57163 1.12167Z" fill="white"/>
        <path fillRule="evenodd" clipRule="evenodd" d="M16.0243 0.0593294L1.57161 1.12194C0.405636 1.2223 0 1.98071 0 2.88966V18.6611C0 19.369 0.252575 19.9748 0.861943 20.7845L4.2593 25.1818C4.81748 25.8898 5.32498 26.0416 6.39065 25.9912L23.1742 24.9798C24.5933 24.8792 25 24.2214 25 23.1096V5.36665C25 4.79205 24.772 4.62643 24.1007 4.13608L19.372 0.81748C18.256 0.00966996 17.7996 -0.0925088 16.0243 0.0590694V0.0593294ZM6.77017 5.07623C5.39968 5.16801 5.08886 5.18881 4.3105 4.55884L2.33169 2.99209C2.13057 2.7893 2.23165 2.53632 2.73837 2.48588L16.6321 1.47527C17.7989 1.37387 18.4064 1.77869 18.8627 2.13228L21.2456 3.85086C21.3475 3.90208 21.6008 4.20446 21.296 4.20446L6.94778 5.06427L6.77017 5.07623ZM5.17244 22.958V7.89564C5.17244 7.23784 5.37539 6.93443 5.98293 6.88347L22.4628 5.92304C23.0217 5.87286 23.2743 6.22646 23.2743 6.88321V21.8452C23.2743 22.503 23.1724 23.0594 22.2601 23.1096L6.48991 24.0196C5.57755 24.0698 5.1727 23.7674 5.1727 22.958H5.17244ZM20.7397 8.70319C20.8407 9.15818 20.7397 9.61318 20.2826 9.66517L19.5225 9.81519V20.936C18.8624 21.2896 18.2549 21.4917 17.7471 21.4917C16.9356 21.4917 16.7329 21.2387 16.1251 20.481L11.1546 12.6967V20.2281L12.727 20.5824C12.727 20.5824 12.727 21.4924 11.4584 21.4924L7.96096 21.6945C7.85909 21.4917 7.96096 20.9865 8.3154 20.8859L9.2288 20.6337V10.6758L7.96122 10.5736C7.85935 10.1186 8.11271 9.4616 8.82316 9.41064L12.5757 9.15922L17.7474 17.0441V10.0684L16.4292 9.91763C16.3273 9.36046 16.7329 8.95564 17.2396 8.90624L20.7397 8.70319Z" fill="black"/>
        <path d="M80.3516 11.7832V19.2627H77.8203V9.75293H80.1934L80.3516 11.7832ZM79.9824 14.1738H79.2969C79.2969 13.4707 79.3877 12.8379 79.5693 12.2754C79.751 11.707 80.0059 11.2236 80.334 10.8252C80.6621 10.4209 81.0518 10.1133 81.5029 9.90234C81.96 9.68555 82.4697 9.57715 83.0322 9.57715C83.4775 9.57715 83.8848 9.6416 84.2539 9.77051C84.623 9.89941 84.9395 10.1045 85.2031 10.3857C85.4727 10.667 85.6777 11.0391 85.8184 11.502C85.9648 11.9648 86.0381 12.5303 86.0381 13.1982V19.2627H83.4893V13.1895C83.4893 12.7676 83.4307 12.4395 83.3135 12.2051C83.1963 11.9707 83.0234 11.8066 82.7949 11.7129C82.5723 11.6133 82.2969 11.5635 81.9688 11.5635C81.6289 11.5635 81.333 11.6309 81.0811 11.7656C80.835 11.9004 80.6299 12.0879 80.4658 12.3281C80.3076 12.5625 80.1875 12.8379 80.1055 13.1543C80.0234 13.4707 79.9824 13.8105 79.9824 14.1738Z" fill="black"/>
        <path d="M67.3086 14.6045V14.4199C67.3086 13.7227 67.4082 13.0811 67.6074 12.4951C67.8066 11.9033 68.0967 11.3906 68.4775 10.957C68.8584 10.5234 69.3271 10.1865 69.8838 9.94629C70.4404 9.7002 71.0791 9.57715 71.7998 9.57715C72.5205 9.57715 73.1621 9.7002 73.7246 9.94629C74.2871 10.1865 74.7588 10.5234 75.1396 10.957C75.5264 11.3906 75.8193 11.9033 76.0186 12.4951C76.2178 13.0811 76.3174 13.7227 76.3174 14.4199V14.6045C76.3174 15.2959 76.2178 15.9375 76.0186 16.5293C75.8193 17.1152 75.5264 17.6279 75.1396 18.0674C74.7588 18.501 74.29 18.8379 73.7334 19.0781C73.1768 19.3184 72.5381 19.4385 71.8174 19.4385C71.0967 19.4385 70.4551 19.3184 69.8926 19.0781C69.3359 18.8379 68.8643 18.501 68.4775 18.0674C68.0967 17.6279 67.8066 17.1152 67.6074 16.5293C67.4082 15.9375 67.3086 15.2959 67.3086 14.6045ZM69.8398 14.4199V14.6045C69.8398 15.0029 69.875 15.375 69.9453 15.7207C70.0156 16.0664 70.127 16.3711 70.2793 16.6348C70.4375 16.8926 70.6426 17.0947 70.8945 17.2412C71.1465 17.3877 71.4541 17.4609 71.8174 17.4609C72.1689 17.4609 72.4707 17.3877 72.7227 17.2412C72.9746 17.0947 73.1768 16.8926 73.3291 16.6348C73.4814 16.3711 73.5928 16.0664 73.6631 15.7207C73.7393 15.375 73.7773 15.0029 73.7773 14.6045V14.4199C73.7773 14.0332 73.7393 13.6699 73.6631 13.3301C73.5928 12.9844 73.4785 12.6797 73.3203 12.416C73.168 12.1465 72.9658 11.9355 72.7139 11.7832C72.4619 11.6309 72.1572 11.5547 71.7998 11.5547C71.4424 11.5547 71.1377 11.6309 70.8857 11.7832C70.6396 11.9355 70.4375 12.1465 70.2793 12.416C70.127 12.6797 70.0156 12.9844 69.9453 13.3301C69.875 13.6699 69.8398 14.0332 69.8398 14.4199Z" fill="black"/>
        <path d="M65.6221 9.75293V19.2627H63.082V9.75293H65.6221ZM62.9238 7.27441C62.9238 6.90527 63.0527 6.60059 63.3105 6.36035C63.5684 6.12012 63.9141 6 64.3477 6C64.7754 6 65.1182 6.12012 65.376 6.36035C65.6396 6.60059 65.7715 6.90527 65.7715 7.27441C65.7715 7.64355 65.6396 7.94824 65.376 8.18848C65.1182 8.42871 64.7754 8.54883 64.3477 8.54883C63.9141 8.54883 63.5684 8.42871 63.3105 8.18848C63.0527 7.94824 62.9238 7.64355 62.9238 7.27441Z" fill="black"/>
        <path d="M61.5078 9.75293V11.5459H55.9707V9.75293H61.5078ZM57.3418 7.40625H59.873V16.3975C59.873 16.6729 59.9082 16.8838 59.9785 17.0303C60.0547 17.1768 60.166 17.2793 60.3125 17.3379C60.459 17.3906 60.6436 17.417 60.8662 17.417C61.0244 17.417 61.165 17.4111 61.2881 17.3994C61.417 17.3818 61.5254 17.3643 61.6133 17.3467L61.6221 19.21C61.4053 19.2803 61.1709 19.3359 60.9189 19.377C60.667 19.418 60.3887 19.4385 60.084 19.4385C59.5273 19.4385 59.041 19.3477 58.625 19.166C58.2148 18.9785 57.8984 18.6797 57.6758 18.2695C57.4531 17.8594 57.3418 17.3203 57.3418 16.6523V7.40625Z" fill="black"/>
        <path d="M46.2852 14.6045V14.4199C46.2852 13.7227 46.3848 13.0811 46.584 12.4951C46.7832 11.9033 47.0732 11.3906 47.4541 10.957C47.835 10.5234 48.3037 10.1865 48.8604 9.94629C49.417 9.7002 50.0557 9.57715 50.7764 9.57715C51.4971 9.57715 52.1387 9.7002 52.7012 9.94629C53.2637 10.1865 53.7354 10.5234 54.1162 10.957C54.5029 11.3906 54.7959 11.9033 54.9951 12.4951C55.1943 13.0811 55.2939 13.7227 55.2939 14.4199V14.6045C55.2939 15.2959 55.1943 15.9375 54.9951 16.5293C54.7959 17.1152 54.5029 17.6279 54.1162 18.0674C53.7354 18.501 53.2666 18.8379 52.71 19.0781C52.1533 19.3184 51.5146 19.4385 50.7939 19.4385C50.0732 19.4385 49.4316 19.3184 48.8691 19.0781C48.3125 18.8379 47.8408 18.501 47.4541 18.0674C47.0732 17.6279 46.7832 17.1152 46.584 16.5293C46.3848 15.9375 46.2852 15.2959 46.2852 14.6045ZM48.8164 14.4199V14.6045C48.8164 15.0029 48.8516 15.375 48.9219 15.7207C48.9922 16.0664 49.1035 16.3711 49.2559 16.6348C49.4141 16.8926 49.6191 17.0947 49.8711 17.2412C50.123 17.3877 50.4307 17.4609 50.7939 17.4609C51.1455 17.4609 51.4473 17.3877 51.6992 17.2412C51.9512 17.0947 52.1533 16.8926 52.3057 16.6348C52.458 16.3711 52.5693 16.0664 52.6396 15.7207C52.7158 15.375 52.7539 15.0029 52.7539 14.6045V14.4199C52.7539 14.0332 52.7158 13.6699 52.6396 13.3301C52.5693 12.9844 52.4551 12.6797 52.2969 12.416C52.1445 12.1465 51.9424 11.9355 51.6904 11.7832C51.4385 11.6309 51.1338 11.5547 50.7764 11.5547C50.4189 11.5547 50.1143 11.6309 49.8623 11.7832C49.6162 11.9355 49.4141 12.1465 49.2559 12.416C49.1035 12.6797 48.9922 12.9844 48.9219 13.3301C48.8516 13.6699 48.8164 14.0332 48.8164 14.4199Z" fill="black"/>
        <path d="M44.5537 6.46582V19.2627H41.917L36.7754 10.6846V19.2627H34.1387V6.46582H36.7754L41.9258 15.0527V6.46582H44.5537Z" fill="black"/>
      </g>
      <defs>
        <clipPath id="notion-clip">
          <rect width="86" height="26" fill="white"/>
        </clipPath>
      </defs>
    </svg>
  );
}

function ReconnectIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upwork");
  const [form, setForm] = useState<Settings>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [upworkConnected, setUpworkConnected] = useState(false);
  const [notionConnected, setNotionConnected] = useState(false);

  useEffect(() => {
    fetch("/api/user/settings")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok) {
          setForm(d.settings ?? {});
          setUpworkConnected(!!d.settings?.upwork_person_id);
          setNotionConnected(!!(d.settings?.notion_token && d.settings?.job_feed_db_id));
        }
        setLoading(false);
      });
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) router.replace("/auth/signin");
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const field = (key: keyof Settings) => ({
    value: form[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  async function saveAndConnect() {
    setSaving(true);
    await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    window.location.href = "/api/upwork/auth";
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/user/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }


  if (loading) {
    return (
      <AppLayout>
        <div className="skeleton h-8 w-48 mb-6" />
        <div className="w-full rounded-2xl overflow-hidden border border-base-300">
          <div className="flex gap-2 p-2 bg-base-200">
            <div className="skeleton h-8 w-20" />
            <div className="skeleton h-8 w-20" />
          </div>
          <div className="p-6 space-y-6">
            <div className="skeleton h-6 w-24" />
            <div className="skeleton h-12 w-full rounded-xl" />
            <div className="space-y-4">
              <div>
                <div className="skeleton h-4 w-20 mb-2" />
                <div className="skeleton h-10 w-full" />
              </div>
              <div>
                <div className="skeleton h-4 w-24 mb-2" />
                <div className="skeleton h-10 w-full" />
              </div>
            </div>
            <div className="skeleton h-10 w-full" />
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <h2 className="text-2xl font-semibold text-base-content mb-6">Integrations</h2>

      <form onSubmit={save} className="w-full">
        <div className="tabs tabs-box w-full">

          {/* Upwork tab */}
          <input
            type="radio"
            name="integration_tabs"
            className="tab"
            aria-label="Upwork"
            checked={tab === "upwork"}
            onChange={() => setTab("upwork")}
          />
          <div className="tab-content bg-base-100 border-base-300 p-6">
            {upworkConnected ? (
              <>
                {/* Header — connected */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <UpworkLogo />
                    <span className="badge badge-outline badge-success">Connected</span>
                  </div>
                  <div className="tooltip" data-tip="Reconnect Upwork API">
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                    <a href="/api/upwork/auth" className="btn btn-circle btn-success">
                      <ReconnectIcon />
                    </a>
                  </div>
                </div>

                {/* Fields */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Client key</span></label>
                    <input type="text" className="input input-bordered w-full" {...field("upwork_client_id")} />
                  </div>
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Client secret</span></label>
                    <input type="password" placeholder="••••••••" className="input input-bordered w-full" {...field("upwork_client_secret")} />
                  </div>
                </div>

                {/* Save */}
                <button type="submit" disabled={saving} className="btn btn-block btn-soft btn-primary">
                  {saving && <span className="loading loading-spinner loading-xs" />}
                  {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
                </button>
              </>
            ) : (
              <>
                {/* Header — not connected */}
                <div className="flex items-center mb-6">
                  <UpworkLogo />
                </div>

                {/* Instructions */}
                <div role="alert" className="alert alert-vertical sm:alert-horizontal mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info h-6 w-6 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="font-bold">Instructions</h3>
                    <div className="text-xs">To connect Upwork, you&apos;ll need an API Client key and Secret. Apply via the Upwork Developer Portal — approval can take up to 24 hours.</div>
                  </div>
                  <a href={UPWORK_INSTRUCTIONS_URL} target="_blank" rel="noreferrer" className="btn btn-sm">Go to instructions</a>
                </div>

                {/* Fields */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Client key</span></label>
                    <input type="text" placeholder="e.g. abc123xyz_client_key" className="input input-bordered w-full" {...field("upwork_client_id")} />
                  </div>
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Client secret</span></label>
                    <input type="password" placeholder="••••••••" className="input input-bordered w-full" {...field("upwork_client_secret")} />
                  </div>
                  <div className="text-xs text-base-content/40 space-y-1">
                    <p>Set this as your OAuth Callback URL:</p>
                    <code className="block bg-base-200 px-3 py-1.5 rounded break-all">{CALLBACK_URL}</code>
                  </div>
                </div>

                {/* Actions */}
                <button type="button" onClick={saveAndConnect} disabled={saving} className="btn btn-block btn-soft btn-primary">
                  {saving && <span className="loading loading-spinner loading-xs" />}
                  {saving ? "Connecting…" : "Save & Connect"}
                </button>
              </>
            )}
          </div>

          {/* Notion tab */}
          <input
            type="radio"
            name="integration_tabs"
            className="tab"
            aria-label="Notion"
            checked={tab === "notion"}
            onChange={() => setTab("notion")}
          />
          <div className="tab-content bg-base-100 border-base-300 p-6">
            {notionConnected ? (
              <>
                {/* Header — connected */}
                <div className="flex items-center gap-3 mb-6">
                  <NotionLogo />
                  <span className="badge badge-outline badge-success">Connected</span>
                </div>

                {/* Fields */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Integration token</span></label>
                    <input type="password" placeholder="secret_abc123..." className="input input-bordered w-full" {...field("notion_token")} />
                  </div>
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Job Feed Database ID</span></label>
                    <input type="text" className="input input-bordered w-full" {...field("job_feed_db_id")} />
                  </div>
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Work Diary Database ID</span></label>
                    <input type="text" className="input input-bordered w-full" {...field("diary_db_id")} />
                  </div>
                </div>

                {/* Save */}
                <button type="submit" disabled={saving} className="btn btn-block btn-soft btn-primary">
                  {saving && <span className="loading loading-spinner loading-xs" />}
                  {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
                </button>
              </>
            ) : (
              <>
                {/* Header — not connected */}
                <div className="flex items-center mb-6">
                  <NotionLogo />
                </div>

                {/* Instructions */}
                <div role="alert" className="alert alert-vertical sm:alert-horizontal mb-6">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="stroke-info h-6 w-6 shrink-0">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <div>
                    <h3 className="font-bold">Instructions</h3>
                    <div className="text-xs">Create an integration at notion.so/my-integrations, then share each database with it. Paste the integration token and database IDs below.</div>
                  </div>
                  <a href={NOTION_INSTRUCTIONS_URL} target="_blank" rel="noreferrer" className="btn btn-sm">Go to instructions</a>
                </div>

                {/* Fields */}
                <div className="space-y-4 mb-6">
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Integration token</span></label>
                    <input type="password" placeholder="secret_abc123..." className="input input-bordered w-full" {...field("notion_token")} />
                  </div>
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Job Feed Database ID</span></label>
                    <input type="text" placeholder="32-char hex from DB URL" className="input input-bordered w-full" {...field("job_feed_db_id")} />
                  </div>
                  <div>
                    <label className="label py-1 px-0"><span className="label-text text-sm">Work Diary Database ID</span></label>
                    <input type="text" placeholder="32-char hex from DB URL" className="input input-bordered w-full" {...field("diary_db_id")} />
                  </div>
                </div>

                {/* Actions */}
                <button type="submit" disabled={saving} className="btn btn-block btn-soft btn-primary">
                  {saving && <span className="loading loading-spinner loading-xs" />}
                  {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
                </button>
              </>
            )}
          </div>

        </div>
      </form>
    </AppLayout>
  );
}
