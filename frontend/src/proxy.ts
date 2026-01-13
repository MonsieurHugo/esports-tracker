import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function proxy(request: NextRequest) {
  // Check if the route is protected (admin routes)
  if (request.nextUrl.pathname.startsWith('/admin')) {
    // Check for session cookie from AdonisJS
    // The session cookie name depends on your AdonisJS config (default is 'adonis-session')
    const sessionCookie = request.cookies.get('adonis-session')

    if (!sessionCookie) {
      // No session, redirect to login
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', request.nextUrl.pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Session exists, let the request continue
    // The actual role check will be done by the backend API
    return NextResponse.next()
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path*'],
}
