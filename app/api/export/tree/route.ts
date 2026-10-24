import { NextRequest, NextResponse } from 'next/server'
import { createServerClientInstance } from '@/lib/supabase/server'
import type { Database } from '@/types/database'

type TreeMemberRow = Database['public']['Tables']['tree_member']['Row']
type PersonRow = Database['public']['Tables']['person']['Row']
type ParentChildRow = Database['public']['Tables']['parent_child']['Row']
type PartnershipRow = Database['public']['Tables']['partnership']['Row']

interface ExportData {
  version: '1.0'
  exportDate: string
  people: PersonRow[]
  parentChildRelations: ParentChildRow[]
  partnerships: PartnershipRow[]
}

export async function GET(_request: NextRequest) {
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

    // Fetch all data
    const [peopleRes, parentChildRes, partnershipsRes] = await Promise.all([
      supabase.from('person').select('*').eq('tree_id', member.tree_id),
      supabase.from('parent_child').select('*').eq('tree_id', member.tree_id),
      supabase.from('partnership').select('*').eq('tree_id', member.tree_id),
    ])

    const people = peopleRes.data || []
    const parentChildRelations = parentChildRes.data || []
    const partnerships = partnershipsRes.data || []

    // Create export data
    const exportData: ExportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      people,
      parentChildRelations,
      partnerships,
    }

    // Return as JSON file
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="family-tree-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    })
  } catch (error) {
    console.error('Error exporting tree:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
