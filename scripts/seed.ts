#!/usr/bin/env tsx
/**
 * Seed script for test data
 * Usage: npx tsx scripts/seed.ts
 */

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing environment variables:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL')
  console.error('   SUPABASE_SERVICE_ROLE_KEY')
  console.error('\nPlease create .env.local with your Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

// Test data
const TEST_TREE_BASE = {
  name: 'Test Family',
  description: 'A sample family tree for testing the application',
}

const TEST_PEOPLE = [
  // Generation 1: Grandparents
  {
    full_name: 'John Smith',
    gender: 'Male' as const,
    birth_date: '1940-01-15',
    death_date: '2010-03-20',
    is_alive: false,
    city: 'New York',
    country: 'USA',
    notes: 'Retired teacher, loved history',
  },
  {
    full_name: 'Mary Smith',
    gender: 'Female' as const,
    birth_date: '1942-05-22',
    death_date: null,
    is_alive: true,
    city: 'Boston',
    country: 'USA',
    notes: 'Loves gardening and cooking',
  },
  
  // Generation 2: Parents
  {
    full_name: 'Robert Smith',
    gender: 'Male' as const,
    birth_date: '1965-08-10',
    death_date: null,
    is_alive: true,
    city: 'Chicago',
    country: 'USA',
    notes: 'Software developer',
  },
  {
    full_name: 'Lisa Johnson',
    gender: 'Female' as const,
    birth_date: '1968-11-30',
    death_date: null,
    is_alive: true,
    city: 'Chicago',
    country: 'USA',
    notes: 'Pediatrician',
  },
  
  // Generation 3: User and sibling
  {
    full_name: 'Michael Smith',
    gender: 'Male' as const,
    birth_date: '1990-04-12',
    death_date: null,
    is_alive: true,
    city: 'Seattle',
    country: 'USA',
    notes: 'Software engineer',
  },
  {
    full_name: 'Sarah Smith',
    gender: 'Female' as const,
    birth_date: '1992-07-25',
    death_date: null,
    is_alive: true,
    city: 'Denver',
    country: 'USA',
    notes: 'UX Designer',
  },
  
  // Generation 4: Children
  {
    full_name: 'Emma Smith',
    gender: 'Female' as const,
    birth_date: '2020-02-14',
    death_date: null,
    is_alive: true,
    city: 'Seattle',
    country: 'USA',
    notes: 'Toddler',
  },
  {
    full_name: 'James Smith',
    gender: 'Male' as const,
    birth_date: '2022-06-01',
    death_date: null,
    is_alive: true,
    city: 'Seattle',
    country: 'USA',
    notes: 'Baby',
  },
  
  // Extended family
  {
    full_name: 'William Smith',
    gender: 'Male' as const,
    birth_date: '1970-03-18',
    death_date: null,
    is_alive: true,
    city: 'Austin',
    country: 'USA',
    notes: 'Lawyer',
  },
  {
    full_name: 'Jennifer Williams',
    gender: 'Female' as const,
    birth_date: '1975-09-05',
    death_date: null,
    is_alive: true,
    city: 'Miami',
    country: 'USA',
    notes: 'Artist',
  },
]

const PARENT_CHILD_RELATIONSHIPS = [
  // Grandparents -> Parents
  { parent: 'John Smith', child: 'Robert Smith', type: 'biological' },
  { parent: 'Mary Smith', child: 'Robert Smith', type: 'biological' },
  { parent: 'John Smith', child: 'Lisa Johnson', type: 'biological' },
  { parent: 'Mary Smith', child: 'Lisa Johnson', type: 'biological' },
  
  // Parents -> Children
  { parent: 'Robert Smith', child: 'Michael Smith', type: 'biological' },
  { parent: 'Robert Smith', child: 'Sarah Smith', type: 'biological' },
  { parent: 'Lisa Johnson', child: 'Michael Smith', type: 'biological' },
  { parent: 'Lisa Johnson', child: 'Sarah Smith', type: 'biological' },
  
  // Michael -> Children
  { parent: 'Michael Smith', child: 'Emma Smith', type: 'biological' },
  { parent: 'Michael Smith', child: 'James Smith', type: 'biological' },
  { parent: 'Sarah Smith', child: 'Emma Smith', type: 'biological' },
  { parent: 'Sarah Smith', child: 'James Smith', type: 'biological' },
  
  // Robert's siblings
  { parent: 'Robert Smith', child: 'William Smith', type: 'biological' },
  { parent: 'Robert Smith', child: 'Jennifer Williams', type: 'biological' },
]

const PARTNERSHIPS = [
  { person: 'John Smith', partner: 'Mary Smith', type: 'marriage' },
  { person: 'Robert Smith', partner: 'Lisa Johnson', type: 'marriage' },
  { person: 'Michael Smith', partner: 'Sarah Smith', type: 'marriage' },
]

async function getPersonByName(supabase: any, treeId: string, name: string): Promise<string | null> {
  const { data } = await supabase
    .from('person')
    .select('id')
    .eq('tree_id', treeId)
    .eq('full_name', name)
    .single()
  
  return data?.id || null
}

async function seedDatabase() {
  console.log('🚀 Starting database seeding...\n')

  // Get current user
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    console.error('❌ Error: No authenticated user found')
    console.error('   Please run: npx supabase login')
    process.exit(1)
  }

  console.log(`👤 Authenticated as: ${user.email}\n`)

  // Check if user already has a tree
  const { data: existingTrees } = await supabase
    .from('tree')
    .select('id, name')
    .eq('created_by', user.id)
    .limit(1)

  if (existingTrees && existingTrees.length > 0) {
    console.log(`⚠️  User already has a tree: ${existingTrees[0].name}`)
    console.log('   Skipping seed to avoid duplicates.')
    console.log('\nTo reset and re-seed, first delete your tree:')
    console.log(`   Delete tree: ${existingTrees[0].id}`)
    return
  }

  // Create a new tree
  console.log('📝 Creating new tree...')
  const TEST_TREE = { ...TEST_TREE_BASE, created_by: user.id }
  const { data: tree, error: treeError } = await supabase
    .from('tree')
    .insert([TEST_TREE])
    .select()
    .single()

  if (treeError) {
    console.error('❌ Error creating tree:', treeError.message)
    process.exit(1)
  }

  console.log(`   ✓ Created tree: ${tree.name} (ID: ${tree.id})\n`)

  // Create tree member relationship
  console.log('👥 Creating tree membership...')
  const { error: memberError } = await supabase
    .from('tree_member')
    .insert([{
      tree_id: tree.id,
      user_id: user.id,
      role: 'owner',
    }])

  if (memberError) {
    console.error('❌ Error creating membership:', memberError.message)
    process.exit(1)
  }

  console.log('   ✓ Created tree membership\n')

  // Insert people
  console.log('👤 Inserting people...')
  const personInserts = TEST_PEOPLE.map(person => ({
    ...person,
    tree_id: tree.id,
  }))

  const { data: people, error: peopleError } = await supabase
    .from('person')
    .insert(personInserts)
    .select()

  if (peopleError) {
    console.error('❌ Error inserting people:', peopleError.message)
    process.exit(1)
  }

  console.log(`   ✓ Inserted ${people.length} people\n`)

  // Create parent-child relationships
  console.log('🔗 Creating parent-child relationships...')
  for (const rel of PARENT_CHILD_RELATIONSHIPS) {
    const parentId = await getPersonByName(supabase, tree.id, rel.parent)
    const childId = await getPersonByName(supabase, tree.id, rel.child)

    if (parentId && childId) {
      const { error: relError } = await supabase
        .from('parent_child')
        .insert([{
          tree_id: tree.id,
          parent_id: parentId,
          child_id: childId,
          relationship_type: rel.type,
        }])

      if (relError) {
        console.warn(`   ⚠️  Could not create relationship: ${rel.parent} → ${rel.child}`)
      }
    }
  }

  console.log(`   ✓ Created ${PARENT_CHILD_RELATIONSHIPS.length} parent-child relationships\n`)

  // Create partnerships
  console.log('💍 Creating partnerships...')
  for (const p of PARTNERSHIPS) {
    const personId = await getPersonByName(supabase, tree.id, p.person)
    const partnerId = await getPersonByName(supabase, tree.id, p.partner)

    if (personId && partnerId) {
      const [partner1_id, partner2_id] = [personId, partnerId].sort()
      const { error: partnershipError } = await supabase
        .from('partnership')
        .insert([{
          tree_id: tree.id,
          partner1_id,
          partner2_id,
          start_date: new Date().toISOString().split('T')[0], // Today
        }])

      if (partnershipError) {
        console.warn(`   ⚠️  Could not create partnership: ${p.person} ↔ ${p.partner}`)
      }
    }
  }

  console.log(`   ✓ Created ${PARTNERSHIPS.length} partnerships\n`)

  // Summary
  console.log('✅ Database seeded successfully!')
  console.log('\n📊 Summary:')
  console.log(`   Tree: ${tree.name}`)
  console.log(`   People: ${people.length}`)
  console.log(`   Parent-child relationships: ${PARENT_CHILD_RELATIONSHIPS.length}`)
  console.log(`   Partnerships: ${PARTNERSHIPS.length}`)
  console.log('\n✨ You can now start the app with: npm run dev')
}

seedDatabase().catch(console.error)
