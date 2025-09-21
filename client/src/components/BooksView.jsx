import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import './BooksView.css';

const BooksView = () => {
  const [books, setBooks] = useState([]);
  const [filteredBooks, setFilteredBooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [navigating, setNavigating] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteModal, setDeleteModal] = useState({ show: false, book: null });
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    fetchBooks();
  }, []);

  useEffect(() => {
    filterBooks();
  }, [books, searchTerm]);

  const fetchBooks = async () => {
    try {
      const response = await fetch('/api/books', {
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setBooks(data);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching books:', error);
      setLoading(false);
    }
  };

  const filterBooks = () => {
    if (!searchTerm.trim()) {
      setFilteredBooks(books);
      return;
    }

    const filtered = books.filter(book => {
      const searchLower = searchTerm.toLowerCase();
      return (
        // Search in basic metadata
        (book.title && book.title.toLowerCase().includes(searchLower)) ||
        (book.author && book.author.toLowerCase().includes(searchLower)) ||
        (book.category && book.category.toLowerCase().includes(searchLower)) ||
        // Search in keywords
        (book.keywordText && book.keywordText.includes(searchLower)) ||
        // Search in extracted text content from Google Vision
        (book.searchableText && book.searchableText.includes(searchLower))
      );
    });
    setFilteredBooks(filtered);
  };

  const handleDeleteClick = (e, book) => {
    e.stopPropagation(); // Prevent navigation to book viewer
    setDeleteModal({ show: true, book });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal.book) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/books/${deleteModal.book.id}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        // Remove book from local state
        setBooks(prev => prev.filter(b => b.id !== deleteModal.book.id));
        setDeleteModal({ show: false, book: null });
      } else {
        alert('Failed to delete book. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting book:', error);
      alert('Error deleting book. Please try again.');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteModal({ show: false, book: null });
  };

  if (loading) {
    return <div className="loading">Loading books...</div>;
  }

  return (
    <div className="books-view">
      <div className="search-container">
        <input
          type="text"
          placeholder="Search books by title, author, keywords, or content..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="search-input"
        />
        <span className="search-icon">🔍</span>
      </div>

      <div className="books-grid">
        {filteredBooks.map(book => (
          <div
            key={book.id}
            className="book-card"
            onClick={() => navigate(`/book/${book.id}`)}
          >
            <div className="book-cover">
              {book.cover ? (
                <img
                  src={book.cover}
                  alt={book.title || 'Book'}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextElementSibling.style.display = 'flex';
                  }}
                />
              ) : null}
              <div className="book-placeholder" style={{display: book.cover ? 'none' : 'flex'}}>
                📚
              </div>
            </div>
            <div className="book-info">
              <h3>{book.title || 'Processing...'}</h3>
              <p>{book.author || 'Unknown Author'}</p>
              {book.keywords && book.keywords.length > 0 && (
                <div className="book-keywords">
                  {book.keywords.slice(0, 4).map((keyword, index) => (
                    <span key={index} className="keyword-tag">
                      {keyword.emoji} {keyword.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <button
              className="delete-button"
              onClick={(e) => handleDeleteClick(e, book)}
              title="Delete book"
            >
              ×
            </button>
          </div>
        ))}

        <div className="book-card add-book" onClick={() => {
          if (!navigating) {
            setNavigating(true);
            navigate('/add-book');
          }
        }}>
          <div className="add-book-content">
            <span className="plus-icon">+</span>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModal.show && (
        <div className="modal-overlay">
          <div className="modal">
            <div className="modal-header">
              <h2>Delete Book</h2>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete "{deleteModal.book?.title || 'this book'}"?</p>
              <p>This action cannot be undone.</p>
            </div>
            <div className="modal-footer">
              <button
                className="cancel-button"
                onClick={handleDeleteCancel}
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                className="confirm-delete-button"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BooksView;