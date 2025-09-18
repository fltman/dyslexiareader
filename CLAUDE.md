# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

TheReader is the ultimate reader application designed specifically for people with dyslexia. It's a full-stack web application built with Node.js/Express backend and React frontend, focusing on accessibility and dyslexia-friendly design patterns.

## Architecture

### Frontend (React + Vite)
- **Location**: `/client/` directory
- **Framework**: React with Vite build tool
- **Styling**: CSS modules with dyslexia-friendly design principles
- **Font**: OpenDyslexic font family for improved readability
- **Components**: Modular component architecture in `/client/src/components/`

### Backend (Node.js + Express)
- **Location**: `/server/` directory
- **Framework**: Express.js with ES modules
- **API**: RESTful API endpoints for book management
- **Data**: Mock data structure (ready for database integration)

### Key Design Principles
- **Accessibility First**: High contrast, large touch targets (min 48px), dyslexia-friendly fonts
- **Reduced Motion**: Respects `prefers-reduced-motion` settings
- **High Contrast**: Supports `prefers-contrast: high` media query
- **Mobile Responsive**: Grid layout adapts to different screen sizes

## Common Commands

```bash
# Install all dependencies (root and client)
npm run install:all

# Start development (both server and client)
npm run dev

# Server only
npm run server:dev

# Client only
npm run client:dev

# Build for production
npm run build

# Start production server
npm start
```

## Project Structure

```
thereader/
├── server/
│   └── index.js          # Express API server
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── BooksView.jsx     # Main books grid view
│   │   │   └── BooksView.css     # Dyslexia-friendly styles
│   │   ├── App.jsx       # Main app component
│   │   └── App.css       # Global dyslexia-friendly styles
│   └── package.json
└── package.json          # Root package with scripts
```

## API Endpoints

- `GET /api/books` - Get all books (supports ?filter= query param)
- `GET /api/books/:id` - Get specific book by ID

## Dyslexia-Friendly Features

- **OpenDyslexic Font**: Specially designed font for dyslexic readers
- **High Contrast Colors**: Strong color contrast for better readability
- **Large Text Sizes**: Minimum 1rem font size throughout
- **Ample Spacing**: Increased line-height and padding for better text separation
- **Clear Visual Hierarchy**: Strong typography hierarchy with bold headings
- **Accessible Touch Targets**: Minimum 48px touch targets for interactive elements

## Current Views

1. **Books View**: Grid layout displaying book collection with filtering capabilities
   - Filter buttons for categorizing books
   - 1:1 aspect ratio cards as per design specifications
   - Add book functionality with "+" card
   - Responsive grid that adapts to screen size