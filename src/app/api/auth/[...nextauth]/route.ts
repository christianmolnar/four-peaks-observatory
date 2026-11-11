import type { NextRequest } from 'next/server'
import { handlers } from '@/auth'
import { authConfigured } from '@/lib/planner-auth/owners'

const off = () => new Response('Sign-in is not configured', { status: 503 })

export const GET = (req: NextRequest) => (authConfigured() ? handlers.GET(req) : off())
export const POST = (req: NextRequest) => (authConfigured() ? handlers.POST(req) : off())
