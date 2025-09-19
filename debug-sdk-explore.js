import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import 'dotenv/config';

// Explore the SDK structure
async function exploreSDK() {
  console.log('🔍 Exploring ElevenLabs SDK Structure\n');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY not found');
    process.exit(1);
  }

  const client = new ElevenLabsClient({ apiKey });

  console.log('📋 Available client methods:');
  console.log('- client.conversationalAi:', Object.keys(client.conversationalAi || {}));

  if (client.conversationalAi) {
    console.log('- client.conversationalAi.agents:', Object.keys(client.conversationalAi.agents || {}));
    console.log('- client.conversationalAi.knowledgeBase:', Object.keys(client.conversationalAi.knowledgeBase || {}));
  }

  // Try the simple agent creation first
  console.log('\n🤖 Testing simple agent creation...');
  try {
    const agent = await client.conversationalAi.agents.create({
      name: 'Test Agent',
      conversationConfig: {}
    });
    console.log('✅ Simple agent created:', agent);
  } catch (error) {
    console.log('❌ Agent creation failed:', error.message);
    if (error.body) {
      console.log('Error body:', JSON.stringify(error.body, null, 2));
    }
  }
}

exploreSDK();