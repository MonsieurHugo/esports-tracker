import { revalidatePath } from 'next/cache'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  // Get secret from Authorization header (more secure than query params)
  const authHeader = request.headers.get('Authorization')
  const secret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (!secret || secret !== process.env.REVALIDATION_SECRET) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
  }

  // Get path from request body instead of query params
  let path: string | null = null
  try {
    const body = await request.json()
    path = body.path
  } catch (_error) {
    // JSON parsing failed (empty body or invalid JSON)
    // Fallback to query params for backward compatibility
    const { searchParams } = new URL(request.url)
    path = searchParams.get('path')
  }

  if (!path) {
    return NextResponse.json({ message: 'Path is required' }, { status: 400 })
  }

  revalidatePath(path)

  return NextResponse.json({ revalidated: true, path })
}
