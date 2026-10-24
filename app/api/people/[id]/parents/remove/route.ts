import { NextRequest, NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createServerClientInstance()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tree and role
    const { data: treeMembers, error: treeError } = await supabase.from('tree_member').select('tree_id, role').eq('user_id', user.id).limit(1) as { data: TreeMemberRow[] | null; error: any }
    const treeMember = (treeMembers as TreeMemberRow[] | null)?.[0] ?? null

    if (treeError || !treeMember) {
      return NextResponse.json({ error: 'No tree found for user' }, { status: 404 })
    }

    const member = treeMember

    // Check permissions
    if (!['editor', 'owner'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { parentId } = body

    if (!parentId) {
      return NextResponse.json({ error: 'parentId is required' }, { status: 400 })
    }

    // Delete the relationship
    const { error: deleteError } = await supabase
      .from('parent_child')
      .delete()
      .eq('parent_id', parentId)
      .eq('child_id', params.id)
      .eq('tree_id', member.tree_id)

    if (deleteError) {
      console.error('Error deleting parent relationship:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete parent relationship' },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: 'Parent relationship removed' })
  } catch (error) {
    console.error('Error removing parent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
