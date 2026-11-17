import { fail, noStore } from '@/planner/ai/refusal'
import { readFromLibrary } from '@/planner/library/service'
import { LibraryDataError } from '@/planner/library/specs'
import { LibraryStoreError, getLibraryStore } from '@/planner/library/store'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Open to everyone (guests and the owner): reading never calls a model and spends nothing.
// A library that cannot be reached reads as "not in the library" with a plain message, so the Gear form still works by hand.
export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams
  try {
    const entry = await readFromLibrary(getLibraryStore(), q.get('cls'), q.get('name'))
    return Response.json({ entry }, { headers: noStore })
  } catch (e) {
    if (e instanceof LibraryStoreError) return Response.json({ entry: null, message: 'The spec library is unavailable right now. Enter the values yourself.' }, { headers: noStore })
    if (e instanceof LibraryDataError) return fail(400, e.message)
    throw e
  }
}
