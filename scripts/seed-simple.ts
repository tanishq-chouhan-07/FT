/**
 * Quick seed script - run this after setting up your .env.local
 * Usage: npm run seed
 * FIXED: gender must be capitalised (Male/Female per DB CHECK), partnership cols are partner1_id/partner2_id, and tree requires created_by
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ Missing environment variables')
  console.error('Please create .env.local with your Supabase credentials')
  console.error('See .env.example for reference')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

async function seed() {
  console.log('🚀 Starting seed...\n')

  // 1. Get authenticated user — with service_role we must list users, not getUser()
  let user: { id: string; email: string | null } | null = null
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (authUser) {
    user = { id: authUser.id, email: authUser.email ?? null }
  } else {
    const { data } = await supabase.auth.admin.listUsers()
    if (data?.users?.length) user = { id: data.users[0].id, email: data.users[0].email ?? null }
  }
  if (!user) {
    console.error('❌ Not authenticated. Create a user via Supabase Dashboard → Authentication → Users, then re-run.')
    process.exit(1)
  }

  console.log(`👤 User: ${user.email} (${user.id})\n`)

  // 2. Create tree — must include created_by (NOT NULL FK)
  console.log('📝 Creating tree...')
  const { data: tree, error: treeErr } = await supabase
    .from('tree')
    .insert([{ name: 'Test Family', description: 'Test data for MVP', created_by: user.id }])
    .select()
    .single()

  if (treeErr) {
    console.error('Tree error:', treeErr)
    return
  }
  console.log(`✓ Tree: ${tree.name} (${tree.id})\n`)

  // 3. Create tree member
  console.log('👥 Creating membership...')
  const { error: memberErr } = await supabase
    .from('tree_member')
    .insert([{ tree_id: tree.id, user_id: user.id, role: 'owner' }])
  if (memberErr) console.error('Member error:', memberErr)
  else console.log('✓ Membership created\n')

  // 4. Insert people — gender MUST be 'Male'/'Female' per DB CHECK constraint
  console.log('👤 Inserting 10 test people...')

  const people = await supabase
    .from('person')
    .insert([
      { tree_id: tree.id, full_name: 'John Smith', gender: 'Male', birth_date: '1940-01-15', city: 'New York', country: 'USA' },
      { tree_id: tree.id, full_name: 'Mary Smith', gender: 'Female', birth_date: '1942-05-22', city: 'Boston', country: 'USA' },
      { tree_id: tree.id, full_name: 'Robert Smith', gender: 'Male', birth_date: '1965-08-10', city: 'Chicago', country: 'USA' },
      { tree_id: tree.id, full_name: 'Lisa Johnson', gender: 'Female', birth_date: '1968-11-30', city: 'Chicago', country: 'USA' },
      { tree_id: tree.id, full_name: 'Michael Smith', gender: 'Male', birth_date: '1990-04-12', city: 'Seattle', country: 'USA' },
      { tree_id: tree.id, full_name: 'Sarah Smith', gender: 'Female', birth_date: '1992-07-25', city: 'Denver', country: 'USA' },
      { tree_id: tree.id, full_name: 'Emma Smith', gender: 'Female', birth_date: '2020-02-14', city: 'Seattle', country: 'USA' },
      { tree_id: tree.id, full_name: 'James Smith', gender: 'Male', birth_date: '2022-06-01', city: 'Seattle', country: 'USA' },
      { tree_id: tree.id, full_name: 'William Smith', gender: 'Male', birth_date: '1970-03-18', city: 'Austin', country: 'USA' },
      { tree_id: tree.id, full_name: 'Jennifer Williams', gender: 'Female', birth_date: '1975-09-05', city: 'Miami', country: 'USA' },
    ])
    .select()

  if (people.error) {
    console.error('People insert error:', people.error)
    return
  }
  console.log(`✓ Inserted ${people.data?.length} people\n`)

  // 5. Create parent-child relationships
  console.log('🔗 Creating relationships...')
  const parentChild = [
    { parent: 'John Smith', child: 'Robert Smith' },
    { parent: 'Mary Smith', child: 'Robert Smith' },
    { parent: 'John Smith', child: 'Lisa Johnson' },
    { parent: 'Mary Smith', child: 'Lisa Johnson' },
    { parent: 'Robert Smith', child: 'Michael Smith' },
    { parent: 'Robert Smith', child: 'Sarah Smith' },
    { parent: 'Lisa Johnson', child: 'Michael Smith' },
    { parent: 'Lisa Johnson', child: 'Sarah Smith' },
    { parent: 'Michael Smith', child: 'Emma Smith' },
    { parent: 'Michael Smith', child: 'James Smith' },
    { parent: 'Sarah Smith', child: 'Emma Smith' },
    { parent: 'Sarah Smith', child: 'James Smith' },
  ]

  for (const rel of parentChild) {
    const parentId = (await supabase
      .from('person')
      .select('id')
      .eq('tree_id', tree.id)
      .eq('full_name', rel.parent)
      .single()).data?.id

    const childId = (await supabase
      .from('person')
      .select('id')
      .eq('tree_id', tree.id)
      .eq('full_name', rel.child)
      .single()).data?.id

    if (parentId && childId) {
      await supabase
        .from('parent_child')
        .insert([{ tree_id: tree.id, parent_id: parentId, child_id: childId, relationship_type: 'biological' }])
    }
  }
  console.log(`✓ Created ${parentChild.length} parent-child relationships\n`)

  // 6. Create partnerships — FIXED: use partner1_id/partner2_id + sort to respect unique constraint
  console.log('💍 Creating partnerships...')
  const partnerships = [
    { person: 'John Smith', partner: 'Mary Smith' },
    { person: 'Robert Smith', partner: 'Lisa Johnson' },
    { person: 'Michael Smith', partner: 'Sarah Smith' },
  ]

  for (const p of partnerships) {
    const personId = (await supabase
      .from('person')
      .select('id')
      .eq('tree_id', tree.id)
      .eq('full_name', p.person)
      .single()).data?.id

    const partnerId = (await supabase
      .from('person')
      .select('id')
      .eq('tree_id', tree.id)
      .eq('full_name', p.partner)
      .single()).data?.id

    if (personId && partnerId) {
      const [partner1_id, partner2_id] = [personId, partnerId].sort()
      const { error: psErr } = await supabase
        .from('partnership')
        .insert([{ tree_id: tree.id, partner1_id, partner2_id }])
      if (psErr) console.warn(`  ⚠ partnership ${p.person} ↔ ${p.partner}: ${psErr.message}`)
    }
  }
  console.log(`✓ Created ${partnerships.length} partnerships\n`)

  console.log('✅ Seed complete!')
}

seed().catch(console.error)
