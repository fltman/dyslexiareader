import axios from 'axios';

class ElevenLabsAgentService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.elevenlabs.io/v1';
  }

  // Create a knowledge base document from book text
  async createKnowledgeBase(bookTitle, bookText, bookId) {
    try {
      console.log(`📚 Creating knowledge base for book: ${bookTitle}`);

      const response = await axios.post(
        `${this.baseUrl}/convai/knowledge-base/text`,
        {
          text: bookText,
          name: `${bookTitle} (Book ID: ${bookId})`
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Knowledge base created with ID: ${response.data.id}`);
      return response.data.id;
    } catch (error) {
      console.error('Error creating knowledge base:', error.response?.data || error.message);
      throw error;
    }
  }

  // Create an agent for the book with the knowledge base
  async createBookAgent(bookTitle, knowledgeBaseId) {
    try {
      console.log(`🤖 Creating agent for book: ${bookTitle}`);

      const response = await axios.post(
        `${this.baseUrl}/convai/agents/create`,
        {
          name: `${bookTitle} Assistant`,
          conversation_config: {
            agent: {
              prompt: {
                prompt: `Du är en hjälpsam assistent ENDAST för boken "${bookTitle}".

                VIKTIGT: Du ska ENDAST svara på frågor om denna specifika bok och ENDAST använda
                information från bokens innehåll. Om någon frågar om andra böcker, författare,
                eller ämnen som inte är direkt relaterade till "${bookTitle}", säg att du bara
                kan hjälpa med frågor om denna bok.

                Du har tillgång till hela bokens innehåll och kan svara på frågor om handlingen,
                karaktärerna, teman och detaljer. Du är särskilt anpassad för att hjälpa läsare
                med dyslexi genom att ge tydliga, strukturerade svar med enkel språkbruk.

                Viktiga principer:
                - Använd ENDAST information från "${bookTitle}"
                - Säg tydligt om något inte finns i denna bok
                - Använd enkelt och tydligt språk
                - Dela upp långa svar i kortare stycken
                - Ge konkreta exempel från boken
                - Var tålmodig och uppmuntrande
                - Hjälp läsaren att förstå och njuta av boken
                - Om frågan inte handlar om "${bookTitle}", hänvisa tillbaka till boken`,
                knowledge_base: [knowledgeBaseId]
              },
              language: 'sv',
              voice: 'iwNZQzqCFIBqLR6sgFpN' // Same voice as TTS
            }
          },
          tags: ['book-assistant', 'dyslexia-friendly', bookTitle.toLowerCase().replace(/\s+/g, '-')]
        },
        {
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ Agent created with ID: ${response.data.agent_id}`);
      return response.data.agent_id;
    } catch (error) {
      console.error('Error creating agent:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get widget configuration for embedding
  async getWidgetConfig(agentId) {
    try {
      console.log(`📱 Getting widget config for agent: ${agentId}`);

      const response = await axios.get(
        `${this.baseUrl}/convai/agents/${agentId}/widget`,
        {
          headers: {
            'xi-api-key': this.apiKey
          }
        }
      );

      return response.data;
    } catch (error) {
      console.error('Error getting widget config:', error.response?.data || error.message);
      throw error;
    }
  }

  // Get or create an agent for a book
  async setupBookAgent(bookId, bookTitle, bookText) {
    try {
      // First check if agent already exists for this book
      // (You might want to store agent IDs in your database)

      // Create knowledge base
      const knowledgeBaseId = await this.createKnowledgeBase(bookTitle, bookText, bookId);

      // Create agent with knowledge base
      const agentId = await this.createBookAgent(bookTitle, knowledgeBaseId);

      // Get widget configuration
      const widgetConfig = await this.getWidgetConfig(agentId);

      return {
        agentId,
        knowledgeBaseId,
        widgetConfig
      };
    } catch (error) {
      console.error('Error setting up book agent:', error);
      throw error;
    }
  }

  // List all knowledge bases
  async listKnowledgeBases() {
    try {
      const response = await axios.get(
        `${this.baseUrl}/convai/knowledge-base`,
        {
          headers: {
            'xi-api-key': this.apiKey
          }
        }
      );

      return response.data.documents;
    } catch (error) {
      console.error('Error listing knowledge bases:', error.response?.data || error.message);
      throw error;
    }
  }
}

export default ElevenLabsAgentService;