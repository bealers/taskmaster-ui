# Taskmaster UI

Simple web view to a [Taskmaster AI](https://www.task-master.dev/) database. View, filter, and explore your tasks through a browser interface stright from your project.

## Features

- Task visualization with status indicators
- Tag-based organization for different contexts (master, feature branches, etc.)
- Subtask management with detailed implementation notes
- Markdown document rendering for PRDs, research files, and reports
- Filtering by status, priority, subtasks
- Real-time updates when task files change
- Dark theme interface

## Quick Start

### Prerequisites

- Node.js 18+ 
- A Taskmaster AI project with `.taskmaster/` directory structure

### Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/taskmaster-ui.git
cd taskmaster-ui
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

4. Run from your Taskmaster project directory:
```bash
# Navigate to your project with .taskmaster/ directory
cd /path/to/your/project

# Start the server
node /path/to/taskmaster-ui/dist/server.js
```

5. Open your browser to `http://localhost:3001`

### Alternative Usage

Specify custom path:
```bash
node dist/server.js --taskmaster=/custom/path/to/.taskmaster
```

Run from anywhere (auto-detection):
The server will automatically find your `.taskmaster` directory by walking up from the current directory.

### Development Mode

For development with automatic rebuilding:
```bash
npm run dev
```

## File Structure

The server expects your project to have a Taskmaster directory structure:

```
your-project/
├── .taskmaster/
│   ├── tasks/
│   │   └── tasks.json          # Main tasks file with tag-based organization
│   ├── state.json              # Current tag state
│   ├── docs/                   # PRD documents
│   │   ├── elizify-prd.txt
│   │   └── research/           # Research markdown files
│   └── reports/
│       └── task-complexity-report.json
└── taskmaster-ui/              # This application
```

## Usage

### Viewing Tasks

- Switch Tags: Use the dropdown to change between task contexts (master, feature branches, etc.)
- Filter Tasks: Use the collapsible filters panel to show/hide tasks by status, priority
- Hide Completed: Toggle the "Show Completed Tasks" checkbox to focus on active work
- View Details: Click any task card to see full implementation details and test strategies

### Exploring Documents

The Research & Context panel provides direct access to:
- PRD Documents: Product Requirements Documents rendered as markdown
- Research Files: Timestamped research and findings
- Reports: Complexity analysis and other generated reports

### Subtask Management

- Individual Subtasks: Each subtask appears as a clickable card within parent tasks
- Detailed View: Click any subtask to see full implementation context
- Progress Tracking: Visual status indicators show subtask completion state

## Configuration

### Port Configuration

The server runs on port 3001 by default. Set the `PORT` environment variable to change it:
```bash
PORT=8080 node dist/server.js
```

### Taskmaster Path Override

If your `.taskmaster` directory is in a non-standard location:
```bash
node dist/server.js --taskmaster=/path/to/your/.taskmaster
```

## Development

### Architecture

- Backend: Express.js server with TypeScript
- Frontend: Server-side rendered EJS templates with vanilla JavaScript
- Styling: Custom CSS with dark theme
- Markdown: Marked.js for document rendering
- File Watching: Chokidar for real-time updates

### Adding Features

1. Server Routes: Add new API endpoints in `src/server.ts`
2. Frontend Logic: Modify the JavaScript in `views/tasks-simple.ejs`
3. Styling: Update CSS in the `<style>` section of the EJS template

### API Endpoints

- `GET /` - Main task interface
- `GET /api/tasks` - Get all task data
- `GET /api/tasks/:tag` - Get tasks for specific tag
- `GET /api/document/:filename` - Serve PRD documents as rendered markdown
- `GET /api/research/:filename` - Serve research files as rendered markdown
- `GET /health` - Server health check

## Related Projects

- [Taskmaster AI](https://task-master.dev) - The task management system this UI visualizes

---

Created by [@bealers](https://bealers.com)