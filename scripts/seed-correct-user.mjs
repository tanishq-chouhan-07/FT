import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
dotenv.config({ path: join(__dirname, '..', '.env.local') })

const s = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

// tanishq.chouhan@gammaedge.io's tree
const TARGET_TREE = '877a9df8-473e-4251-9239-e6daaac956b7'

console.log('🚀 Seeding data for tanishq.chouhan@gammaedge.io\n')

// Check if already has people
const { data: existing } = await s.from('person').select('id').eq('tree_id', TARGET_TREE).limit(1)
if (existing && existing.length > 0) {
  console.log('⚠️  Tree already has people. Skipping.')
  process.exit(0)
}

// Insert people
const { data: people, error: pe } = await s.from('person').insert([
  { tree_id: TARGET_TREE, full_name: 'John Smith',        gender: 'Male',   birth_date: '1940-01-15', death_date: '2010-03-20', is_alive: false, city: 'New York',  country: 'USA', notes: 'Retired teacher, loved history' },
  { tree_id: TARGET_TREE, full_name: 'Mary Smith',        gender: 'Female', birth_date: '1942-05-22', is_alive: true,           city: 'Boston',   country: 'USA', notes: 'Loves gardening and cooking' },
  { tree_id: TARGET_TREE, full_name: 'Robert Smith',      gender: 'Male',   birth_date: '1965-08-10', is_alive: true,           city: 'Chicago',  country: 'USA', notes: 'Software developer' },
  { tree_id: TARGET_TREE, full_name: 'Lisa Johnson',      gender: 'Female', birth_date: '1968-11-30', is_alive: true,           city: 'Chicago',  country: 'USA', notes: 'Pediatrician' },
  { tree_id: TARGET_TREE, full_name: 'Michael Smith',     gender: 'Male',   birth_date: '1990-04-12', is_alive: true,           city: 'Seattle',  country: 'USA', notes: 'Software engineer' },
  { tree_id: TARGET_TREE, full_name: 'Sarah Smith',       gender: 'Female', birth_date: '1992-07-25', is_alive: true,           city: 'Denver',   country: 'USA', notes: 'UX Designer' },
  { tree_id: TARGET_TREE, full_name: 'Emma Smith',        gender: 'Female', birth_date: '2020-02-14', is_alive: true,           city: 'Seattle',  country: 'USA' },
  { tree_id: TARGET_TREE, full_name: 'James Smith',       gender: 'Male',   birth_date: '2022-06-01', is_alive: true,           city: 'Seattle',  country: 'USA' },
  { tree_id: TARGET_TREE, full_name: 'William Smith',     gender: 'Male',   birth_date: '1970-03-18', is_alive: true,           city: 'Austin',   country: 'USA', notes: 'Lawyer' },
  { tree_id: TARGET_TREE, full_name: 'Jennifer Williams', gender: 'Female', birth_date: '1975-09-05', is_alive: true,           city: 'Miami',    country: 'USA', notes: 'Artist' },
]).select()

if (pe) { console.error('❌ People error:', pe.message); process.exit(1) }
console.log(`✓ Inserted ${people.length} people`)

const id = (name) => people.find(p => p.full_name === name)?.id

// Parent-child relationships
const pcRels = [
  { parent: 'John Smith',    child: 'Robert Smith'  },
  { parent: 'Mary Smith',    child: 'Robert Smith'  },
  { parent: 'John Smith',    child: 'William Smith' },
  { parent: 'Mary Smith',    child: 'William Smith' },
  { parent: 'Robert Smith',  child: 'Michael Smith' },
  { parent: 'Robert Smith',  child: 'Sarah Smith'   },
  { parent: 'Lisa Johnson',  child: 'Michael Smith' },
  { parent: 'Lisa Johnson',  child: 'Sarah Smith'   },
  { parent: 'Michael Smith', child: 'Emma Smith'    },
  { parent: 'Michael Smith', child: 'James Smith'   },
  { parent: 'Sarah Smith',   child: 'Emma Smith'    },
  { parent: 'Sarah Smith',   child: 'James Smith'   },
]

let rcOk = 0
for (const r of pcRels) {
  const { error } = await s.from('parent_child').insert({
    tree_id: TARGET_TREE,
    parent_id: id(r.parent),
    child_id: id(r.child),
    relationship_type: 'biological',
  })
  if (error) console.warn(`  ⚠ ${r.parent} → ${r.child}: ${error.message}`)
  else rcOk++
}
console.log(`✓ Created ${rcOk}/${pcRels.length} parent-child relationships`)

// Partnerships
const partners = [
  { p1: 'John Smith',    p2: 'Mary Smith'   },
  { p1: 'Robert Smith',  p2: 'Lisa Johnson' },
  { p1: 'Michael Smith', p2: 'Sarah Smith'  },
]

let pOk = 0
for (const p of partners) {
  const pid1 = id(p.p1), pid2 = id(p.p2)
  if (!pid1 || !pid2) { console.warn(`  ⚠ ${p.p1} ↔ ${p.p2}: missing id`); continue }
  // FIX: canonical ordering — partnership unique constraint is ordered, API sorts to avoid duplicate
  const [partner1_id, partner2_id] = [pid1, pid2].sort()
  const { error } = await s.from('partnership').insert({
    tree_id: TARGET_TREE,
    partner1_id,
    partner2_id,
  })
  if (error) console.warn(`  ⚠ ${p.p1} ↔ ${p.p2}: ${error.message}`)
  else pOk++
}
console.log(`✓ Created ${pOk}/${partners.length} partnerships`)

console.log('\n✅ Done! Refresh your app at http://localhost:3000/dashboard')
