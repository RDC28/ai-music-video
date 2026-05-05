const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function checkSchema() {
  // Querying information_schema.columns requires higher privileges usually, 
  // but we can try to select from the table and see what we get.
  // Or just try a select with the specific column.
  
  console.log("Checking locations_library table...");
  const { data, error } = await supabase
    .from('locations_library')
    .select('sheet_url')
    .limit(1);

  if (error) {
    console.error("Error selecting sheet_url:", error);
  } else {
    console.log("Successfully selected sheet_url. Data:", data);
  }
}

checkSchema();
