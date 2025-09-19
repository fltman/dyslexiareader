import React, { useState, useEffect } from 'react';
import './AgentChat.css';

const AgentChat = ({ bookId, bookTitle }) => {
  const [agentId, setAgentId] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [widgetConfig, setWidgetConfig] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  // Load agent from book data
  const loadAgent = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Get book information including agent ID
      const bookResponse = await fetch(`/api/books/${bookId}`);
      if (!bookResponse.ok) {
        throw new Error('Failed to load book data');
      }

      const book = await bookResponse.json();

      // Check if book already has an agent
      if (book.agent_id) {
        console.log('📱 Using existing agent:', book.agent_id);
        setAgentId(book.agent_id);

        // Load widget with existing agent
        if (window.elevenlabs) {
          window.elevenlabs.convai.embed({
            agentId: book.agent_id
          });
        }
      } else {
        console.log('❌ No agent found for this book');
        setError('Agent not available for this book yet');
      }
    } catch (err) {
      console.error('Error loading agent:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  // Load agent when component mounts
  useEffect(() => {
    if (bookId) {
      loadAgent();
    }
  }, [bookId]);

  // Load ElevenLabs SDK
  useEffect(() => {
    if (!document.getElementById('elevenlabs-sdk')) {
      const script = document.createElement('script');
      script.id = 'elevenlabs-sdk';
      script.src = 'https://elevenlabs.io/convai-widget/index.js';
      script.async = true;
      script.onload = () => {
        console.log('ElevenLabs SDK loaded');
      };
      document.body.appendChild(script);
    }
  }, []);

  return (
    <div className="agent-chat">
      {isLoading && (
        <button
          className="agent-chat-button"
          disabled={true}
          title="Laddar bokassistent..."
        >
          <div className="agent-loading">
            <div className="spinner"></div>
            <span>Laddar...</span>
          </div>
        </button>
      )}

      {agentId && (
        <button
          className="agent-chat-toggle"
          onClick={() => setIsOpen(!isOpen)}
          title={`Prata om "${bookTitle}"`}
        >
          <span className="chat-icon">🤖</span>
          <span className="chat-label">Bokassistent</span>
        </button>
      )}

      {error && !isLoading && (
        <div className="agent-error">
          <p>{error}</p>
          <button onClick={loadAgent}>Försök igen</button>
        </div>
      )}

      {/* ElevenLabs widget will be embedded here */}
      <div id="elevenlabs-convai-widget" />
    </div>
  );
};

export default AgentChat;