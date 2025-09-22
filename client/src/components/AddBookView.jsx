import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLocalization } from '../contexts/LocalizationContext';
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
  const [processingProgress, setProcessingProgress] = useState({
    show: false,
    currentStep: '',
    stepsCompleted: 0,
    totalSteps: 0,
    details: ''
  });
  const navigate = useNavigate();
  const { t } = useLocalization();

  const initializeBook = useCallback(async () => {
    if (initializing) return;

    try {
      setInitializing(true);
      const response = await fetch('/api/books', {
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
  }, [initializing]);

  const pollForUpdates = useCallback(async () => {
    if (!sessionId) return;

    try {
      const response = await fetch(`/api/sessions/${sessionId}/status`);
      const data = await response.json();

      if (data.pages && data.pages.length !== pages.length) {
        setPages(data.pages);
      }

      // Update progress if processing
      if (data.status === 'processing' && data.progress) {
        setProcessingProgress({
          show: true,
          currentStep: data.progress.currentStep || t('addBook.processing'),
          stepsCompleted: data.progress.stepsCompleted || 0,
          totalSteps: data.progress.totalSteps || 1,
          details: data.progress.details || ''
        });
      }

      // Check if processing is complete
      if (data.status === 'completed') {
        setProcessingProgress({ show: false, currentStep: '', stepsCompleted: 0, totalSteps: 0, details: '' });
        navigate('/');
      }
    } catch (error) {
      console.error('Error polling updates:', error);
    }
  }, [sessionId, pages.length, t, navigate]);

  useEffect(() => {
    if (!initializing) {
      initializeBook();
    }
  }, [initializeBook, initializing]);

  useEffect(() => {
    if (sessionId) {
      // Poll for page updates every 2 seconds
      const pollInterval = setInterval(pollForUpdates, 2000);
      return () => clearInterval(pollInterval);
    }
  }, [sessionId, pollForUpdates]);


  const handleDone = async () => {
    if (pages.length === 0) {
      alert(t('addBook.scanAtLeastOnePage'));
      return;
    }

    try {
      setProcessing(true);

      // Start the backend processing - progress will be tracked via polling
      const response = await fetch(`/api/sessions/${sessionId}/complete`, {
        method: 'POST'
      });

      if (!response.ok) {
        alert(t('addBook.processError'));
        setProcessing(false);
        setProcessingProgress({ show: false, currentStep: '', stepsCompleted: 0, totalSteps: 0, details: '' });
      }
      // Note: Navigation will happen automatically via pollForUpdates when status becomes 'completed'
    } catch (error) {
      console.error('Error completing book:', error);
      alert(t('addBook.processError'));
      setProcessing(false);
      setProcessingProgress({ show: false, currentStep: '', stepsCompleted: 0, totalSteps: 0, details: '' });
    }
  };

  if (loading) {
    return (
      <div className="add-book-view">
        <div className="loading">{t('addBook.settingUp')}</div>
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
          ←
        </button>
      </div>

      <div className="add-book-content">
        <div className="qr-section">
          <div className="qr-container">
            <h2>{t('addBook.scanWithPhone')}</h2>
            <div className="qr-code">
              {qrCode ? (
                <img src={qrCode} alt={t('addBook.qrCodeAlt')} />
              ) : (
                <div className="qr-placeholder">{t('addBook.loadingQR')}</div>
              )}
            </div>
            <p className="qr-instructions">
              {t('addBook.qrInstructions')}
            </p>
            {mobileUrl && (
              <div className="mobile-url">
                <p className="url-label">{t('addBook.orVisitUrl')}</p>
                <a href={mobileUrl} target="_blank" rel="noopener noreferrer" className="url-text">
                  {mobileUrl}
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="pages-section">
          <div className="pages-header">
            <h2>{t('addBook.pages', { count: pages.length })}</h2>
            {pages.length > 0 && (
              <button
                className="done-button"
                onClick={handleDone}
                disabled={processing}
              >
                {processing ? t('addBook.processingWithAI') : t('common.done')}
              </button>
            )}
          </div>

          <div className="pages-list">
            {pages.length === 0 ? (
              <div className="no-pages">
                <div className="no-pages-icon">📱</div>
                <h3>{t('addBook.noPagesYet')}</h3>
                <p>{t('addBook.scanQRStart')}</p>
              </div>
            ) : (
              pages.map((page, index) => (
                <div key={page.id} className="page-item">
                  <div className="page-number">{t('addBook.pageNumber', { number: page.pageNumber || (index + 1) })}</div>
                  <div className="page-preview">
                    <img
                      src={page.imagePath}
                      alt={t('addBook.pageNumber', { number: page.pageNumber || (index + 1) })}
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
                {t('addBook.scanningActive')}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Progress Modal */}
      {processingProgress.show && (
        <div className="processing-modal-overlay">
          <div className="processing-modal">
            <h2>{t('addBook.processingBook')}</h2>
            <div className="progress-container">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${(processingProgress.stepsCompleted / processingProgress.totalSteps) * 100}%` }}
                />
              </div>
              <div className="progress-text">
                {t('addBook.progressSteps', {
                  completed: processingProgress.stepsCompleted,
                  total: processingProgress.totalSteps
                })}
              </div>
            </div>
            <div className="progress-current-step">
              <div className="step-spinner"></div>
              <h3>{processingProgress.currentStep}</h3>
            </div>
            <div className="progress-details">
              {processingProgress.details}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddBookView;