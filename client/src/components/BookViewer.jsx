import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import './BookViewer.css';

const BookViewer = () => {
  const { bookId } = useParams();
  const navigate = useNavigate();
  const imageRef = useRef(null);

  const [book, setBook] = useState(null);
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [textBlocks, setTextBlocks] = useState([]);
  const [isDetecting, setIsDetecting] = useState(false);
  const [processingBlocks, setProcessingBlocks] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [scaleX, setScaleX] = useState(1.0);
  const [scaleY, setScaleY] = useState(1.0);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [showScalingControls, setShowScalingControls] = useState(false);
  const [currentAudio, setCurrentAudio] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentPlayingBlock, setCurrentPlayingBlock] = useState(null);
  const [highlightedCharIndex, setHighlightedCharIndex] = useState(-1);
  const [currentPlayingText, setCurrentPlayingText] = useState('');
  const [currentAlignment, setCurrentAlignment] = useState(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(() => {
    // Load saved speed preference from localStorage
    const saved = localStorage.getItem('readerPlaybackSpeed');
    return saved ? parseFloat(saved) : 1.0;
  });

  useEffect(() => {
    if (bookId) {
      fetchBook();
    }
  }, [bookId]);

  useEffect(() => {
    if (pages.length > 0) {
      fetchTextBlocks(pages[currentPage].id);
    }
  }, [currentPage, pages]);

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

  const fetchTextBlocks = async (pageId) => {
    try {
      const response = await fetch(`/api/pages/${pageId}/textblocks`);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const blocks = await response.json();
      setTextBlocks(blocks);
      
      // Automatically detect text blocks if none exist for this page
      if (blocks.length === 0 && !isDetecting) {
        console.log('🔍 No text blocks found for page, auto-detecting...');
        detectTextBlocksAutomatically(pageId);
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
          // Blocks are already saved by the backend, refresh text blocks for current page only
          if (pages[currentPage]?.id === pageId) {
            setTextBlocks(result.blocks);
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
        fetchTextBlocks(pages[currentPage].id);
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

    // If already playing this block, pause it
    if (currentPlayingBlock === block.id && isPlaying) {
      console.log('⏸️ Pausing currently playing block');
      pauseAudio();
      return;
    }

    // Stop any currently playing audio
    if (currentAudio) {
      console.log('🛑 Stopping previous audio');
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }

    console.log('🔊 Making TTS request for text:', textContent);

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

          // Handle synchronized highlighting
          audio.addEventListener('timeupdate', () => {
            if (result.alignment?.characters && result.text) {
              const currentTime = audio.currentTime;
              const characters = result.alignment.characters;
              
              // Consistency guard: ensure text and alignment lengths match
              if (characters.length !== result.text.length) {
                console.warn('⚠️ Text/alignment length mismatch, disabling character highlighting');
                setHighlightedCharIndex(-1);
                return;
              }

              // Find the character being spoken at current time
              let charIndex = -1;
              for (let i = 0; i < characters.length; i++) {
                if (characters[i].start_time <= currentTime && characters[i].end_time >= currentTime) {
                  charIndex = i;
                  break;
                }
              }
              setHighlightedCharIndex(charIndex);
            }
          });

          audio.addEventListener('play', () => {
            setIsPlaying(true);
            setCurrentPlayingBlock(block.id);
          });

          audio.addEventListener('pause', () => {
            setIsPlaying(false);
          });

          audio.addEventListener('ended', () => {
            setIsPlaying(false);
            setCurrentPlayingBlock(null);
            setHighlightedCharIndex(-1);
            setCurrentAudio(null);
            setCurrentPlayingText('');
            setCurrentAlignment(null);
          });

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

  const changePlaybackSpeed = (speed) => {
    setPlaybackSpeed(speed);
    localStorage.setItem('readerPlaybackSpeed', speed.toString());
    
    // Apply speed to currently playing audio
    if (currentAudio) {
      currentAudio.playbackRate = speed;
      console.log('🎛️ Playback speed changed to:', speed);
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
        <button onClick={() => navigate('/')} className="back-button">
          ← Back to Books
        </button>
      </div>
    );
  }

  return (
    <div className="book-viewer">
      <div className="book-viewer-header">
        <button onClick={() => navigate('/')} className="back-button">
          ← Back to Books
        </button>
        <div className="book-info">
          <h1>{book.title}</h1>
          <p>Page {currentPage + 1} of {pages.length}</p>
        </div>
        <div className="header-controls">
          <button
            onClick={detectTextBlocks}
            disabled={isDetecting}
            className="detect-button"
          >
{isDetecting ? 'Detecting...' : '🔄 Re-detect Text Blocks'}
          </button>
          <div className="speed-controls">
            <label htmlFor="speed-selector" className="speed-label">🎚️ Speed:</label>
            <select 
              id="speed-selector"
              value={playbackSpeed.toString()} 
              onChange={(e) => changePlaybackSpeed(parseFloat(e.target.value))}
              className="speed-selector"
              title="Adjust playback speed"
            >
              <option value="0.5">0.5x (Slower)</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x (Normal)</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x (Faster)</option>
            </select>
          </div>
          <button
            onClick={() => setShowScalingControls(!showScalingControls)}
            className="scaling-toggle-button"
          >
            ⚙️ Adjust Scaling
          </button>
        </div>
      </div>

      {showScalingControls && (
        <div className="scaling-controls">
          <div className="scaling-control">
            <label htmlFor="scaleX">X Scale: {scaleX.toFixed(2)}</label>
            <input
              id="scaleX"
              type="range"
              min="0.5"
              max="2.0"
              step="0.01"
              value={scaleX}
              onChange={(e) => setScaleX(parseFloat(e.target.value))}
              className="scale-slider"
            />
          </div>
          <div className="scaling-control">
            <label htmlFor="scaleY">Y Scale: {scaleY.toFixed(2)}</label>
            <input
              id="scaleY"
              type="range"
              min="0.5"
              max="2.0"
              step="0.01"
              value={scaleY}
              onChange={(e) => setScaleY(parseFloat(e.target.value))}
              className="scale-slider"
            />
          </div>
          <div className="scaling-control">
            <label htmlFor="offsetX">X Offset: {offsetX}px</label>
            <input
              id="offsetX"
              type="range"
              min="-200"
              max="200"
              step="1"
              value={offsetX}
              onChange={(e) => setOffsetX(parseInt(e.target.value))}
              className="offset-slider"
            />
          </div>
          <div className="scaling-control">
            <label htmlFor="offsetY">Y Offset: {offsetY}px</label>
            <input
              id="offsetY"
              type="range"
              min="-200"
              max="200"
              step="1"
              value={offsetY}
              onChange={(e) => setOffsetY(parseInt(e.target.value))}
              className="offset-slider"
            />
          </div>
          <div className="scaling-control">
            <button
              onClick={() => {
                setScaleX(1.0);
                setScaleY(1.0);
                setOffsetX(0);
                setOffsetY(0);
              }}
              className="reset-scaling-button"
            >
              Reset All
            </button>
          </div>
        </div>
      )}

      <div className="book-viewer-content">
        <div className="page-display">
          <div className="page-container">
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

            {/* Real-time subtitle overlay */}
            {currentPlayingText && isPlaying && (
              <div className="subtitle-overlay">
                <div className="subtitle-text">
                  {currentPlayingText.split('').map((char, index) => (
                    <span
                      key={index}
                      className={`subtitle-char ${index === highlightedCharIndex ? 'highlighted-char' : ''}`}
                    >
                      {char}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Text block overlays */}
            {textBlocks.map((block) => (
              <div
                key={block.id}
                className={`text-block-overlay ${
                  processingBlocks.has(block.id) ? 'processing' : ''
                } ${block.status === 'completed' ? 'completed' : ''}`}
                style={{
                  left: `${(((block.x * scaleX) + offsetX) / imageRef.current?.naturalWidth * 100) || 0}%`,
                  top: `${(((block.y * scaleY) + offsetY) / imageRef.current?.naturalHeight * 100) || 0}%`,
                  width: `${((block.width * scaleX) / imageRef.current?.naturalWidth * 100) || 0}%`,
                  height: `${((block.height * scaleY) / imageRef.current?.naturalHeight * 100) || 0}%`,
                }}
                title={block.ocr_text || 'Click to play audio'}
              >
                {processingBlocks.has(block.id) && (
                  <div className="processing-indicator">
                    <div className="spinner"></div>
                  </div>
                )}
                {(block.status === 'completed' || block.ocrText) && (
                  <div className="audio-controls">
                    <button
                      className={`play-button ${currentPlayingBlock === block.id ? 'playing' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        playTextBlock(block);
                      }}
                      title={currentPlayingBlock === block.id && isPlaying ? 'Pause audio' : 'Play audio'}
                    >
                      {currentPlayingBlock === block.id && isPlaying ? '⏸️' : '▶️'}
                    </button>
                    {currentPlayingBlock === block.id && !isPlaying && currentAudio && (
                      <button
                        className="resume-button"
                        onClick={(e) => {
                          e.stopPropagation();
                          resumeAudio();
                        }}
                        title="Resume audio"
                      >
                        ▶️
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="pages-sidebar">
          <h3>Pages</h3>
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
    </div>
  );
};

export default BookViewer;