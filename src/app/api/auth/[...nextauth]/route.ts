import { handlers } from '@/auth'
import { authConfigured } from '@/lib/planner-auth/owners'

const off = () => new Response('Sign-in is not configured', { status: 503 })

export const GET = (req: Request) => (authConfigured() ? handlers.GET(req as never) : off())
export const POST = (req: Request) => (authConfigured() ? handlers.POST(req as never) : off())
