-- 1. Create a table for User Profiles (including Credits)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT UNIQUE,
  credits BIGINT DEFAULT 50, -- Starting credits for new users
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Create a table for Music Video Projects
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  title TEXT DEFAULT 'Untitled Project',
  audio_url TEXT,
  
  -- Flexible JSON storage for Agent outputs
  project_state JSONB DEFAULT '{
    "current_step": 1,
    "script": null, 
    "characters": [],
    "locations": [],
    "shot_list": [],
    "images": [],
    "videos": []
  }'::jsonb,
  
  status TEXT DEFAULT 'draft', -- draft, processing, completed, error
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- 4. Create Policies
-- Profiles: Users can only see/update their own profile
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Projects: Users can only see/manage their own projects
CREATE POLICY "Users can view own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own projects" ON projects FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own projects" ON projects FOR DELETE USING (auth.uid() = user_id);

-- 5. Trigger to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. Credit System Stored Procedures
-- Atomic credit deduction (prevents double-spend)
CREATE OR REPLACE FUNCTION deduct_credits(p_user_id UUID, p_amount BIGINT)
RETURNS BIGINT AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  UPDATE profiles 
  SET credits = credits - p_amount 
  WHERE id = p_user_id AND credits >= p_amount
  RETURNING credits INTO new_balance;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atomic credit addition
CREATE OR REPLACE FUNCTION add_credits(p_user_id UUID, p_amount BIGINT)
RETURNS BIGINT AS $$
DECLARE
  new_balance BIGINT;
BEGIN
  UPDATE profiles 
  SET credits = credits + p_amount 
  WHERE id = p_user_id
  RETURNING credits INTO new_balance;
  
  RETURN new_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. Triggers for updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_modtime
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 8. Credit Transactions Audit Trail
CREATE TABLE credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  amount BIGINT NOT NULL,           -- positive = add, negative = deduct
  action TEXT NOT NULL,             -- 'purchase', 'script_gen', 'image_gen', 'video_gen', 'refund'
  reference_id TEXT,                -- stripe session ID or project ID
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own transactions" 
  ON credit_transactions FOR SELECT USING (auth.uid() = user_id);
