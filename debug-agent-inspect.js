import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import 'dotenv/config';

// Inspect existing agent configuration
async function inspectAgentConfiguration() {
  console.log('🔍 Inspecting Existing Agent Configuration\n');

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY not found');
    process.exit(1);
  }

  const client = new ElevenLabsClient({ apiKey });

  try {
    // Inspect the agent you specified
    const agentId = 'agent_6101k4weban1e3evch2xhd8f64bm';
    console.log(`📋 Retrieving agent configuration for: ${agentId}`);

    const agent = await client.conversationalAi.agents.get(agentId);

    console.log('\n🎯 FULL AGENT CONFIGURATION:');
    console.log(JSON.stringify(agent, null, 2));

    console.log('\n🔧 CONVERSATION CONFIG:');
    if (agent.conversationConfig) {
      console.log(JSON.stringify(agent.conversationConfig, null, 2));
    } else {
      console.log('No conversation config found');
    }

    console.log('\n🎙️ TTS CONFIGURATION:');
    if (agent.conversationConfig?.tts) {
      console.log(JSON.stringify(agent.conversationConfig.tts, null, 2));
    } else {
      console.log('No TTS config found');
    }

    console.log('\n🤖 AGENT CONFIGURATION:');
    if (agent.conversationConfig?.agent) {
      console.log(JSON.stringify(agent.conversationConfig.agent, null, 2));
    } else {
      console.log('No agent config found');
    }

  } catch (error) {
    console.error('❌ Error retrieving agent:', error.message);
    if (error.body) {
      console.error('Error details:', JSON.stringify(error.body, null, 2));
    }
  }
}

inspectAgentConfiguration();