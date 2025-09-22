import React, { useState, useEffect } from 'react';
import { useLocalization } from '../contexts/LocalizationContext';
import './AgentChat.css';

const AgentChat = ({ bookId, bookTitle }) => {
  const { t } = useLocalization();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const agentId = 'agent_2701k5hmygdyegps36rmfm75xts3'; // Hardcoded agent ID

  // Update agent's knowledge base for current book
  const updateAgentKnowledge = async () => {
    try {
      setIsLoading(true);
      setError(null);
      console.log(`📚 Updating agent knowledge for book: ${bookTitle}`);

      const response = await fetch(`/api/books/${bookId}/agent`, {
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error('Failed to update agent knowledge');
      }

      const data = await response.json();
      console.log('✅ Agent knowledge updated successfully');
    } catch (err) {
      console.error('Error updating agent knowledge:', err);
      setError(`Failed to update agent: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Update knowledge when component mounts or book changes
  useEffect(() => {
    if (bookId) {
      updateAgentKnowledge();
    }
  }, [bookId]);

  
  return (
    <div className="agent-chat">
      <div className="agent-header">
        <h3>{t('agentChat.aiAssistant')}</h3>
        <button 
          onClick={updateAgentKnowledge}
          disabled={isLoading}
          className="update-btn"
        >
          {isLoading ? t('agentChat.updating') : t('agentChat.updateKnowledge')}
        </button>
      </div>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <div className="chat-container">
        <p>Chat with AI about "{bookTitle}"</p>
        {/* Chat interface will be implemented here */}
      </div>
    </div>
  );
};

export default AgentChat;