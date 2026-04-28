import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import AppLayout from "@/components/AppLayout";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";

export default function ProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSaved, setPasswordSaved] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteModalRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowser();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { router.replace("/auth/signin"); return; }
      setEmail(user.email ?? "");
      setFirstName(user.user_metadata?.first_name ?? "");
      setLoading(false);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    await getSupabaseBrowser().auth.updateUser({ data: { first_name: firstName } });
    setSavingProfile(false);
    setProfileSaved(true);
    setTimeout(() => setProfileSaved(false), 3000);
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("Passwords don't match.");
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters.");
      return;
    }
    setSavingPassword(true);
    const { error } = await getSupabaseBrowser().auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) { setPasswordError(error.message); return; }
    setNewPassword("");
    setConfirmPassword("");
    setPasswordSaved(true);
    setTimeout(() => setPasswordSaved(false), 3000);
  }

  async function deleteAccount() {
    setDeleting(true);
    await getSupabaseBrowser().auth.signOut();
    await fetch("/api/user/delete", { method: "DELETE" });
    router.replace("/auth/signin");
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="skeleton h-8 w-32 mb-6" />
        <div className="space-y-4 w-full">
          <div className="skeleton h-40 w-full rounded-2xl" />
          <div className="skeleton h-40 w-full rounded-2xl" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <h2 className="text-2xl font-semibold text-base-content mb-6">Profile</h2>

      <div className="space-y-4 w-full">

        {/* Profile info */}
        <form onSubmit={saveProfile} className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h3 className="font-semibold text-base-content">Personal info</h3>
            <div>
              <label className="label py-1 px-0"><span className="label-text text-sm">First name</span></label>
              <input
                type="text"
                placeholder="Your first name"
                className="input input-bordered w-full"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label className="label py-1 px-0"><span className="label-text text-sm">Email</span></label>
              <input type="email" className="input input-bordered w-full opacity-50" value={email} readOnly />
            </div>
            <button type="submit" disabled={savingProfile} className="btn btn-block btn-soft btn-primary">
              {savingProfile && <span className="loading loading-spinner loading-xs" />}
              {savingProfile ? "Saving…" : profileSaved ? "Saved ✓" : "Save"}
            </button>
          </div>
        </form>

        {/* Change password */}
        <form onSubmit={changePassword} className="card bg-base-100 border border-base-300">
          <div className="card-body gap-4">
            <h3 className="font-semibold text-base-content">Change password</h3>
            <div>
              <label className="label py-1 px-0"><span className="label-text text-sm">New password</span></label>
              <input
                type="password"
                placeholder="••••••••"
                className="input input-bordered w-full"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="label py-1 px-0"><span className="label-text text-sm">Confirm password</span></label>
              <input
                type="password"
                placeholder="••••••••"
                className="input input-bordered w-full"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
            {passwordError && <p className="text-sm text-error">{passwordError}</p>}
            <button type="submit" disabled={savingPassword} className="btn btn-block btn-soft btn-primary">
              {savingPassword && <span className="loading loading-spinner loading-xs" />}
              {savingPassword ? "Saving…" : passwordSaved ? "Saved ✓" : "Change password"}
            </button>
          </div>
        </form>

        {/* Danger zone */}
        <div className="card bg-base-100 border border-error/30">
          <div className="card-body gap-4">
            <h3 className="font-semibold text-error">Danger zone</h3>
            <p className="text-sm text-base-content/60">Permanently delete your account and all associated data. This cannot be undone.</p>
            <button type="button" onClick={() => deleteModalRef.current?.showModal()} className="btn btn-block btn-soft btn-error">
              Delete account
            </button>
          </div>
        </div>

      </div>

      {/* Confirm delete modal */}
      <dialog ref={deleteModalRef} className="modal">
        <div className="modal-box">
          <h3 className="font-bold text-lg">Delete account</h3>
          <p className="py-4 text-sm text-base-content/70">Are you sure? This will permanently delete your account and all data. This cannot be undone.</p>
          <div className="modal-action">
            <form method="dialog">
              <button className="btn btn-ghost">Cancel</button>
            </form>
            <button onClick={deleteAccount} disabled={deleting} className="btn btn-error">
              {deleting && <span className="loading loading-spinner loading-xs" />}
              {deleting ? "Deleting…" : "Yes, delete"}
            </button>
          </div>
        </div>
        <form method="dialog" className="modal-backdrop"><button>close</button></form>
      </dialog>
    </AppLayout>
  );
}
