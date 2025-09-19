import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import 'dotenv/config';

// Test minimal agent creation first
async function testMinimalAgent() {
  console.log('🧪 Testing Minimal Agent Creation\n');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY not found');
    process.exit(1);
  }

  const client = new ElevenLabsClient({ apiKey });

  try {
    // Step 1: Create knowledge base
    console.log('📚 Creating knowledge base...');
    const knowledgeBase = await client.conversationalAi.knowledgeBase.documents.createFromText({
      text: 'This is test knowledge base content for agent testing.',
      name: 'Test Knowledge Base'
    });
    console.log('✅ Knowledge base created:', knowledgeBase.id);

    // Step 2: Create minimal agent
    console.log('\n🤖 Creating minimal agent...');
    const agent = await client.conversationalAi.agents.create({
      name: 'Test Minimal Agent',
      conversationConfig: {}
    });
    console.log('✅ Minimal agent created:', agent.agentId);

    // Step 3: Try to update with full config
    console.log('\n🔧 Updating agent with full configuration...');
    const updatedAgent = await client.conversationalAi.agents.update(agent.agentId, {
      name: 'Test Updated Agent',
      conversationConfig: {
        tts: {
          modelId: "eleven_flash_v2_5",
          voiceId: "pNInz6obpgDQGcFmaJgB"
        },
        llm: {
          modelId: "gpt-4o-mini"
        },
        knowledgeBase: [
          {
            type: "file",
            name: "Test Knowledge",
            id: knowledgeBase.id,
            usageMode: "auto"
          }
        ]
      }
    });
    console.log('✅ Agent updated successfully:', updatedAgent);

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
  }
}

testMinimalAgent();