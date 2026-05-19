import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that never require auth
  const isPublic =
    pathname === "/login" ||
    pathname.startsWith("/book") ||
    pathname.startsWith("/api/");

  // Redirect bare root to dashboard
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Build a mutable response so cookie mutations are forwarded
  let response = NextResponse.next({ request });

  // Refresh the Supabase session on every request.
  // This is required by @supabase/ssr — without it the server-side client
  // sees a stale or missing session even after a successful browser login.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies into both the request (for downstream) and the response
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser() refreshes the session token if expired.
  // Do NOT use getSession() here — it trusts the client JWT and won't refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Redirect unauthenticated visitors away from protected pages
  if (!user && !isPublic) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect already-authenticated visitors away from the login page
  if (user && pathname === "/login") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|css|js)$).*)",
  ],
};
