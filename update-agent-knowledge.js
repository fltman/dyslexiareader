import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import 'dotenv/config';

// Update existing agent with new knowledge base
async function updateAgentKnowledge() {
  console.log('🔄 Updating Agent Knowledge Base\n');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY not found');
    process.exit(1);
  }

  const client = new ElevenLabsClient({ apiKey });
  const agentId = 'agent_2701k5hmygdyegps36rmfm75xts3';

  try {
    // Step 1: Create a new knowledge base
    console.log('📚 Creating new knowledge base...');
    const knowledgeBase = await client.conversationalAi.knowledgeBase.documents.createFromText({
      text: "This is updated knowledge base content for the agent. It contains comprehensive information about dyslexia-friendly reading techniques, accessibility features, and how to help users with reading difficulties. The agent should provide helpful reading assistance and support for people with dyslexia.",
      name: "Updated Reading Assistant Knowledge"
    });
    console.log('✅ Knowledge base created:', knowledgeBase.id);

    // Step 2: Update the agent with the new knowledge base
    console.log('\n🤖 Updating agent with new knowledge base...');
    const updatedAgent = await client.conversationalAi.agents.update(agentId, {
      conversationConfig: {
        agent: {
          prompt: {
            knowledgeBase: [
              {
                type: "file",
                name: "Updated Reading Assistant Knowledge",
                id: knowledgeBase.id,
                usageMode: "auto"
              }
            ]
          }
        }
      }
    });

    console.log('✅ Agent updated successfully!');
    console.log('Agent ID:', agentId);
    console.log('New Knowledge Base ID:', knowledgeBase.id);
    console.log('Updated Agent:', JSON.stringify(updatedAgent, null, 2));

  } catch (error) {
    console.error('❌ Error updating agent:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
  }
}

updateAgentKnowledge();