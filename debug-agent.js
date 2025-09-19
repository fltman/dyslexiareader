import ElevenLabsAgentService from './server/elevenlabsAgent.js';
import 'dotenv/config';

// Debug script for testing ElevenLabs agent creation
async function debugAgentCreation() {
  console.log('🔧 Starting ElevenLabs Agent Debug Script\n');

  // Check if API key is available
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY not found in environment variables');
    process.exit(1);
  }

  console.log('✅ API Key found:', apiKey.substring(0, 8) + '...');

  // Initialize the service
  const service = new ElevenLabsAgentService(apiKey);

  // Test data
  const bookTitle = 'Test Book Debug';
  const bookText = 'This is a test book about debugging ElevenLabs agents. It contains simple text to test the knowledge base creation.';
  const bookId = 'debug-book-001';

  try {
    console.log('\n📚 Step 1: Creating Knowledge Base...');
    const knowledgeBaseId = await service.createKnowledgeBase(bookTitle, bookText, bookId);
    console.log('✅ Knowledge Base created:', knowledgeBaseId);

    console.log('\n🤖 Step 2: Creating Agent...');
    const agentId = await service.createBookAgent(bookTitle, knowledgeBaseId);
    console.log('✅ Agent created:', agentId);

    console.log('\n📱 Step 3: Getting Widget Config...');
    const widgetConfig = await service.getWidgetConfig(agentId);
    console.log('✅ Widget config retrieved');

    console.log('\n🎉 SUCCESS! Full agent setup completed:');
    console.log('- Knowledge Base ID:', knowledgeBaseId);
    console.log('- Agent ID:', agentId);
    console.log('- Widget Config:', JSON.stringify(widgetConfig, null, 2));

  } catch (error) {
    console.error('\n❌ ERROR during agent creation:');
    console.error('Error message:', error.message);

    if (error.response?.data) {
      console.error('API Response:', JSON.stringify(error.response.data, null, 2));
    }

    if (error.config?.data) {
      console.error('Request payload:', error.config.data);
    }

    process.exit(1);
  }
}

// Run the debug script
debugAgentCreation();