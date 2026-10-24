import { NextRequest, NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import { getPeopleByTree } from '@/lib/db/queries'
import { validatePersonInput } from '@/lib/validators/person'
import type { Database } from '@/types/database'

type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']
type PersonInsert = Database['public']['Tables']['person']['Insert']
type PersonRow = Database['public']['Tables']['person']['Row']

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  console.log('\n[GET /api/people] ─────────────────────────')
  try {
    const supabase = await createServerClientInstance()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[GET /api/people] user:', user?.email ?? 'null', '| authError:', authError?.message ?? 'none')

    if (authError || !user) {
      console.log('[GET /api/people] → 401 Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: treeMembers, error: treeError } = await supabase.from('tree_member').select('tree_id').eq('user_id', user.id).limit(1) as { data: TreeMemberRow[] | null; error: any }
    const treeMember = (treeMembers as TreeMemberRow[] | null)?.[0] ?? null

    console.log('[GET /api/people] treeMember:', treeMember?.tree_id ?? 'null', '| treeError:', treeError?.message ?? 'none')

    if (treeError || !treeMember) {
      console.log('[GET /api/people] → 404 No tree found')
      return NextResponse.json({ error: 'No tree found for user' }, { status: 404 })
    }

    const treeId = treeMember.tree_id
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search') || undefined
    const gender = searchParams.get('gender') || undefined
    const isAlive = searchParams.get('isAlive') ? searchParams.get('isAlive') === 'true' : undefined
    const city = searchParams.get('city') || undefined
    const country = searchParams.get('country') || undefined

    console.log('[GET /api/people] filters:', { search, gender, isAlive, city, country })

    const people = await getPeopleByTree(supabase, treeId, { search, gender, isAlive, city, country })
    console.log('[GET /api/people] → 200 returned', people.length, 'people')
    console.log('────────────────────────────────────────────\n')

    return NextResponse.json(people)
  } catch (error) {
    console.error('[GET /api/people] → 500', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  console.log('\n[POST /api/people] ────────────────────────')
  try {
    const supabase = await createServerClientInstance()
    
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    console.log('[POST /api/people] user:', user?.email ?? 'null', '| authError:', authError?.message ?? 'none')

    if (authError || !user) {
      console.log('[POST /api/people] → 401 Unauthorized')
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: treeMembers, error: treeError } = await supabase.from('tree_member').select('tree_id, role').eq('user_id', user.id).limit(1) as { data: TreeMemberRow[] | null; error: any }
    const treeMember = (treeMembers as TreeMemberRow[] | null)?.[0] ?? null

    console.log('[POST /api/people] treeMember:', JSON.stringify(treeMember), '| treeError:', treeError?.message ?? 'none')

    if (treeError || !treeMember) {
      return NextResponse.json({ error: 'No tree found for user' }, { status: 404 })
    }

    const member = treeMember

    // Check permissions (editor or owner)
    if (!['editor', 'owner'].includes(member.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    // Parse and validate input
    const body = await request.json()
    const validation = validatePersonInput(body)
    
    if (!validation.valid) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 })
    }

    // Check for duplicate names
    if (body.checkDuplicates !== false) {
      const existingPeople = await getPeopleByTree(supabase, member.tree_id, {
        search: body.fullName,
      })
      
      const exactMatch = existingPeople.find(p => 
        p.full_name.toLowerCase() === body.fullName.toLowerCase()
      )
      
      if (exactMatch) {
        return NextResponse.json({ 
          error: 'Duplicate name', 
          message: `A person named "${body.fullName}" already exists in your tree` 
        }, { status: 409 })
      }
    }

    // Create person
    const personData: PersonInsert = {
      tree_id: member.tree_id,
      full_name: body.fullName,
      gender: body.gender || null,
      birth_date: body.birthDate || null,
      death_date: body.deathDate || null,
      is_alive: body.isAlive ?? true,
      city: body.city || null,
      country: body.country || null,
      notes: body.notes || null,
    }

    const { data: newPerson, error: createError } = await (supabase.from('person') as any)
      .insert([personData])
      .select()
      .single() as { data: PersonRow | null; error: any }

    if (createError || !newPerson) {
      console.error('Error creating person:', createError)
      return NextResponse.json({ error: 'Failed to create person' }, { status: 500 })
    }

    const createdPerson = newPerson

    // Create parent relationships if specified
    if (body.parents && body.parents.length > 0) {
      if (body.parents.length > 2) {
        return NextResponse.json({ error: 'Maximum 2 parents allowed' }, { status: 400 })
      }

      const parentRelationships = body.parents.map((parent: any) => ({
        tree_id: member.tree_id,
        parent_id: parent.personId,
        child_id: createdPerson.id,
        relationship_type: parent.relationshipType,
      }))

      const { error: relationshipError } = await supabase
        .from('parent_child')
        .insert(parentRelationships)

      if (relationshipError) {
        // If parent relationship fails, we could delete the person or just log the error
        console.error('Error creating parent relationships:', relationshipError)
      }
    }

    return NextResponse.json(createdPerson, { status: 201 })
  } catch (error) {
    console.error('Error creating person:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
