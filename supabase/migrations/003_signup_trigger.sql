-- Family Tree MVP: Auto-create tree on signup
-- When a new user signs up, automatically create a default tree and assign them as owner

-- Function: handle new user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  new_tree_id UUID;
BEGIN
  -- Create a new tree for the user
  -- FIX: tree.created_by is NOT NULL (see 001_schema.sql). Must supply NEW.id.
  INSERT INTO tree (name, created_by, created_at, updated_at)
  VALUES (COALESCE(NEW.email, 'User') || '''s Family Tree', NEW.id, NOW(), NOW())
  RETURNING id INTO new_tree_id;
  
  -- Assign the user as owner of the new tree
  INSERT INTO tree_member (tree_id, user_id, role, created_at)
  VALUES (new_tree_id, NEW.id, 'owner', NOW());
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: fire when a new user is created in auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
