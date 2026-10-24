import { NextRequest, NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import {
  getPeopleByTree,
  getAllParentChildRelationships,
  getAllPartnerships,
} from '@/lib/db/queries'
import { buildFamilyGraph, computeRelationship } from '@/lib/relationships/calculator'
import type { Database } from '@/types/database'
import type { Person } from '@/types/person'

type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']
type PersonRow = Database['public']['Tables']['person']['Row']

function dbPersonToDomain(p: PersonRow): Person {
  return {
    id: p.id,
    treeId: p.tree_id,
    fullName: p.full_name,
    gender: p.gender as Person['gender'],
    birthDate: p.birth_date ? new Date(p.birth_date) : null,
    deathDate: p.death_date ? new Date(p.death_date) : null,
    isAlive: p.is_alive,
    city: p.city,
    country: p.country,
    notes: p.notes,
    createdAt: new Date(p.created_at),
    updatedAt: new Date(p.updated_at),
  }
}

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClientInstance()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: treeMembers, error: treeError } = await supabase.from('tree_member').select('tree_id').eq('user_id', user.id).limit(1) as { data: TreeMemberRow[] | null; error: any }
    const treeMember = (treeMembers as TreeMemberRow[] | null)?.[0] ?? null

    if (treeError || !treeMember) {
      return NextResponse.json({ error: 'No tree found for user' }, { status: 404 })
    }

    const body = await request.json()
    const { person1Id, person2Id } = body

    if (!person1Id || !person2Id) {
      return NextResponse.json({ error: 'person1Id and person2Id are required' }, { status: 400 })
    }

    const [rawPeople, parentChild, partnerships] = await Promise.all([
      getPeopleByTree(supabase, treeMember.tree_id),
      getAllParentChildRelationships(supabase, treeMember.tree_id),
      getAllPartnerships(supabase, treeMember.tree_id),
    ])

    const people = rawPeople.map(dbPersonToDomain)
    const graph = buildFamilyGraph(people, parentChild, partnerships)

    const person1 = people.find(p => p.id === person1Id)
    const person2 = people.find(p => p.id === person2Id)

    if (!person1 || !person2) {
      return NextResponse.json({ error: 'One or both people not found' }, { status: 404 })
    }

    const result = computeRelationship(person1Id, person2Id, graph)

    return NextResponse.json({
      relationship: result.label,
      type: result.type,
      distance: result.distance,
      person1: { id: person1.id, name: person1.fullName },
      person2: { id: person2.id, name: person2.fullName },
    })
  } catch (error) {
    console.error('Error analyzing relationship:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
