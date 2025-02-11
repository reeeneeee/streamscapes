# Technology Stack

## Frontend Framework
- Next.js 15.1.6
- React 19.0.0
- TypeScript 5

## Styling
- Tailwind CSS 3.4.1
- PostCSS 8

## External Libraries
- wikimedia-streams 3.0.0: Real-time Wikipedia changes streaming
- React DOM 19.0.0

## Development Tools
- TypeScript for type safety
- ESLint for code quality
- Next.js development server

## Architecture Decisions

### Frontend Architecture
- Using Next.js App Router for routing and layout management
- Client-side components for real-time data handling
- Component-based architecture with modular design

### State Management
- React useState for local component state
- useEffect for side effects and data streaming
- Real-time data handling through WebSocket connections

### Type Safety
- TypeScript for static type checking
- Interface definitions for data structures
- Strict type checking enabled

### Performance Considerations
- Limiting change history to 50 items
- Client-side rendering for real-time updates
- WebSocket connection management with error handling
