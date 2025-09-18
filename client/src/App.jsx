import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';
import BooksView from './components/BooksView';
import AddBookView from './components/AddBookView';
import BookViewer from './components/BookViewer';

function App() {
  return (
    <Router>
      <div className="App">
        <header className="app-header">
          <h1>TheReader</h1>
        </header>
        <main>
          <Routes>
            <Route path="/" element={<BooksView />} />
            <Route path="/add-book" element={<AddBookView />} />
            <Route path="/book/:bookId" element={<BookViewer />} />
          </Routes>
        </main>
      </div>
    </Router>
  )
}

export default App
