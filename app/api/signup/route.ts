import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase-server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export async function POST(request: NextRequest) {
  // 1. Verify the caller is authenticated — checks their JWT server-side
  const supabase = createSupabaseServer();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse and validate input
  let salonName: string, fullName: string;
  try {
    ({ salonName, fullName } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!salonName?.trim() || !fullName?.trim()) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // 3. Use admin client (service role) to write records — bypasses RLS safely
  //    because we already verified the user's identity above.
  const admin = createSupabaseAdmin();

  const slug = salonName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");

  const { data: salon, error: salonError } = await admin
    .from("salons")
    .insert({ name: salonName.trim(), booking_slug: slug })
    .select("id")
    .single();

  if (salonError) {
    return NextResponse.json(
      {
        error: salonError.message.toLowerCase().includes("unique")
          ? "That salon name is already taken. Try adding your city (e.g. Pastel 93 Colombo)."
          : "Could not create your salon profile. Please try again.",
      },
      { status: 400 },
    );
  }

  const { error: linkError } = await admin
    .from("salon_users")
    .insert({ user_id: user.id, salon_id: salon.id, full_name: fullName.trim() });

  if (linkError) {
    // Roll back the salon row so we don't leave orphaned records
    await admin.from("salons").delete().eq("id", salon.id);
    return NextResponse.json(
      { error: "Could not link your account to the salon. Please try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
