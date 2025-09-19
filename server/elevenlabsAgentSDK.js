import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";

class ElevenLabsAgentSDKService {
  constructor(apiKey) {
    this.client = new ElevenLabsClient({ apiKey });
  }

  // Create a knowledge base document from book text
  async createKnowledgeBase(bookTitle, bookText, bookId) {
    try {
      console.log(`📚 Creating knowledge base for book: ${bookTitle}`);

      const knowledgeBase = await this.client.conversationalAi.knowledgeBase.documents.createFromText({
        text: bookText,
        name: `${bookTitle} (Book ID: ${bookId})`
      });

      console.log(`✅ Knowledge base created with ID: ${knowledgeBase.id}`);
      return knowledgeBase.id;
    } catch (error) {
      console.error('Error creating knowledge base:', error.message);
      if (error.body) {
        console.error('Error details:', JSON.stringify(error.body, null, 2));
      }
      throw error;
    }
  }

  // Update the hardcoded agent with new knowledge base
  async updateAgentKnowledgeBase(bookTitle, knowledgeBaseId) {
    try {
      const agentId = 'agent_2701k5hmygdyegps36rmfm75xts3'; // Hardcoded working agent
      console.log(`🔄 Updating agent ${agentId} with knowledge base for book: ${bookTitle}`);

      await this.client.conversationalAi.agents.update(agentId, {
        conversationConfig: {
          agent: {
            prompt: {
              knowledgeBase: [
                {
                  type: "file",
                  name: `${bookTitle} Knowledge`,
                  id: knowledgeBaseId,
                  usageMode: "auto"
                }
              ]
            }
          }
        }
      });

      console.log(`✅ Agent updated with new knowledge base`);
      return agentId;
    } catch (error) {
      console.error('Error updating agent:', error.message);
      if (error.body) {
        console.error('Error details:', JSON.stringify(error.body, null, 2));
      }
      throw error;
    }
  }

  // Update knowledge base with new content
  async updateKnowledgeBase(knowledgeBaseId, updates) {
    try {
      console.log(`📝 Updating knowledge base: ${knowledgeBaseId}`);

      const updatedKB = await this.client.conversationalAi.knowledgeBase.documents.update(
        knowledgeBaseId,
        updates
      );

      console.log(`✅ Knowledge base updated successfully`);
      return updatedKB;
    } catch (error) {
      console.error('Error updating knowledge base:', error.message);
      if (error.body) {
        console.error('Error details:', JSON.stringify(error.body, null, 2));
      }
      throw error;
    }
  }

  // Get widget configuration for embedding (if needed)
  async getWidgetConfig(agentId) {
    try {
      console.log(`📱 Getting widget config for agent: ${agentId}`);

      // For now, return a basic config since the SDK doesn't expose this
      return {
        agentId,
        embedUrl: `https://elevenlabs.io/convai-widget/index.js`,
        config: {
          agentId
        }
      };
    } catch (error) {
      console.error('Error getting widget config:', error.message);
      throw error;
    }
  }

  // Setup book agent with hardcoded agent ID
  async setupBookAgent(bookId, bookTitle, bookText) {
    try {
      // Create knowledge base for the book
      const knowledgeBaseId = await this.createKnowledgeBase(bookTitle, bookText, bookId);

      // Update the hardcoded agent with the new knowledge base
      const agentId = await this.updateAgentKnowledgeBase(bookTitle, knowledgeBaseId);

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
}

export default ElevenLabsAgentSDKService;