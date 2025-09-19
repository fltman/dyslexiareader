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

  // Get the hardcoded agent ID and widget HTML
  getWidgetHTML() {
    const agentId = 'agent_2701k5hmygdyegps36rmfm75xts3';
    return {
      agentId,
      html: `<elevenlabs-convai agent-id="${agentId}"></elevenlabs-convai><script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>`
    };
  }

  // Update agent knowledge base for a specific book
  async updateBookKnowledge(bookId, bookTitle, bookText) {
    try {
      // Create knowledge base for the book
      const knowledgeBaseId = await this.createKnowledgeBase(bookTitle, bookText, bookId);

      // Update the hardcoded agent with the new knowledge base
      const agentId = await this.updateAgentKnowledgeBase(bookTitle, knowledgeBaseId);

      // Get widget HTML
      const widget = this.getWidgetHTML();

      return {
        agentId,
        knowledgeBaseId,
        widget
      };
    } catch (error) {
      console.error('Error updating book knowledge:', error);
      throw error;
    }
  }
}

export default ElevenLabsAgentSDKService;