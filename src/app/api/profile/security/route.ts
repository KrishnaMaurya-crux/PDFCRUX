import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// POST /api/profile/security — change email or password
export async function POST(request: Request) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { action, newEmail, currentPassword, newPassword } = body;

    if (action === "change-email") {
      if (!newEmail) {
        return NextResponse.json({ error: "New email is required" }, { status: 400 });
      }
      const { error } = await supabase.auth.updateUser({ email: newEmail });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ message: "Confirmation email sent to your new address. Please verify." });
    }

    if (action === "change-password") {
      if (!currentPassword || !newPassword) {
        return NextResponse.json({ error: "Current and new password are required" }, { status: 400 });
      }
      if (newPassword.length < 6) {
        return NextResponse.json({ error: "New password must be at least 6 characters" }, { status: 400 });
      }
      // Verify current password by signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email!,
        password: currentPassword,
      });
      if (signInError) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 400 });
      }
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ message: "Password updated successfully" });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
