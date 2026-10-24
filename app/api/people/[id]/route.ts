import { NextRequest, NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import { getPersonById } from '@/lib/db/queries'
import { validatePersonInput } from '@/lib/validators/person'
import type { Database } from '@/types/database'

type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']
type PersonRow = Database['public']['Tables']['person']['Row']

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

    // Fetch person
    const person = await getPersonById(supabase, member.tree_id, params.id)
    
    return NextResponse.json(person)
  } catch (error) {
    console.error('Error fetching person:', error)
    return NextResponse.json({ error: 'Person not found' }, { status: 404 })
  }
}

export async function PATCH(
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

    // Verify person exists and belongs to user's tree
    try {
      await getPersonById(supabase, member.tree_id, params.id)
    } catch {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 })
    }

    // Parse and validate input
    const body = await request.json()
    const validation = validatePersonInput(body)
    
    if (!validation.valid) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 })
    }

    // Update person
    const updateData = {
      full_name: body.fullName,
      gender: body.gender || null,
      birth_date: body.birthDate || null,
      death_date: body.deathDate || null,
      is_alive: body.isAlive ?? true,
      city: body.city || null,
      country: body.country || null,
      notes: body.notes || null,
      updated_at: new Date().toISOString(),
    }

    const { data: updatedPerson, error: updateError } = await (supabase.from('person') as any)
      .update(updateData)
      .eq('id', params.id)
      .eq('tree_id', member.tree_id)
      .select()
      .single() as { data: PersonRow | null; error: any }

    if (updateError || !updatedPerson) {
      console.error('Error updating person:', updateError)
      return NextResponse.json({ error: 'Failed to update person' }, { status: 500 })
    }

    const updated = updatedPerson

    return NextResponse.json(updated)
  } catch (error) {
    console.error('Error updating person:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
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

    // Check for existing relationships
    const [parentRelations, childRelations, partnerships] = await Promise.all([
      supabase.from('parent_child').select('id').eq('parent_id', params.id).eq('tree_id', member.tree_id),
      supabase.from('parent_child').select('id').eq('child_id', params.id).eq('tree_id', member.tree_id),
      supabase.from('partnership').select('id').or(`partner1_id.eq.${params.id},partner2_id.eq.${params.id}`).eq('tree_id', member.tree_id)
    ])

    if (parentRelations.data?.length || childRelations.data?.length || partnerships.data?.length) {
      return NextResponse.json({ 
        error: 'Cannot delete person with existing relationships',
        message: 'Please remove all relationships before deleting this person'
      }, { status: 409 })
    }

    // Delete person
    const { error: deleteError } = await supabase
      .from('person')
      .delete()
      .eq('id', params.id)
      .eq('tree_id', member.tree_id)

    if (deleteError) {
      console.error('Error deleting person:', deleteError)
      return NextResponse.json({ error: 'Failed to delete person' }, { status: 500 })
    }

    return NextResponse.json({ message: 'Person deleted successfully' })
  } catch (error) {
    console.error('Error deleting person:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}