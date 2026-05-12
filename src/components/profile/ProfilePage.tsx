"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  User,
  Globe,
  Shield,
  HardDrive,
  CreditCard,
  CheckCircle,
  AlertCircle,
  Loader2,
  Camera,
  Lock,
  Mail,
  Eye,
  EyeOff,
  History,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";

/* ─── Types ─── */
interface ProfileData {
  id?: string;
  name?: string | null;
  region?: string | null;
  avatarUrl?: string | null;
  plan?: string | null;
}

interface StorageData {
  usedBytes: number;
  usedMB: number;
  limitBytes: number;
  limitMB: number;
  limitGB: number;
  fileCount: number;
  plan: string;
  percentUsed: number;
}

const REGIONS = [
  { value: "US", label: "United States" },
  { value: "UK", label: "United Kingdom" },
  { value: "EU", label: "Europe" },
  { value: "IN", label: "India" },
  { value: "AU", label: "Australia" },
  { value: "CA", label: "Canada" },
  { value: "JP", label: "Japan" },
  { value: "BR", label: "Brazil" },
  { value: "Other", label: "Other" },
];

/* ─── Container animation variants ─── */
const pageVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: "easeOut", staggerChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

/* ─── Component ─── */
export default function ProfilePage() {
  const { navigateHome } = useAppStore();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* Profile state */
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileData>({});
  const [email, setEmail] = useState("");
  const [editName, setEditName] = useState("");
  const [editRegion, setEditRegion] = useState<string>("");
  const [savingProfile, setSavingProfile] = useState(false);

  /* Security state */
  const [newEmail, setNewEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [secLoading, setSecLoading] = useState<"email" | "password" | null>(null);
  const [secMessage, setSecMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  /* Storage state */
  const [storage, setStorage] = useState<StorageData | null>(null);

  /* Photo upload */
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  /* ─── Fetch profile + storage ─── */
  const fetchProfile = useCallback(async () => {
    try {
      const res = await fetch("/api/profile");
      if (!res.ok) throw new Error("Failed to load profile");
      const data = await res.json();
      setProfile(data.profile || {});
      setEmail(data.email || "");
      setEditName(data.name || "");
      setEditRegion(data.profile?.region || "");
    } catch {
      toast({ title: "Error", description: "Failed to load profile data." });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchStorage = useCallback(async () => {
    try {
      const res = await fetch("/api/storage");
      if (!res.ok) return;
      const data = await res.json();
      setStorage(data);
    } catch {
      // silently ignore
    }
  }, []);

  useEffect(() => {
    fetchProfile();
    fetchStorage();
  }, [fetchProfile, fetchStorage]);

  /* ─── Save profile info ─── */
  const handleSaveProfile = async () => {
    setSavingProfile(true);
    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName, region: editRegion }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const data = await res.json();
      setProfile(data.profile);
      toast({ title: "Success", description: "Profile updated successfully." });
    } catch {
      toast({ title: "Error", description: "Failed to save profile changes." });
    } finally {
      setSavingProfile(false);
    }
  };

  /* ─── Photo upload ─── */
  const handlePhotoClick = () => fileInputRef.current?.click();

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
      toast({ title: "Invalid file", description: "Only JPEG, PNG, WebP, and GIF images are allowed." });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "File too large", description: "Image must be under 5 MB." });
      return;
    }

    setUploadingPhoto(true);
    try {
      const formData = new FormData();
      formData.append("photo", file);
      const res = await fetch("/api/profile/photo", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      setProfile((prev) => ({ ...prev, avatarUrl: data.avatarUrl }));
      toast({ title: "Success", description: "Photo updated." });
    } catch {
      toast({ title: "Error", description: "Failed to upload photo." });
    } finally {
      setUploadingPhoto(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  /* ─── Security actions ─── */
  const handleChangeEmail = async () => {
    if (!newEmail.trim()) return;
    setSecLoading("email");
    setSecMessage(null);
    try {
      const res = await fetch("/api/profile/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-email", newEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSecMessage({ type: "success", text: data.message });
      setNewEmail("");
    } catch (err) {
      setSecMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update email." });
    } finally {
      setSecLoading(null);
    }
  };

  const handleChangePassword = async () => {
    if (!currentPassword || !newPassword) return;
    if (newPassword.length < 6) {
      setSecMessage({ type: "error", text: "New password must be at least 6 characters." });
      return;
    }
    setSecLoading("password");
    setSecMessage(null);
    try {
      const res = await fetch("/api/profile/security", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "change-password", currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSecMessage({ type: "success", text: data.message });
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      setSecMessage({ type: "error", text: err instanceof Error ? err.message : "Failed to update password." });
    } finally {
      setSecLoading(null);
    }
  };

  /* ─── Helpers ─── */
  const getInitials = (name: string, fallbackEmail: string) => {
    const parts = (name || "").trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    if (name) return name[0].toUpperCase();
    return (fallbackEmail || "?")[0].toUpperCase();
  };

  const storageColor = () => {
    if (!storage) return "bg-emerald-500 [&>div]:bg-emerald-500";
    if (storage.percentUsed > 80) return "bg-red-500 [&>div]:bg-red-500";
    if (storage.percentUsed > 50) return "bg-amber-500 [&>div]:bg-amber-500";
    return "bg-emerald-500 [&>div]:bg-emerald-500";
  };

  const storageBadge = () => {
    if (!storage) return <Badge variant="secondary">Free Plan</Badge>;
    if (storage.plan === "pro") return <Badge variant="secondary" className="bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400 border-0">Pro Plan</Badge>;
    if (storage.plan === "enterprise") return <Badge variant="secondary" className="bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-0">Enterprise</Badge>;
    return <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400 border-0">Free Plan</Badge>;
  };

  /* ─── Loading skeleton ─── */
  if (loading) {
    return (
      <div className="min-h-screen pt-20 bg-card">
        <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex items-center gap-2 mb-8">
            <div className="w-4 h-4 bg-muted animate-pulse rounded" />
            <div className="w-24 h-4 bg-muted animate-pulse rounded" />
          </div>
          <div className="flex flex-col items-center gap-4 mb-10">
            <div className="w-16 h-16 rounded-full bg-muted animate-pulse" />
            <div className="w-32 h-5 bg-muted animate-pulse rounded" />
            <div className="w-48 h-3 bg-muted animate-pulse rounded" />
          </div>
          <div className="space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-40 bg-muted/50 animate-pulse rounded-2xl" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  /* ─── Render ─── */
  return (
    <div className="min-h-screen pt-20 bg-card">
      <section className="border-b border-border bg-muted/30">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
          {/* Breadcrumb */}
          <motion.button
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={navigateHome}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group mb-4"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Home
          </motion.button>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-3 mb-2"
          >
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <User className="w-5 h-5 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">
              My Profile
            </h1>
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.15 }}
            className="text-muted-foreground text-sm sm:text-base"
          >
            Manage your account settings and preferences.
          </motion.p>
        </div>
      </section>

      <motion.section
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6"
      >
        {/* ── 1. Profile Header ── */}
        <motion.div variants={itemVariants} className="flex flex-col items-center gap-4 py-4">
          {/* Avatar */}
          <button
            onClick={handlePhotoClick}
            className="relative group cursor-pointer"
            aria-label="Change profile photo"
          >
            {profile.avatarUrl ? (
              <img
                src={profile.avatarUrl}
                alt="Avatar"
                className="w-16 h-16 rounded-full object-cover border-2 border-primary/20 group-hover:border-primary/40 transition-colors"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-primary/10 border-2 border-primary/20 group-hover:border-primary/40 flex items-center justify-center transition-colors">
                <span className="text-xl font-bold text-primary">
                  {getInitials(editName || profile.name || "", email)}
                </span>
              </div>
            )}
            {uploadingPhoto ? (
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                <Loader2 className="w-5 h-5 text-white animate-spin" />
              </div>
            ) : (
              <div className="absolute inset-0 rounded-full bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition-colors">
                <Camera className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={handlePhotoChange}
          />
          <span className="text-xs text-muted-foreground hover:text-foreground cursor-pointer transition-colors" onClick={handlePhotoClick}>
            Change Photo
          </span>

          {/* Name & Email */}
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground">{editName || "User"}</h2>
            <p className="text-sm text-muted-foreground">{email}</p>
          </div>
        </motion.div>

        {/* ── Grid: Info + Security ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ── 2. User Information Card ── */}
          <motion.div variants={itemVariants}>
            <Card className="border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-muted-foreground" />
                  User Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Name field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="Your name"
                    className="h-9 text-sm"
                  />
                </div>

                {/* Region field */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Region</label>
                  <Select value={editRegion} onValueChange={setEditRegion}>
                    <SelectTrigger className="w-full h-9 text-sm">
                      <SelectValue placeholder="Select region" />
                    </SelectTrigger>
                    <SelectContent>
                      {REGIONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  onClick={handleSaveProfile}
                  disabled={savingProfile}
                  className="w-full h-9 text-sm"
                >
                  {savingProfile ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Changes"
                  )}
                </Button>
              </CardContent>
            </Card>
          </motion.div>

          {/* ── 3. Security Card ── */}
          <motion.div variants={itemVariants}>
            <Card className="border-border">
              <CardHeader className="pb-4">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-muted-foreground" />
                  Security
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {/* Inline feedback alert */}
                {secMessage && (
                  <motion.div
                    initial={{ opacity: 0, y: -4, height: 0 }}
                    animate={{ opacity: 1, y: 0, height: "auto" }}
                    className={`flex items-center gap-2 p-2.5 rounded-lg text-xs ${
                      secMessage.type === "success"
                        ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800"
                        : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400 border border-red-200 dark:border-red-800"
                    }`}
                  >
                    {secMessage.type === "success" ? (
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    ) : (
                      <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    )}
                    <span>{secMessage.text}</span>
                  </motion.div>
                )}

                {/* Change Email */}
                <div className="space-y-2.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Mail className="w-3 h-3" />
                    Change Email
                  </label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="New email address"
                      className="h-9 text-sm flex-1"
                      onKeyDown={(e) => { if (e.key === "Enter") handleChangeEmail(); }}
                    />
                    <Button
                      onClick={handleChangeEmail}
                      disabled={secLoading === "email" || !newEmail.trim()}
                      variant="outline"
                      size="sm"
                      className="h-9 px-3 text-xs whitespace-nowrap"
                    >
                      {secLoading === "email" ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        "Update Email"
                      )}
                    </Button>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-border" />

                {/* Change Password */}
                <div className="space-y-2.5">
                  <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    <Lock className="w-3 h-3" />
                    Change Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showCurrentPwd ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Current password"
                      className="h-9 text-sm pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPwd(!showCurrentPwd)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showCurrentPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <div className="relative">
                    <Input
                      type={showNewPwd ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="New password"
                      className="h-9 text-sm pr-9"
                      onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPwd(!showNewPwd)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {showNewPwd ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                  <Button
                    onClick={handleChangePassword}
                    disabled={secLoading === "password" || !currentPassword || !newPassword}
                    variant="outline"
                    size="sm"
                    className="w-full h-9 text-xs"
                  >
                    {secLoading === "password" ? (
                      <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 mr-1.5" />
                    )}
                    Update Password
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* ── 4. Storage Monitor Card ── */}
        <motion.div variants={itemVariants}>
          <Card className="border-border">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-muted-foreground" />
                  Storage
                </CardTitle>
                {storageBadge()}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {storage ? (
                <>
                  {/* Progress bar */}
                  <div className="space-y-2">
                    <Progress
                      value={Math.min(storage.percentUsed, 100)}
                      className={`h-3 rounded-full ${storageColor()}`}
                    />
                    <p className="text-sm text-muted-foreground">
                      Using{" "}
                      <span className="font-medium text-foreground">
                        {storage.usedMB} MB
                      </span>{" "}
                      of{" "}
                      <span className="font-medium text-foreground">
                        {storage.limitGB} GB
                      </span>
                    </p>
                  </div>

                  {/* Stats row */}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1.5">
                      <CreditCard className="w-3 h-3" />
                      {storage.fileCount} file{storage.fileCount !== 1 ? "s" : ""} stored
                    </span>
                    <span>
                      {storage.percentUsed.toFixed(1)}% used
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Loading storage info...</span>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* ── 5. Plan History Section (Placeholder) ── */}
        <motion.div variants={itemVariants}>
          <Card className="border-border bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <History className="w-4 h-4 text-muted-foreground" />
                Plan History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">No plan changes yet.</p>
            </CardContent>
          </Card>
        </motion.div>

        {/* ── 6. Membership Plans Section (Placeholder) ── */}
        <motion.div variants={itemVariants}>
          <Card className="border-border">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-muted-foreground" />
                Membership Plans
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Free Plan */}
                <div className="relative rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
                  <Badge className="absolute -top-2.5 left-4 text-[10px]">Current</Badge>
                  <h3 className="text-sm font-bold text-foreground">Free</h3>
                  <p className="text-lg font-bold text-foreground">$0<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    {[
                      "1 GB storage",
                      "Basic PDF tools",
                      "Community support",
                    ].map((feat) => (
                      <li key={feat} className="flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Pro Plan */}
                <div className="relative rounded-xl border border-border p-4 space-y-3 opacity-80">
                  <Badge variant="secondary" className="absolute -top-2.5 left-4 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-0">Coming Soon</Badge>
                  <h3 className="text-sm font-bold text-foreground">Pro</h3>
                  <p className="text-lg font-bold text-foreground">$9<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    {[
                      "50 GB storage",
                      "Advanced AI tools",
                      "Priority support",
                    ].map((feat) => (
                      <li key={feat} className="flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Enterprise Plan */}
                <div className="relative rounded-xl border border-border p-4 space-y-3 opacity-80">
                  <Badge variant="secondary" className="absolute -top-2.5 left-4 text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400 border-0">Coming Soon</Badge>
                  <h3 className="text-sm font-bold text-foreground">Enterprise</h3>
                  <p className="text-lg font-bold text-foreground">Custom</p>
                  <ul className="space-y-2 text-xs text-muted-foreground">
                    {[
                      "Unlimited storage",
                      "All AI tools & API",
                      "Dedicated support",
                    ].map((feat) => (
                      <li key={feat} className="flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-muted-foreground/40 flex-shrink-0" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.section>
    </div>
  );
}
