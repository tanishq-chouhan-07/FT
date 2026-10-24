import { NextRequest, NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type TreeRow = Database['public']['Tables']['tree']['Row']
type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']

export async function GET(_request: NextRequest) {
  console.log('\n[GET /api/tree-info] ───────────────────────')
  try {
    const supabase = await createServerClientInstance()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[GET /api/tree-info] user:', user?.email ?? 'null', '| authError:', authError?.message ?? 'none')

    if (authError || !user) {
      console.log('[GET /api/tree-info] → 401 Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: treeMembers, error: memberError } = await supabase.from('tree_member').select('tree_id, role').eq('user_id', user.id).limit(1) as { data: TreeMemberRow[] | null; error: any }
    const treeMember = (treeMembers as TreeMemberRow[] | null)?.[0] ?? null

    console.log('[GET /api/tree-info] treeMember:', JSON.stringify(treeMember), '| memberError:', memberError?.message ?? 'none')

    if (memberError || !treeMember) {
      console.log('[GET /api/tree-info] → 404 No tree found')
      return NextResponse.json({ error: 'No tree found for user' }, { status: 404 })
    }

    const { data: tree, error: treeError } = await supabase
      .from('tree')
      .select('*')
      .eq('id', treeMember.tree_id)
      .single() as { data: TreeRow | null; error: any }

    console.log('[GET /api/tree-info] tree:', tree?.id ?? 'null', tree?.name ?? '', '| treeError:', treeError?.message ?? 'none')
    console.log('────────────────────────────────────────────\n')

    if (treeError || !tree) {
      return NextResponse.json({ error: 'Tree not found' }, { status: 404 })
    }

    return NextResponse.json({ tree, treeMember })
  } catch (error) {
    console.error('[GET /api/tree-info] → 500', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClientInstance()

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's tree membership
    const { data: treeMembers, error: memberError } = await supabase.from('tree_member').select('tree_id, role').eq('user_id', user.id).limit(1) as { data: TreeMemberRow[] | null; error: any }
    const treeMember = (treeMembers as TreeMemberRow[] | null)?.[0] ?? null

    if (memberError || !treeMember) {
      return NextResponse.json({ error: 'No tree found for user' }, { status: 404 })
    }

    // Only owner can update tree settings
    if (treeMember.role !== 'owner') {
      return NextResponse.json({ error: 'Only tree owner can update settings' }, { status: 403 })
    }

    // Parse request body
    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    // Update tree
    const { data: updatedTree, error: updateError } = await (supabase.from('tree') as any)
      .update({
        name,
        updated_at: new Date().toISOString(),
      })
      .eq('id', treeMember.tree_id)
      .select()
      .single() as { data: TreeRow | null; error: any }

    if (updateError) {
      console.error('Error updating tree:', updateError)
      return NextResponse.json(
        { error: 'Failed to update tree' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      tree: updatedTree,
      treeMember,
    })
  } catch (error) {
    console.error('Error updating tree info:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
