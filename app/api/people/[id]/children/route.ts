import { NextRequest, NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import { getChildrenByParent } from '@/lib/db/queries'
import type { Database } from '@/types/database'

type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClientInstance()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tree
    const { data: treeMembers, error: treeError } = await supabase.from('tree_member').select('tree_id').eq('user_id', user.id).limit(1) as { data: TreeMemberRow[] | null; error: any }
    const treeMember = (treeMembers as TreeMemberRow[] | null)?.[0] ?? null

    if (treeError || !treeMember) {
      return NextResponse.json({ error: 'No tree found for user' }, { status: 404 })
    }

    const member = treeMember

    // Fetch children
    const children = await getChildrenByParent(supabase, member.tree_id, params.id)

    return NextResponse.json(children)
  } catch (error) {
    console.error('Error fetching children:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
