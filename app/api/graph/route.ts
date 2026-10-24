import { NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import {
  getPeopleByTree,
  getAllParentChildRelationships,
  getAllPartnerships,
} from '@/lib/db/queries'
import type { Database } from '@/types/database'

type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']

export const dynamic = 'force-dynamic'

export async function GET() {
  console.log('\n[GET /api/graph] ───────────────────────────')
  try {
    const supabase = await createServerClientInstance()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[GET /api/graph] user:', user?.email ?? 'null', '| authError:', authError?.message ?? 'none')

    if (authError || !user) {
      console.log('[GET /api/graph] → 401 Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: treeMembers, error: treeError } = await supabase.from('tree_member').select('tree_id').eq('user_id', user.id).limit(1) as { data: TreeMemberRow[] | null; error: any }
    const treeMember = (treeMembers as TreeMemberRow[] | null)?.[0] ?? null

    console.log('[GET /api/graph] treeMember:', treeMember?.tree_id ?? 'null', '| treeError:', treeError?.message ?? 'none')

    if (treeError || !treeMember) {
      console.log('[GET /api/graph] → 404 No tree found')
      return NextResponse.json({ error: 'No tree found' }, { status: 404 })
    }

    const treeId = treeMember.tree_id

    const [people, parentChild, partnerships] = await Promise.all([
      getPeopleByTree(supabase, treeId),
      getAllParentChildRelationships(supabase, treeId),
      getAllPartnerships(supabase, treeId),
    ])

    console.log('[GET /api/graph] → 200 |', people.length, 'people |', parentChild.length, 'relations |', partnerships.length, 'partnerships')
    console.log('────────────────────────────────────────────\n')

    return NextResponse.json({ people, parentChild, partnerships })
  } catch (error) {
    console.error('[GET /api/graph] → 500', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
