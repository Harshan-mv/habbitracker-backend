# Habit Tracker - Backend

This is the backend of the Habit Tracker application, built with Node.js, Express, and MongoDB.

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- [MongoDB](https://www.mongodb.com/) (Local or Atlas)
- [npm](https://www.npmjs.com/)

### Installation

1. Navigate to the server directory:
   ```bash
   cd server
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the `server` directory and add the following:
   ```env
   PORT=5000
   MONGO_URI=your_mongodb_connection_string
   JWT_SECRET=your_jwt_secret_key
   ```

### Running the Server

To start the server in development mode (with nodemon):
```bash
npm run dev
```

To start the server in production mode:
```bash
npm start
```

The server will be available at `http://localhost:5000`.
