import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './AddBookView.css';

const AddBookView = () => {
  const [qrCode, setQrCode] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [bookId, setBookId] = useState('');
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [mobileUrl, setMobileUrl] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!initializing) {
      initializeBook();
    }
  }, []);

  useEffect(() => {
    if (sessionId) {
      // Poll for page updates every 2 seconds
      const pollInterval = setInterval(pollForUpdates, 2000);
      return () => clearInterval(pollInterval);
    }
  }, [sessionId]);

  const initializeBook = async () => {
    if (initializing) return;

    try {
      setInitializing(true);
      const response = await fetch('http://localhost:5001/api/books', {
        method: 'POST'
      });
      const data = await response.json();

      setQrCode(data.qrCode);
      setSessionId(data.sessionId);
      setBookId(data.bookId);
      setMobileUrl(data.mobileUrl);
      setLoading(false);
    } catch (error) {
      console.error('Error initializing book:', error);
      setLoading(false);
    } finally {
      setInitializing(false);
    }
  };

  const pollForUpdates = async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`http://localhost:5001/api/sessions/${sessionId}/status`);
      const data = await response.json();

      if (data.pages && data.pages.length !== pages.length) {
        setPages(data.pages);
      }

      // Check if processing is complete
      if (data.status === 'completed') {
        navigate('/');
      }
    } catch (error) {
      console.error('Error polling updates:', error);
    }
  };

  const handleDone = async () => {
    if (pages.length === 0) {
      alert('Please scan at least one page before finishing.');
      return;
    }

    try {
      setProcessing(true);
      const response = await fetch(`http://localhost:5001/api/sessions/${sessionId}/complete`, {
        method: 'POST'
      });

      if (response.ok) {
        // Navigate back to books view
        navigate('/');
      } else {
        alert('Error processing book. Please try again.');
        setProcessing(false);
      }
    } catch (error) {
      console.error('Error completing book:', error);
      alert('Error processing book. Please try again.');
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="add-book-view">
        <div className="loading">Setting up book scanning...</div>
      </div>
    );
  }

  return (
    <div className="add-book-view">
      <div className="add-book-header">
        <button
          className="back-button"
          onClick={() => navigate('/')}
          disabled={processing}
        >
          ← Back to Books
        </button>
        <h1>Add New Book</h1>
      </div>

      <div className="add-book-content">
        <div className="qr-section">
          <div className="qr-container">
            <h2>Scan with your phone</h2>
            <div className="qr-code">
              {qrCode ? (
                <img src={qrCode} alt="QR Code for mobile scanning" />
              ) : (
                <div className="qr-placeholder">Loading QR code...</div>
              )}
            </div>
            <p className="qr-instructions">
              Scan this QR code with your phone's camera to start taking photos of book pages
            </p>
            {mobileUrl && (
              <div className="mobile-url">
                <p className="url-label">Or visit this URL on your phone:</p>
                <code className="url-text">{mobileUrl}</code>
              </div>
            )}
          </div>
        </div>

        <div className="pages-section">
          <div className="pages-header">
            <h2>Pages ({pages.length})</h2>
            {pages.length > 0 && (
              <button
                className="done-button"
                onClick={handleDone}
                disabled={processing}
              >
                {processing ? 'Processing with AI...' : 'Done'}
              </button>
            )}
          </div>

          <div className="pages-list">
            {pages.length === 0 ? (
              <div className="no-pages">
                <div className="no-pages-icon">📱</div>
                <h3>No pages yet</h3>
                <p>Use your phone to scan the QR code and start taking photos</p>
              </div>
            ) : (
              pages.map((page, index) => (
                <div key={page.id} className="page-item">
                  <div className="page-number">Page {page.page_number}</div>
                  <div className="page-preview">
                    <img
                      src={`http://localhost:5001${page.image_path}`}
                      alt={`Page ${page.page_number}`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>

          {pages.length > 0 && (
            <div className="scan-status">
              <div className="status-indicator active">
                <div className="pulse"></div>
                Scanning active - Continue taking photos on your phone
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddBookView;