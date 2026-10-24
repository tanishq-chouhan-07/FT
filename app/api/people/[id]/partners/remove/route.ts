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
    const { partnerId } = body

    if (!partnerId) {
      return NextResponse.json({ error: 'partnerId is required' }, { status: 400 })
    }

    // Delete the partnership (could be in either direction)
    const { error: deleteError } = await supabase
      .from('partnership')
      .delete()
      .or(
        `and(partner1_id.eq.${params.id},partner2_id.eq.${partnerId}),and(partner1_id.eq.${partnerId},partner2_id.eq.${params.id})`
      )
      .eq('tree_id', member.tree_id)

    if (deleteError) {
      console.error('Error deleting partnership:', deleteError)
      return NextResponse.json(
        { error: 'Failed to delete partnership' },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: 'Partnership removed' })
  } catch (error) {
    console.error('Error removing partner:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
