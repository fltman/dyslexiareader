import React, { useState, useEffect } from 'react';
import './AgentChat.css';

const AgentChat = ({ bookId, bookTitle }) => {
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
    <elevenlabs-convai agent-id="agent_2701k5hmygdyegps36rmfm75xts3"></elevenlabs-convai><script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
    <div className="agent-chat">
      {isLoading && (
        <div className="agent-loading-container">
          <div className="agent-loading">
            <div className="spinner"></div>
            <span>Uppdaterar bokassistent...</span>
          </div>
        </div>
      )}

  
      {error && (
        <div className="agent-error">
          <p>{error}</p>
          <button onClick={updateAgentKnowledge}>Försök igen</button>
        </div>
      )}
    </div>
  );
};

export default AgentChat;