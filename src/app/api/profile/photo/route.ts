import { NextResponse } from "next/server";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import r2Client, { R2_BUCKET } from "@/lib/r2";
import { db } from "@/lib/db";
import { supabase } from "@/lib/supabase";

// POST /api/profile/photo — upload profile photo to R2
export async function POST(request: Request) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    let localUser = await db.user.findUnique({ where: { email: user.email! } });
    if (!localUser) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("photo") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    // Validate file
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ error: "Only JPEG, PNG, WebP, and GIF images are allowed" }, { status: 400 });
    }
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 5 MB" }, { status: 400 });
    }

    // Delete old avatar from R2 if exists
    const profile = await db.userProfile.findUnique({ where: { userId: localUser.id } });
    if (profile?.avatarUrl) {
      const oldKey = profile.avatarUrl.split("/").pop();
      if (oldKey) {
        try {
          await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: `avatars/${oldKey}` }));
        } catch {
          // Ignore delete errors — old file may not exist
        }
      }
    }

    // Upload new avatar to R2
    const key = `avatars/${localUser.id}-${Date.now()}.${file.name.split(".").pop()}`;
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    await r2Client.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: file.type,
      })
    );

    // Build public URL (R2 custom domain or endpoint)
    const avatarUrl = `${process.env.R2_ENDPOINT || "https://2beb4648c40f93b6323696b625b92066.r2.cloudflarestorage.com"}/${R2_BUCKET}/${key}`;

    // Save to database
    const updatedProfile = await db.userProfile.upsert({
      where: { userId: localUser.id },
      create: { userId: localUser.id, avatarUrl },
      update: { avatarUrl },
    });

    return NextResponse.json({
      profile: updatedProfile,
      avatarUrl,
      message: "Photo updated",
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
