import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import 'dotenv/config';

// Debug script using official ElevenLabs JavaScript SDK
async function debugAgentCreationWithSDK() {
  console.log('🔧 Starting ElevenLabs Agent Debug Script (Official SDK)\n');

  // Check if API key is available
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY not found in environment variables');
    process.exit(1);
  }

  console.log('✅ API Key found:', apiKey.substring(0, 8) + '...');

  // Initialize the client
  const client = new ElevenLabsClient({ apiKey });

  // Test data
  const bookTitle = 'Test Book SDK';
  const bookText = 'This is a test book for SDK-based agent creation. It contains simple text to test the knowledge base creation.';

  try {
    // Step 1: Create Knowledge Base
    console.log('\n📚 Step 1: Creating Knowledge Base with SDK...');
    const knowledgeBase = await client.conversationalAi.knowledgeBase.createFromText({
      text: bookText,
      name: `${bookTitle} Knowledge Base`
    });

    console.log('✅ Knowledge Base created:', knowledgeBase.id);

    // Step 2: Create simple agent first (minimal config)
    console.log('\n🤖 Step 2: Creating Simple Agent with SDK...');

    try {
      const simpleAgent = await client.conversationalAi.agents.create({
        name: `${bookTitle} Assistant`,
        conversationConfig: {
          agent: {
            prompt: {
              prompt: `Du är en hjälpsam assistent för boken "${bookTitle}".`
            },
            language: 'sv',
            voice: 'iwNZQzqCFIBqLR6sgFpN'
          }
        }
      });

      console.log('✅ Simple Agent created:', simpleAgent.agentId);

      // Step 3: Try with knowledge base
      console.log('\n🧠 Step 3: Creating Agent with Knowledge Base...');
      const agentWithKB = await client.conversationalAi.agents.create({
        name: `${bookTitle} KB Assistant`,
        conversationConfig: {
          agent: {
            prompt: {
              prompt: `Du är en hjälpsam assistent för boken "${bookTitle}". Använd endast information från kunskapsdatabasen.`
            },
            language: 'sv',
            voice: 'iwNZQzqCFIBqLR6sgFpN',
            knowledgeBase: [knowledgeBase.id]
          }
        }
      });

      console.log('✅ Agent with Knowledge Base created:', agentWithKB.agentId);

      console.log('\n🎉 SUCCESS! Full SDK-based agent setup completed:');
      console.log('- Knowledge Base ID:', knowledgeBase.id);
      console.log('- Simple Agent ID:', simpleAgent.agentId);
      console.log('- KB Agent ID:', agentWithKB.agentId);

    } catch (agentError) {
      console.error('\n❌ Error creating agent with SDK:');
      console.error('Agent Error:', agentError.message);
      if (agentError.body) {
        console.error('Agent Error Body:', JSON.stringify(agentError.body, null, 2));
      }
    }

  } catch (error) {
    console.error('\n❌ ERROR during SDK agent creation:');
    console.error('Error message:', error.message);
    if (error.body) {
      console.error('Error body:', JSON.stringify(error.body, null, 2));
    }
    process.exit(1);
  }
}

// Run the debug script
debugAgentCreationWithSDK();