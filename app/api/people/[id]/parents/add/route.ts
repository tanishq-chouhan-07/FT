import { NextRequest, NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import { getPersonById } from '@/lib/db/queries'
import type { Database } from '@/types/database'

type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']
type ParentChildInsert = Database['public']['Tables']['parent_child']['Insert']

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
    const { parentId, relationshipType } = body

    if (!parentId) {
      return NextResponse.json({ error: 'parentId is required' }, { status: 400 })
    }

    // Verify both people exist and belong to user's tree
    const [child, parent] = await Promise.all([
      getPersonById(supabase, member.tree_id, params.id),
      getPersonById(supabase, member.tree_id, parentId),
    ])

    if (!child || !parent) {
      return NextResponse.json({ error: 'One or both people not found' }, { status: 404 })
    }

    // Check maximum 2 parents
    const { data: existingParents, error: fetchError } = await supabase
      .from('parent_child')
      .select('id')
      .eq('child_id', params.id)
      .eq('tree_id', member.tree_id)

    if (fetchError) {
      throw fetchError
    }

    if ((existingParents || []).length >= 2) {
      return NextResponse.json(
        { error: 'Maximum 2 parents allowed' },
        { status: 400 }
      )
    }

    // Check if relationship already exists
    const { data: existing } = await supabase
      .from('parent_child')
      .select('id')
      .eq('parent_id', parentId)
      .eq('child_id', params.id)
      .eq('tree_id', member.tree_id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'This parent-child relationship already exists' },
        { status: 409 }
      )
    }

    // Create relationship
    const relationshipData: ParentChildInsert = {
      tree_id: member.tree_id,
      parent_id: parentId,
      child_id: params.id,
      relationship_type: relationshipType || 'biological',
    }

    const { data: newRelationship, error: createError } = await (supabase.from('parent_child') as any)
      .insert([relationshipData])
      .select()
      .single() as { data: any; error: any }

    if (createError) {
      console.error('Error creating parent relationship:', createError)
      return NextResponse.json(
        { error: 'Failed to create parent relationship' },
        { status: 500 }
      )
    }

    return NextResponse.json(newRelationship, { status: 201 })
  } catch (error) {
    console.error('Error adding parent:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
