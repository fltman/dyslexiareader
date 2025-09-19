import ElevenLabsAgentSDKService from './server/elevenlabsAgentSDK.js';
import 'dotenv/config';

// Final test using the SDK-based service
async function testFinalSDKService() {
  console.log('🎯 Testing Final SDK-based ElevenLabs Agent Service\n');

  // Check if API key is available
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.error('❌ ELEVENLABS_API_KEY not found in environment variables');
    process.exit(1);
  }

  console.log('✅ API Key found:', apiKey.substring(0, 8) + '...');

  // Initialize the SDK service
  const service = new ElevenLabsAgentSDKService(apiKey);

  // Test data
  const bookTitle = 'Final Test Book';
  const bookText = 'This is the final test book for our SDK-based ElevenLabs agent service. It contains comprehensive text to verify both knowledge base and agent creation work perfectly together.';
  const bookId = 'final-test-book-001';

  try {
    console.log('\n🚀 Running knowledge base update with SDK...');
    const result = await service.updateBookKnowledge(bookId, bookTitle, bookText);

    console.log('\n🎉 SUCCESS! Knowledge base updated for book:');
    console.log('- Book ID:', bookId);
    console.log('- Knowledge Base ID:', result.knowledgeBaseId);
    console.log('- Agent ID:', result.agentId);
    console.log('- Widget HTML:', result.widget.html);

    console.log('\n✅ The agent now has access to this book\'s content!');
    console.log('\n📝 To embed the agent, use this HTML:');
    console.log(result.widget.html);

  } catch (error) {
    console.error('\n❌ ERROR during final SDK test:');
    console.error('Error message:', error.message);

    if (error.body) {
      console.error('Error body:', JSON.stringify(error.body, null, 2));
    }

    process.exit(1);
  }
}

// Run the final test
testFinalSDKService();