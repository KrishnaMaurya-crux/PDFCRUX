import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";

// GET /api/profile — fetch or create user profile
export async function GET() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Find or create local user + profile
    let localUser = await db.user.findUnique({ where: { email: user.email! } });
    if (!localUser) {
      localUser = await db.user.create({
        data: {
          email: user.email!,
          name: user.user_metadata?.full_name || user.email!.split("@")[0],
          profile: { create: {} },
        },
        include: { profile: true },
      });
    }

    let profile = await db.userProfile.findUnique({ where: { userId: localUser.id } });
    if (!profile) {
      profile = await db.userProfile.create({ data: { userId: localUser.id } });
    }

    return NextResponse.json({
      profile,
      email: user.email,
      name: profile.name || localUser.name || user.user_metadata?.full_name,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/profile — update name / region
export async function PATCH(request: Request) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { name, region } = body;

    let localUser = await db.user.findUnique({ where: { email: user.email! } });
    if (!localUser) {
      localUser = await db.user.create({
        data: {
          email: user.email!,
          name: user.user_metadata?.full_name || user.email!.split("@")[0],
          profile: { create: {} },
        },
      });
    }

    // Ensure profile exists
    const existingProfile = await db.userProfile.findUnique({ where: { userId: localUser.id } });
    if (!existingProfile) {
      await db.userProfile.create({ data: { userId: localUser.id } });
    }

    const updatedProfile = await db.userProfile.update({
      where: { userId: localUser.id },
      data: {
        ...(name !== undefined && { name }),
        ...(region !== undefined && { region }),
      },
    });

    return NextResponse.json({ profile: updatedProfile, message: "Profile updated" });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
