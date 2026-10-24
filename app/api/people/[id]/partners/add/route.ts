import { NextRequest, NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import { getPersonById } from '@/lib/db/queries'
import type { Database } from '@/types/database'

type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']
type PartnershipInsert = Database['public']['Tables']['partnership']['Insert']

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
    const { partnerId, startDate, endDate } = body

    if (!partnerId) {
      return NextResponse.json({ error: 'partnerId is required' }, { status: 400 })
    }

    if (params.id === partnerId) {
      return NextResponse.json(
        { error: 'Cannot add partnership with same person' },
        { status: 400 }
      )
    }

    // Verify both people exist and belong to user's tree
    const [person, partner] = await Promise.all([
      getPersonById(supabase, member.tree_id, params.id),
      getPersonById(supabase, member.tree_id, partnerId),
    ])

    if (!person || !partner) {
      return NextResponse.json({ error: 'One or both people not found' }, { status: 404 })
    }

    // Check if partnership already exists (either direction)
    const { data: existing } = await supabase
      .from('partnership')
      .select('id')
      .or(
        `and(partner1_id.eq.${params.id},partner2_id.eq.${partnerId}),and(partner1_id.eq.${partnerId},partner2_id.eq.${params.id})`
      )
      .eq('tree_id', member.tree_id)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'This partnership already exists' },
        { status: 409 }
      )
    }

    // Create partnership (store with smaller ID first)
    const [partner1Id, partner2Id] = [params.id, partnerId].sort()

    const partnershipData: PartnershipInsert = {
      tree_id: member.tree_id,
      partner1_id: partner1Id,
      partner2_id: partner2Id,
      start_date: startDate || null,
      end_date: endDate || null,
    }

    const { data: newPartnership, error: createError } = await (supabase.from('partnership') as any)
      .insert([partnershipData])
      .select()
      .single() as { data: any; error: any }

    if (createError) {
      console.error('Error creating partnership:', createError)
      return NextResponse.json(
        { error: 'Failed to create partnership' },
        { status: 500 }
      )
    }

    return NextResponse.json(newPartnership, { status: 201 })
  } catch (error) {
    console.error('Error adding partner:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
