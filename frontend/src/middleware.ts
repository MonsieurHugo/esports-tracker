import createMiddleware from 'next-intl/middleware'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { routing } from './i18n/routing'

const intlMiddleware = createMiddleware(routing)

export default function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Check if the route is protected (admin routes)
  if (pathname.startsWith('/admin') || pathname.match(/^\/[a-z]{2}\/admin/)) {
    // Check for session cookie from AdonisJS
    const sessionCookie = request.cookies.get('adonis-session')

    if (!sessionCookie) {
      // No session, redirect to login
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  // Handle i18n routing for all other paths
  return intlMiddleware(request)
}

export const config = {
  // Match all pathnames except for:
  // - API routes (/api/...)
  // - Static files (_next, images, etc.)
  // - Specific file extensions
  matcher: ['/((?!api|_next|.*\\..*).*)'],
}
