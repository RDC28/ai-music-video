const fs = require('fs');
const path = require('path');

// Basic .env.local loader for plain node execution
try {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let value = match[2] || '';
        if (value.length > 0 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
        if (value.length > 0 && value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
        process.env[key] = value;
      }
    });
  }
} catch (e) {
  // Ignore errors loading .env
}

const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.GEMINI_API_KEY;

if (!apiKey) {
  console.error("❌ Error: Please set the GOOGLE_AI_API_KEY environment variable.");
  console.error("Option 1: Add GOOGLE_AI_API_KEY=your_key to your .env.local file");
  console.error("Option 2: Run like this: GOOGLE_AI_API_KEY=your_api_key_here node test-gemini-api.js");
  process.exit(1);
}

async function testGemini() {
  console.log("Testing Gemini API Key...");
  try {
    // 1. Fetch available models
    console.log("\nfetching available models...");
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error("❌ API Error:", errorData.error?.message || "Unknown error");
      return;
    }
    
    const data = await response.json();
    // Show all models to see if Veo is there
    const allModels = data.models;
    const veoModels = allModels.filter(m => m.name.toLowerCase().includes("veo"));
    
    console.log(`✅ Successfully connected! Found ${allModels.length} total models.`);
    
    if (veoModels.length > 0) {
      console.log("\n--- Veo Models Found! ---");
      veoModels.forEach(m => console.log(`- ${m.displayName} (${m.name})`));
    } else {
      console.log("\n❌ No models with 'veo' in the name were found.");
    }

    console.log("\n--- All Generation Models ---");
    const genModels = allModels.filter(m => m.supportedGenerationMethods.includes("generateContent"));
    genModels.forEach(m => console.log(`- ${m.displayName} (${m.name})`));
    console.log("-------------------------------\n");
    
    // 2. Test a simple generation to ensure it actually works
    const testModel = genModels[0]?.name || "models/gemini-1.5-flash";
    console.log(`Testing text generation with ${testModel}...`);
    const genResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/${testModel}:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: "Say 'The API key is working!' and nothing else." }] }]
      })
    });
    
    if (!genResponse.ok) {
        console.error("❌ Generation failed:", await genResponse.text());
        return;
    }
    
    const genData = await genResponse.json();
    const resultText = genData.candidates[0].content.parts[0].text.trim();
    console.log(`\nResponse from Gemini: "${resultText}"`);
    console.log("\n✅ ALL TESTS PASSED! Your API Key is working perfectly!");
    
  } catch (error) {
    console.error("❌ Failed to connect:", error.message);
  }
}

testGemini();
