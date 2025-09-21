import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import './BookViewer.css';

const BookViewer = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const imageRef = useRef(null);

  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [textBlocks, setTextBlocks] = useState([]);
  const textBlocksCache = useRef({}); // Use ref to persist cache across re-renders
  const [isDetecting, setIsDetecting] = useState(false);
  const [processingBlocks, setProcessingBlocks] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [scaleX, setScaleX] = useState(1.0);
  const [scaleY, setScaleY] = useState(1.0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingBlock, setCurrentPlayingBlock] = useState(null);
  const [highlightedCharIndex, setHighlightedCharIndex] = useState(-1);
  const [currentPlayingText, setCurrentPlayingText] = useState('');
  const [currentAlignment, setCurrentAlignment] = useState(null);
  const [generatingAudio, setGeneratingAudio] = useState(new Set()); // Track which blocks are generating audio
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [userPreferences, setUserPreferences] = useState(null);

  useEffect(() => {
    if (bookId) {
      fetchBook();
      updateAgentKnowledge();
    }
  }, [bookId]);

  useEffect(() => {
    if (user) {
      loadUserPreferences();
    }
  }, [user]);

  const loadUserPreferences = async () => {
    try {
      const response = await fetch('/api/user/preferences', {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setUserPreferences(data.preferences);

        // Set playback speed from preferences
        if (data.preferences?.playbackSpeed) {
          setPlaybackSpeed(parseFloat(data.preferences.playbackSpeed));
        }
      }
    } catch (error) {
      console.error('Error loading user preferences:', error);
    }
  };

  // Update agent's knowledge base for current book
  const updateAgentKnowledge = async () => {
    try {
      console.log(`📚 Updating agent knowledge for book ID: ${bookId}`);

      const response = await fetch(`/api/books/${bookId}/agent`, {
        method: 'POST'
      });

      if (!response.ok) {
        console.error('Failed to update agent knowledge');
      } else {
        const data = await response.json();
        console.log('✅ Agent knowledge updated successfully');
      }
    } catch (err) {
      console.error('Error updating agent knowledge:', err);
    }
  };


  useEffect(() => {
    if (pages.length > 0) {
      const pageId = pages[currentPage].id;
      console.log('📄 Loading text blocks for page:', currentPage, 'pageId:', pageId);
      console.log('🗺️ Current cache state:', Object.keys(textBlocksCache.current));

      // Check cache first for instant loading
      if (textBlocksCache.current[pageId]) {
        console.log('⚡ Loading text blocks from cache, count:', textBlocksCache.current[pageId].length);
        setTextBlocks(textBlocksCache.current[pageId]);
      } else {
        console.log('🌍 No cache found, fetching from API...');
        // Clear current text blocks if no cache available
        setTextBlocks([]);
        // Always fetch from API to ensure text blocks are loaded
        fetchTextBlocks(pageId);
      }
    }
  }, [currentPage, pages]); // Remove textBlocksCache from deps to avoid infinite loops

  const fetchBook = async () => {
    try {
      const response = await fetch(`/api/books/${bookId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setBook(data);
      setPages(data.pages || []);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching book:', error);
      setLoading(false);
    }
  };

  const processIncompleteBlocks = async (blocks, pageId) => {
    // Process any blocks that aren't completed, regardless of OCR text status
    const incompleteBlocks = blocks.filter(block => block.status !== 'completed');
    if (incompleteBlocks.length > 0) {
      console.log('🔄 Auto-processing', incompleteBlocks.length, 'incomplete text blocks...');
      
      // Set processing state for all blocks
      setProcessingBlocks(prev => {
        const newSet = new Set(prev);
        incompleteBlocks.forEach(block => newSet.add(block.id));
        return newSet;
      });

      try {
        // Process all blocks in parallel to avoid refetch storms
        await Promise.all(incompleteBlocks.map(async (block) => {
          try {
            const response = await fetch(`/api/textblocks/${block.id}/process`, {
              method: 'POST'
            });
            if (!response.ok) {
              console.error(`Failed to process block ${block.id}`);
            }
          } catch (error) {
            console.error(`Error processing block ${block.id}:`, error);
          }
        }));

        // Single refresh after all processing is complete, using the specific pageId
        fetchTextBlocksOnly(pageId);
      } finally {
        // Clear processing state for all blocks
        setProcessingBlocks(prev => {
          const newSet = new Set(prev);
          incompleteBlocks.forEach(block => newSet.delete(block.id));
          return newSet;
        });
      }
    }
  };

  const fetchTextBlocksOnly = async (pageId) => {
    try {
      const response = await fetch(`/api/pages/${pageId}/textblocks`);
      if (response.ok) {
        const blocks = await response.json();

        // Cache the results
        textBlocksCache.current = {
          ...textBlocksCache.current,
          [pageId]: blocks
        };

        // Only update if this is still the current page to prevent race conditions
        if (pages[currentPage]?.id === pageId) {
          setTextBlocks(blocks);
        }
      }
    } catch (error) {
      console.error('Error fetching text blocks:', error);
    }
  };

  const fetchTextBlocks = async (pageId) => {
    console.log('🔍 Fetching text blocks for pageId:', pageId);
    try {
      const response = await fetch(`/api/pages/${pageId}/textblocks`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blocks = await response.json();
      console.log('📦 Fetched text blocks:', blocks.length, 'blocks');
      
      console.log('✅ Fetched', blocks.length, 'text blocks from API for page', pageId);

      // Cache the results for instant loading
      textBlocksCache.current = {
        ...textBlocksCache.current,
        [pageId]: blocks
      };
      console.log('🗺️ Updated cache, now contains:', Object.keys(textBlocksCache.current));

      // Only update if this is still the current page to prevent race conditions
      if (pages[currentPage]?.id === pageId) {
        console.log('💻 Setting text blocks for current page:', blocks.length, 'blocks');
        setTextBlocks(blocks);
      } else {
        console.log('⚠️ Skipping text blocks update - page changed during fetch');
        return;
      }
      
      // Automatically detect text blocks if none exist for this page
      if (blocks.length === 0 && !isDetecting) {
        console.log('🔍 No text blocks found for page, auto-detecting...');
        detectTextBlocksAutomatically(pageId);
      } else if (blocks.length > 0) {
        // Process any incomplete blocks automatically
        processIncompleteBlocks(blocks, pageId);
      }
    } catch (error) {
      console.error('Error fetching text blocks:', error);
      setTextBlocks([]);
    }
  };

  const detectTextBlocks = async () => {
    if (!pages[currentPage] || isDetecting) return;

    setIsDetecting(true);

    try {
      // Use Google Cloud Vision to detect text blocks and extract text in one call
      const response = await fetch(`/api/pages/${pages[currentPage].id}/detect-text-blocks`, {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Google Cloud Vision detected text blocks:', result);

        if (result.success && result.blocks?.length > 0) {
          // Blocks are already saved by the backend, just refresh the UI
          fetchTextBlocks(pages[currentPage].id);
        } else {
          console.log('No text blocks detected');
        }
      } else {
        console.error('Error calling text detection API');
      }
    } catch (error) {
      console.error('Error detecting text blocks:', error);
    }

    setIsDetecting(false);
  };

  const detectTextBlocksAutomatically = async (pageId) => {
    if (isDetecting) return;

    setIsDetecting(true);

    try {
      console.log('🔍 Auto-detecting text blocks for page:', pageId);
      
      const response = await fetch(`/api/pages/${pageId}/detect-text-blocks`, {
        method: 'POST'
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Auto-detection completed:', result);

        if (result.success && result.blocks?.length > 0) {
          // Cache the newly detected blocks
          textBlocksCache.current = {
            ...textBlocksCache.current,
            [pageId]: result.blocks
          };

          // Blocks are already saved by the backend, refresh text blocks for current page only
          if (pages[currentPage]?.id === pageId) {
            setTextBlocks(result.blocks);
            // Process the newly created blocks to make them clickable
            processIncompleteBlocks(result.blocks, pageId);
          }
        }
      } else {
        console.error('❌ Auto-detection API error');
      }
    } catch (error) {
      console.error('❌ Auto-detection failed:', error);
    }

    setIsDetecting(false);
  };




  const processTextBlock = async (block) => {
    if (processingBlocks.has(block.id)) return;

    setProcessingBlocks(prev => new Set(prev).add(block.id));

    try {
      const response = await fetch(`/api/textblocks/${block.id}/process`, {
        method: 'POST'
      });

      if (response.ok) {
        fetchTextBlocksOnly(pages[currentPage].id);
      }
    } catch (error) {
      console.error('Error processing text block:', error);
    } finally {
      setProcessingBlocks(prev => {
        const newSet = new Set(prev);
        newSet.delete(block.id);
        return newSet;
      });
    }
  };

  const playTextBlock = async (block) => {
    console.log('🎵 PLAY BUTTON CLICKED - Block data:', {
      id: block.id,
      ocrText: block.ocrText,
      ocr_text: block.ocr_text,
      status: block.status,
      hasText: !!(block.ocrText || block.ocr_text)
    });

    // Check for text in both field names (camelCase and snake_case)
    const textContent = block.ocrText || block.ocr_text;
    if (!textContent) {
      console.log('❌ No text content found for block');
      return;
    }

    // Prevent double-clicking - check if already generating audio for this block
    if (generatingAudio.has(block.id)) {
      console.log('⏳ Audio already being generated for block:', block.id);
      return;
    }

    // If already playing this block, pause it
    if (currentPlayingBlock === block.id && isPlaying) {
      console.log('⏸️ Pausing currently playing block');
      pauseAudio();
      return;
    }

    // Stop any currently playing audio and clean up listeners
    if (currentAudio) {
      console.log('🛑 Stopping previous audio');
      currentAudio.pause();
      currentAudio.currentTime = 0;
      // Remove all event listeners from previous audio
      currentAudio.removeEventListener('timeupdate', currentAudio._highlightingHandler);
      currentAudio.removeEventListener('play', currentAudio._playHandler);
      currentAudio.removeEventListener('pause', currentAudio._pauseHandler);
      currentAudio.removeEventListener('ended', currentAudio._endedHandler);
    }

    console.log('🔊 Making TTS request for text:', textContent);

    // Add this block to the generating audio set
    setGeneratingAudio(prev => new Set([...prev, block.id]));

    try {
      const response = await fetch(`/api/textblocks/${block.id}/speak`, {
        method: 'POST'
      });

      console.log('📡 TTS API response status:', response.status);

      if (response.ok) {
        const result = await response.json();
        console.log('✅ TTS result received:', result);

        // Play audio with error handling and synchronization
        if (result.audio_url) {
          const fullAudioUrl = result.audio_url;
          console.log('Playing audio from:', fullAudioUrl);
          const audio = new Audio(fullAudioUrl);
          
          // Set current text and alignment for subtitle display
          setCurrentPlayingText(result.text || textContent);
          setCurrentAlignment(result.alignment);
          
          console.log('🎵 Audio setup - text:', result.text, 'alignment:', !!result.alignment);

          audio.addEventListener('error', (e) => {
            console.error('Audio playback error:', e);
            console.error('Audio error details:', audio.error);
          });

          audio.addEventListener('loadstart', () => {
            console.log('Audio loading started');
          });

          audio.addEventListener('canplay', () => {
            console.log('Audio can start playing');
          });

          // Create optimized highlighting handler with requestAnimationFrame
          let animationFrameId = null;
          const highlightingHandler = () => {
            // Cancel any pending animation frame
            if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
            }

            // Use requestAnimationFrame for smoother updates
            animationFrameId = requestAnimationFrame(() => {
              const currentTime = audio.currentTime;
              const playingText = currentPlayingText || (result.text || textContent);

              if (!playingText) return;

              // Robust fallback highlighting using progress
              let charIndex = -1;
              if (isFinite(audio.duration) && audio.duration > 0) {
                const progress = currentTime / audio.duration;
                charIndex = Math.floor(progress * playingText.length);
                charIndex = Math.max(0, Math.min(charIndex, playingText.length - 1));
              }

              // Try precise alignment data if available
              if (result.alignment?.characters) {
                const characters = result.alignment.characters;

                // Binary search for better performance with large texts
                let left = 0;
                let right = characters.length - 1;
                let alignmentIndex = -1;

                while (left <= right) {
                  const mid = Math.floor((left + right) / 2);
                  if (characters[mid].start_time <= currentTime && characters[mid].end_time >= currentTime) {
                    alignmentIndex = mid;
                    break;
                  } else if (characters[mid].end_time < currentTime) {
                    left = mid + 1;
                  } else {
                    right = mid - 1;
                  }
                }

                // Use alignment index if valid and within text bounds
                if (alignmentIndex >= 0 && alignmentIndex < playingText.length) {
                  charIndex = alignmentIndex;
                }
              }

              // Only update if the character index actually changed
              setHighlightedCharIndex((prev) => {
                if (prev !== charIndex) {
                  return charIndex;
                }
                return prev;
              });
            });
          };
          
          // Store handler reference for cleanup
          audio._highlightingHandler = highlightingHandler;
          audio.addEventListener('timeupdate', highlightingHandler);

          const playHandler = () => {
            setIsPlaying(true);
            setCurrentPlayingBlock(block.id);
          };
          
          const pauseHandler = () => {
            setIsPlaying(false);
          };
          
          const endedHandler = () => {
            // Clean up animation frame
            if (animationFrameId) {
              cancelAnimationFrame(animationFrameId);
            }
            setIsPlaying(false);
            setCurrentPlayingBlock(null);
            setHighlightedCharIndex(-1);
            setCurrentAudio(null);
            setCurrentPlayingText('');
            setCurrentAlignment(null);
          };
          
          // Store handler references for cleanup
          audio._playHandler = playHandler;
          audio._pauseHandler = pauseHandler;
          audio._endedHandler = endedHandler;
          
          audio.addEventListener('play', playHandler);
          audio.addEventListener('pause', pauseHandler);
          audio.addEventListener('ended', endedHandler);

          setCurrentAudio(audio);

          // Apply playback speed
          audio.playbackRate = playbackSpeed;
          console.log('🎛️ Audio playback speed set to:', playbackSpeed);

          audio.play().catch(error => {
            console.error('Audio play failed:', error);
          });
        }
      }
    } catch (error) {
      console.error('Error playing text block:', error);
    } finally {
      // Always remove the block from generating audio set when done
      setGeneratingAudio(prev => {
        const newSet = new Set(prev);
        newSet.delete(block.id);
        return newSet;
      });
    }
  };

  const pauseAudio = () => {
    if (currentAudio && isPlaying) {
      currentAudio.pause();
    }
  };

  const resumeAudio = () => {
    if (currentAudio && !isPlaying) {
      currentAudio.play();
    }
  };

  const playTitleText = async (titleText) => {
    // Create a title audio block directly without database interaction
    try {
      console.log('🎵 Playing title text:', titleText);
      
      // Stop any currently playing audio
      if (currentAudio) {
        currentAudio.pause();
      }
      
      // Get TTS directly for title
      const response = await fetch('/api/tts/direct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          text: titleText,
          speed: playbackSpeed
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.audioUrl) {
          // Create and play audio
          const audio = new Audio(result.audioUrl);
          audio.playbackRate = playbackSpeed;
          setCurrentAudio(audio);
          setCurrentPlayingText(titleText);
          setCurrentPlayingBlock('title');
          
          audio.addEventListener('play', () => {
            setIsPlaying(true);
          });
          
          audio.addEventListener('pause', () => {
            setIsPlaying(false);
          });
          
          audio.addEventListener('ended', () => {
            // Clean up animation frame
            if (titleAnimationFrameId) {
              cancelAnimationFrame(titleAnimationFrameId);
            }
            setIsPlaying(false);
            setCurrentPlayingBlock(null);
            setCurrentPlayingText('');
            setHighlightedCharIndex(-1);
          });
          
          // Create optimized highlighting handler for title with requestAnimationFrame
          let titleAnimationFrameId = null;
          const titleHighlightingHandler = () => {
            // Cancel any pending animation frame
            if (titleAnimationFrameId) {
              cancelAnimationFrame(titleAnimationFrameId);
            }

            // Use requestAnimationFrame for smoother updates
            titleAnimationFrameId = requestAnimationFrame(() => {
              const currentTime = audio.currentTime;

              if (!titleText) return;

              // Robust fallback highlighting using progress
              let charIndex = -1;
              if (isFinite(audio.duration) && audio.duration > 0) {
                const progress = currentTime / audio.duration;
                charIndex = Math.floor(progress * titleText.length);
                charIndex = Math.max(0, Math.min(charIndex, titleText.length - 1));
              }

              // Try precise alignment data if available
              if (result.alignment?.characters) {
                const characters = result.alignment.characters;

                // Binary search for better performance
                let left = 0;
                let right = characters.length - 1;
                let alignmentIndex = -1;

                while (left <= right) {
                  const mid = Math.floor((left + right) / 2);
                  if (characters[mid].start_time <= currentTime && characters[mid].end_time >= currentTime) {
                    alignmentIndex = mid;
                    break;
                  } else if (characters[mid].end_time < currentTime) {
                    left = mid + 1;
                  } else {
                    right = mid - 1;
                  }
                }

                // Use alignment index if valid and within text bounds
                if (alignmentIndex >= 0 && alignmentIndex < titleText.length) {
                  charIndex = alignmentIndex;
                }
              }

              // Only update if the character index actually changed
              setHighlightedCharIndex((prev) => {
                if (prev !== charIndex) {
                  return charIndex;
                }
                return prev;
              });
            });
          };
          
          // Store handler reference for cleanup and add listener
          audio._highlightingHandler = titleHighlightingHandler;
          audio.addEventListener('timeupdate', titleHighlightingHandler);
          
          audio.play();
        }
      }
    } catch (error) {
      console.error('Error playing title:', error);
    }
  };


  const handlePageSelect = (pageIndex) => {
    setCurrentPage(pageIndex);
  };

  if (loading) {
    return <div className="book-viewer-loading">Loading book...</div>;
  }

  if (!book || pages.length === 0) {
    return (
      <div className="book-viewer-error">
        <h2>Book not found or no pages available</h2>
        <button onClick={() => navigate('/')} className="back-button" title="Back to Books">
          ←
        </button>
      </div>
    );
  }

  return (
    <div className="book-viewer">
      <div className="book-viewer-header">
        {/* Header simplified - no controls needed */}
      </div>


      <div className="book-viewer-content">
        <div className="page-display">
          <div className="page-container">
            <button
              onClick={detectTextBlocks}
              disabled={isDetecting}
              className="process-button-overlay"
              title={isDetecting ? 'Processing...' : 'Process Text Blocks'}
            >
              {isDetecting ? '⏳' : '⚙'}
            </button>
            <img
              ref={imageRef}
              src={pages[currentPage].imagePath}
              alt={`Page ${currentPage + 1}`}
              className="page-image"
              crossOrigin="anonymous"
              onLoad={() => {
                // Image loaded - ready for manual text detection
                console.log('Image loaded, ready for detection');
              }}
            />

            {/* Real-time subtitle overlay with word-level highlighting */}
            {currentPlayingText && isPlaying && (
              <div className="subtitle-overlay">
                <div className="subtitle-text">
                  {(() => {
                    // Split text into words and process for word-level highlighting
                    const words = currentPlayingText.split(/(\s+)/);
                    let charCounter = 0;
                    let wordCount = 0;
                    const maxWordsPerLine = 8; // Optimal for dyslexic readers

                    return words.map((word, wordIndex) => {
                      // Skip whitespace-only words for highlighting logic
                      const isWhitespace = word.match(/^\s+$/);

                      // Calculate word boundaries
                      const wordStartIndex = charCounter;
                      const wordEndIndex = charCounter + word.length - 1;

                      // Highlight the current word being spoken with good timing
                      const isCurrentWord = !isWhitespace && (
                        highlightedCharIndex >= wordStartIndex &&
                        highlightedCharIndex <= wordEndIndex
                      );
                      const isReadWord = !isWhitespace && wordEndIndex < highlightedCharIndex;

                      charCounter += word.length;

                      return (
                        <span
                          key={wordIndex}
                          className={`subtitle-word ${isReadWord ? 'read-word' : ''} ${isCurrentWord ? 'current-word' : ''}`}
                        >
                          {word}
                        </span>
                      );
                    });
                  })()}
                </div>
              </div>
            )}

            {/* Text block overlays */}
            {console.log('🟢 Rendering', textBlocks.length, 'text block overlays, imageRef:', !!imageRef.current)}
            {textBlocks.map((block) => {
              console.log('🟢 Rendering block:', block.id, 'status:', block.status, 'position:', { x: block.x, y: block.y, width: block.width, height: block.height });
              return (
              <div
                key={block.id}
                className={`text-block-overlay ${
                  processingBlocks.has(block.id) ? 'processing' : ''
                } ${generatingAudio.has(block.id) ? 'generating-audio' : ''} ${block.status === 'completed' ? 'completed' : ''}`}
                style={{
                  left: `${(((block.x * scaleX) + offsetX) / imageRef.current?.naturalWidth * 100) || 0}%`,
                  top: `${(((block.y * scaleY) + offsetY) / imageRef.current?.naturalHeight * 100) || 0}%`,
                  width: `${((block.width * scaleX) / imageRef.current?.naturalWidth * 100) || 0}%`,
                  height: `${((block.height * scaleY) / imageRef.current?.naturalHeight * 100) || 0}%`,
                  cursor: block.status === 'completed' ? 'pointer' : 'default'
                }}
                title={block.status === 'completed' ? (block.ocr_text || 'Click to play audio') : 'Processing...'}
                onClick={() => {
                  if (block.status === 'completed') {
                    playTextBlock(block);
                  }
                }}
              >
                {processingBlocks.has(block.id) && (
                  <div className="processing-indicator">
                    <div className="spinner"></div>
                  </div>
                )}
                {generatingAudio.has(block.id) && (
                  <div className="audio-generating-indicator">
                    <div className="spinner"></div>
                    <span>🎧</span>
                  </div>
                )}
                {block.status === 'completed' && !generatingAudio.has(block.id) && (
                  <div className="clickable-indicator">
                    🎵
                  </div>
                )}
              </div>
              );
            })}
            
            {/* Fixed Audio Player */}
            {currentPlayingBlock && (
              <div className="fixed-audio-player">
                <div className="player-content">
                  <div className="player-text">
                    {currentPlayingText && currentPlayingText.length > 40 
                      ? currentPlayingText.substring(0, 40) + '...' 
                      : currentPlayingText || 'Loading...'}
                  </div>
                  <div className="player-controls">
                    <button
                      className={`player-play-button ${isPlaying ? 'playing' : ''}`}
                      onClick={() => {
                        if (isPlaying) {
                          if (currentAudio) {
                            currentAudio.pause();
                          }
                        } else if (currentAudio) {
                          resumeAudio();
                        }
                      }}
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? '⏸️' : '▶️'}
                    </button>
                    <button
                      className="player-stop-button"
                      onClick={() => {
                        if (currentAudio) {
                          currentAudio.pause();
                          currentAudio.currentTime = 0;
                        }
                        setCurrentPlayingBlock(null);
                        setCurrentPlayingText('');
                        setCurrentAudio(null);
                        setIsPlaying(false);
                        setHighlightedCharIndex(-1);
                      }}
                      title="Stop"
                    >
                      ⏹️
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pages-sidebar">
          <div className="pages-header">
            {(isDetecting || processingBlocks.size > 0) && (
              <div className="detection-progress">
                <div className="detection-spinner"></div>
                <span className="detection-text">
                  {isDetecting ? 'Detecting text...' : `Processing ${processingBlocks.size} blocks...`}
                </span>
              </div>
            )}
          </div>
          <div className="page-thumbnails">
            {pages.map((page, index) => (
              <div
                key={page.id}
                className={`page-thumbnail ${index === currentPage ? 'active' : ''}`}
                onClick={() => handlePageSelect(index)}
              >
                <img
                  src={page.imagePath}
                  alt={`Page ${index + 1}`}
                />
                <div className="page-number">{index + 1}</div>
              </div>
            ))}
          </div>
        </div>
      </div>


      {/* Book Agent Chat */}
      {userPreferences?.elevenlabsAgentId && (
        <>
          <elevenlabs-convai agent-id={userPreferences.elevenlabsAgentId}></elevenlabs-convai>
          <script src="https://unpkg.com/@elevenlabs/convai-widget-embed" async type="text/javascript"></script>
        </>
      )}
    </div>
  );
};

export default BookViewer;