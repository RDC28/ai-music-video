-- 1. Create a table for User Profiles (including Credits)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT UNIQUE,
  credits BIGINT DEFAULT 50, -- Starting credits for new users
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Create a table for Music Video Projects
CREATE TABLE IF NOT EXISTS projects (
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

-- 3. Credit Transactions Audit Trail
CREATE TABLE IF NOT EXISTS credit_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  amount BIGINT NOT NULL,           -- positive = add, negative = deduct
  action TEXT NOT NULL,             -- 'purchase', 'script_gen', 'image_gen', 'video_gen', 'refund'
  reference_id TEXT,                -- stripe session ID or project ID
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Global Character Library (Shared across projects)
CREATE TABLE IF NOT EXISTS characters_library (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  images JSONB DEFAULT '[]'::jsonb,
  source TEXT,
  sheet_url TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE characters_library ENABLE ROW LEVEL SECURITY;

-- 6. Policies (Idempotent: Drop and Re-create)
-- Profiles
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Projects
DROP POLICY IF EXISTS "Users can view own projects" ON projects;
CREATE POLICY "Users can view own projects" ON projects FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own projects" ON projects;
CREATE POLICY "Users can create own projects" ON projects FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own projects" ON projects;
CREATE POLICY "Users can update own projects" ON projects FOR UPDATE USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own projects" ON projects;
CREATE POLICY "Users can delete own projects" ON projects FOR DELETE USING (auth.uid() = user_id);

-- Transactions
DROP POLICY IF EXISTS "Users can view own transactions" ON credit_transactions;
CREATE POLICY "Users can view own transactions" ON credit_transactions FOR SELECT USING (auth.uid() = user_id);

-- Global Characters
DROP POLICY IF EXISTS "Users can manage own global characters" ON characters_library;
DROP POLICY IF EXISTS "Users can read own characters" ON characters_library;
CREATE POLICY "Users can read own characters" ON characters_library FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can insert own characters" ON characters_library;
CREATE POLICY "Users can insert own characters" ON characters_library FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own characters" ON characters_library;
CREATE POLICY "Users can delete own characters" ON characters_library FOR DELETE USING (auth.uid() = user_id);

-- 7. Functions & Triggers
-- Function for new user profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (new.id, new.raw_user_meta_data->>'full_name', new.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for new user
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function for updated_at column
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for project modtime
DROP TRIGGER IF EXISTS update_projects_modtime ON projects;
CREATE TRIGGER update_projects_modtime
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_modified_column();

-- 8. Storage Buckets & Policies
INSERT INTO storage.buckets (id, name, public) 
VALUES ('assets', 'assets', true)
ON CONFLICT (id) DO NOTHING;

-- Relaxed policies for development to allow project-id based folders
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
CREATE POLICY "Public Access" ON storage.objects FOR SELECT USING (bucket_id = 'assets');

DROP POLICY IF EXISTS "Users can upload own assets" ON storage.objects;
CREATE POLICY "Users can upload own assets" ON storage.objects 
  FOR INSERT WITH CHECK (bucket_id = 'assets' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can update own assets" ON storage.objects;
CREATE POLICY "Users can update own assets" ON storage.objects 
  FOR UPDATE USING (bucket_id = 'assets' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Users can delete own assets" ON storage.objects;
CREATE POLICY "Users can delete own assets" ON storage.objects 
  FOR DELETE USING (bucket_id = 'assets' AND auth.role() = 'authenticated');{
  "task_type": "feature_addition",
  "goal": "Add a step-by-step progress indicator UI to three AI workflows: (1) Audio Analysis in UploadAudioScreen, (2) Script/Brain Dump generation in BrainDumpScreen, and (3) Character generation in CharactersScreen. Each shows named steps with a visual progress bar and the currently active step label as the AI works through its pipeline.",
  "context": "All three workflows are single fetch() or sequential async calls with no streaming. Progress cannot be measured from the server — it must be simulated client-side by advancing through a predefined list of steps at key points in the code. The UI uses inline styles with a dark theme (background #0c0c0c, accent #00B8D4 / var(--teal), border rgba(255,255,255,0.08)). Each workflow has different steps based on what it actually does.",
  "requirements": [
    "Each workflow gets its own progress state: a list of step labels and a currentStepIndex integer",
    "A reusable ProgressBar component (defined once, used in all three screens) renders: the step name, a filled bar (width = currentStepIndex / totalSteps * 100%), and optionally step dots",
    "Steps advance manually in code — set the step index just before each major async operation begins",
    "On completion or error, hide the progress bar (reset state)",
    "The progress bar replaces or overlays the existing simple loading text (e.g. 'Gemini is listening...') — do not show both",
    "No backend or API route changes"
  ],
  "technical_details": {
    "language": "JavaScript (JSX)",
    "framework": "Next.js 15 App Router",
    "libraries": ["Inline styles only — no new libraries"],
    "database": null,
    "api_or_backend": "No changes",
    "styling": "Inline styles. Match existing dark theme. Progress fill color: #00B8D4. Background track: rgba(255,255,255,0.08). Bar height: 4px. Rounded: border-radius 9999px. Show step label in small caps above the bar."
  },
  "implementation_steps": [
    "1. Create a reusable ProgressBar component (can live at the top of each file or in a shared components file). Props: steps (string[]), currentStep (number), label (string). Renders: current step label text, the bar track + fill, and optionally small step count ('Step 2 of 5').",
    "2. AUDIO SCREEN (UploadAudioScreen.js): Add progressStep state (default -1, -1 means hidden). Define steps array: ['Fetching audio file', 'Sending to Gemini', 'Analyzing rhythm & lyrics', 'Processing transcript', 'Saving to project']. In handleAnalyze: set step 0 before fetch('/api/analyze'), set step 2 right after fetch starts (use a setTimeout ~300ms to simulate Gemini receiving), set step 3 when response arrives, step 4 when onUploadSuccess is called. Reset to -1 in finally. Replace the 'Gemini is listening...' button text with the ProgressBar rendered below the button.",
    "3. SCRIPT SCREEN (BrainDumpScreen.js): Add progressStep state (default -1). Define steps: ['Reading your idea', 'Analyzing lyrics & transcript', 'Writing script & scenes', 'Creating characters & locations', 'Building shot list', 'Saving to project']. In handleBrainDump: advance step manually — step 0 on entry, step 1 before fetch, step 2 after ~500ms (setTimeout), step 3 when response arrives and plan is set, step 4 when onDataUpdate starts, step 5 when onDataUpdate finishes. Reset in finally. Render ProgressBar below the textarea / generate button while isAnalyzing is true.",
    "4. CHARACTER SCREEN (CharactersScreen.js): Add charProgressStep state (default -1) and charProgressLabel state (default ''). The character generation is already sequential — advance step at each iteration. Define steps: ['Preparing character profile', 'Generating FRONT VIEW', 'Generating SIDE VIEW', 'Generating BACK VIEW', 'Generating FACE CLOSE-UP', 'Uploading to library']. In handleGenerateAngles: set step 0 on entry, set step i+1 at the start of each loop iteration (label = angle.label), set final step when uploading. Reset in finally. Render ProgressBar in the sidebar panel below the GENERATE NEW button, only when isGenerating is true."
  ],
  "files_to_create_or_modify": [
    {
      "file": "src/components/screens/UploadAudioScreen.js",
      "action": "modify",
      "changes": [
        "Add progressStep state",
        "Add ProgressBar component definition (or import if shared)",
        "Advance progressStep at key points in handleAnalyze",
        "Render ProgressBar below the analyze button when isAnalyzing is true"
      ]
    },
    {
      "file": "src/components/screens/BrainDumpScreen.js",
      "action": "modify",
      "changes": [
        "Add progressStep state",
        "Advance progressStep at key points in handleBrainDump",
        "Render ProgressBar below the generate button when isAnalyzing is true"
      ]
    },
    {
      "file": "src/components/screens/CharactersScreen.js",
      "action": "modify",
      "changes": [
        "Add charProgressStep state",
        "Advance charProgressStep at start of each angle iteration in handleGenerateAngles",
        "Render ProgressBar in the left sidebar panel when isGenerating is true"
      ]
    },
    {
      "file": "src/components/ProgressBar.js (optional — or inline in each file)",
      "action": "create",
      "changes": [
        "Reusable ProgressBar component. Props: steps (string[]), currentStep (number). Renders step label, filled bar, step count."
      ]
    }
  ],
  "progressbar_component_spec": {
    "props": ["steps: string[]", "currentStep: number"],
    "layout": "Vertical stack: [step label row] → [bar track with fill] → [step count e.g. 'Step 2 of 5']",
    "style": {
      "container": "padding: 12px 0, width: 100%",
      "label": "font-size: 11px, font-weight: 700, letter-spacing: 0.08em, text-transform: uppercase, color: #00B8D4, margin-bottom: 8px",
      "track": "height: 4px, border-radius: 9999px, background: rgba(255,255,255,0.08), overflow: hidden",
      "fill": "height: 100%, border-radius: 9999px, background: #00B8D4, transition: width 400ms ease, width: (currentStep + 1) / steps.length * 100 + '%'",
      "count": "font-size: 10px, color: rgba(255,255,255,0.3), margin-top: 6px, font-family: monospace"
    },
    "animation": "The fill width transitions smoothly (CSS transition: width 400ms ease) as currentStep increments"
  },
  "step_definitions": {
    "audio_analysis": [
      "Fetching audio file",
      "Sending to Gemini 2.5 Flash",
      "Analyzing rhythm & lyrics",
      "Processing transcript",
      "Saving to project"
    ],
    "script_generation": [
      "Reading your idea",
      "Analyzing lyrics & transcript",
      "Writing script & scenes",
      "Creating characters & locations",
      "Building shot list",
      "Saving to project"
    ],
    "character_generation": [
      "Preparing character profile",
      "Generating Front View",
      "Generating Side View",
      "Generating Back View",
      "Generating Face Close-up",
      "Uploading to library"
    ]
  },
  "constraints": [
    "No backend changes",
    "No new npm packages",
    "setTimeout-based step advances must use short delays (200-500ms) only to make transitions visible — they must not block real async work",
    "Progress must reset to -1 (hidden) in the finally block of every async function, on both success and error paths",
    "Do not replace the existing isAnalyzing / isGenerating / isProcessingSheet boolean states — the ProgressBar is additive",
    "The existing 'Generating 3/9...' text in the Characters sidebar (line ~250 in page.js) is separate from this and should remain untouched"
  ],
  "avoid": [
    "Fake timers that run independently of the actual async work — steps must advance at real code checkpoints",
    "Showing the progress bar and the old loading text simultaneously",
    "Any new API routes or server-sent events for streaming",
    "Changing the BrainDump 'generatedPlan' result rendering or the audio analysis summary card"
  ],
  "expected_output": "While each AI operation runs, a clean step-by-step progress bar appears in context (below the button for audio/script, in the sidebar panel for characters). The bar fills smoothly as each step completes. On finish or error it disappears.",
  "success_criteria": [
    "All three screens show a progress bar during their respective AI operations",
    "Each bar advances through its named steps at real code checkpoints, not on a fixed timer",
    "The fill width transitions smoothly via CSS transition",
    "The bar disappears cleanly on success and on error",
    "No regressions to existing loading states, button disable logic, or result rendering"
  ]
}
