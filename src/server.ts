import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import chokidar from 'chokidar';
import { fileURLToPath } from 'url';
import { marked } from 'marked';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface Subtask {
  id: number;
  title: string;
  description: string;
  details?: string;
  status: string;
  dependencies: (string | number)[];
  parentTaskId: number;
}

interface Task {
  id: number;
  title: string;
  description: string;
  details: string;
  testStrategy: string;
  status: string;
  dependencies: (string | number)[];
  priority: string;
  subtasks: Subtask[];
}

interface TaggedTasks {
  [tagName: string]: {
    tasks: Task[];
    metadata: {
      created: string;
      updated: string;
      description: string;
    };
  };
}

interface TaskmasterState {
  currentTag: string;
  lastSwitched: string;
  branchTagMapping: Record<string, string>;
  migrationNoticeShown: boolean;
}

interface HierarchyNode {
  id: number;
  title: string;
  description: string;
  details: string;
  testStrategy: string;
  status: string;
  dependencies: (string | number)[];
  priority: string;
  subtasks: Subtask[];
  children: any[];
  type: 'task' | 'subtask';
}

interface HierarchyLink {
  source: string | number;
  target: number;
  type: string;
}

interface HierarchyData {
  nodes: HierarchyNode[];
  links: HierarchyLink[];
}

class TaskVisualizationServer {
  private app: express.Application;
  private port: number = 3001;
  private tasksPath: string;
  private statePath: string;
  private cachedTasks: TaggedTasks | null = null;
  private cachedState: TaskmasterState | null = null;

  constructor() {
    this.app = express();
    
    // Auto-detect .taskmaster directory
    const taskmasterDir = this.findTaskmasterDirectory();
    this.tasksPath = path.join(taskmasterDir, 'tasks/tasks.json');
    this.statePath = path.join(taskmasterDir, 'state.json');
    
    this.setupMarkdown();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupFileWatcher();
  }

  private findTaskmasterDirectory(): string {
    // Check for command line argument first
    const customPath = process.argv.find(arg => arg.startsWith('--taskmaster='));
    if (customPath) {
      const specified = customPath.split('=')[1];
      if (fs.existsSync(specified)) {
        console.log(`📁 Using specified Taskmaster directory: ${specified}`);
        return specified;
      } else {
        console.warn(`⚠️  Specified path not found: ${specified}, falling back to auto-detection`);
      }
    }

    // Auto-detect by walking up from current working directory
    let currentDir = process.cwd();
    
    while (currentDir !== path.dirname(currentDir)) { // Stop at filesystem root
      const taskmasterPath = path.join(currentDir, '.taskmaster');
      if (fs.existsSync(taskmasterPath)) {
        console.log(`📁 Found Taskmaster directory: ${taskmasterPath}`);
        return taskmasterPath;
      }
      currentDir = path.dirname(currentDir);
    }

    // Fallback to current directory + .taskmaster
    const fallback = path.join(process.cwd(), '.taskmaster');
    console.log(`📁 No .taskmaster found, using: ${fallback}`);
    return fallback;
  }

  private setupMarkdown(): void {
    // Configure marked options
    marked.setOptions({
      gfm: true,
      breaks: true
    });
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, '../public')));
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(__dirname, '../views'));
  }

  private setupRoutes(): void {
    // Main simple task view route
    this.app.get('/', async (req, res) => {
      try {
        const tasksData = this.loadTasks();
        const stateData = this.loadState();
        const currentTag = req.query.tag as string || stateData?.currentTag || 'master';
        
        res.render('tasks-simple', { 
          tasksData,
          stateData,
          currentTag,
          availableTags: Object.keys(tasksData || {}),
          serverInfo: {
            port: this.port,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Error rendering tasks:', error);
        res.status(500).send('Error loading task data');
      }
    });

    // Original visualization route
    this.app.get('/viz', async (req, res) => {
      try {
        const tasksData = this.loadTasks();
        const stateData = this.loadState();
        const currentTag = req.query.tag as string || stateData?.currentTag || 'master';
        
        res.render('tasks', { 
          tasksData,
          stateData,
          currentTag,
          availableTags: Object.keys(tasksData || {}),
          serverInfo: {
            port: this.port,
            timestamp: new Date().toISOString()
          }
        });
      } catch (error) {
        console.error('Error rendering tasks:', error);
        res.status(500).send('Error loading task data');
      }
    });

    // API endpoint to get all task data
    this.app.get('/api/tasks', (req, res) => {
      try {
        const tasksData = this.loadTasks();
        const stateData = this.loadState();
        res.json({ tasks: tasksData, state: stateData });
      } catch (error) {
        console.error('Error loading task data:', error);
        res.status(500).json({ error: 'Failed to load task data' });
      }
    });

    // API endpoint to get tasks for a specific tag
    this.app.get('/api/tasks/:tag', (req, res) => {
      try {
        const tasksData = this.loadTasks();
        const tag = req.params.tag;
        
        if (tasksData && tasksData[tag]) {
          res.json(tasksData[tag]);
        } else {
          res.status(404).json({ error: `Tag '${tag}' not found` });
        }
      } catch (error) {
        console.error('Error loading task data for tag:', error);
        res.status(500).json({ error: 'Failed to load task data' });
      }
    });

    // API endpoint to get task hierarchy for visualization
    this.app.get('/api/hierarchy/:tag', (req, res) => {
      try {
        const tasksData = this.loadTasks();
        const tag = req.params.tag;
        
        if (tasksData && tasksData[tag]) {
          const hierarchy = this.buildTaskHierarchy(tasksData[tag].tasks);
          res.json(hierarchy);
        } else {
          res.status(404).json({ error: `Tag '${tag}' not found` });
        }
      } catch (error) {
        console.error('Error building task hierarchy:', error);
        res.status(500).json({ error: 'Failed to build task hierarchy' });
      }
    });

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        tasksFileExists: fs.existsSync(this.tasksPath),
        stateFileExists: fs.existsSync(this.statePath)
      });
    });

    // Research files API
    this.app.get('/api/research-files', (req, res) => {
      try {
        const researchDir = path.join(path.dirname(this.tasksPath), 'docs/research');
        if (!fs.existsSync(researchDir)) {
          return res.json([]);
        }

        const files = fs.readdirSync(researchDir)
          .filter(file => file.endsWith('.md'))
          .map(file => ({
            name: file,
            displayName: file.replace(/\.md$/, '').replace(/^\d{4}-\d{2}-\d{2}_/, '').replace(/-/g, ' ')
          }));

        res.json(files);
      } catch (error) {
        console.error('Error loading research files:', error);
        res.status(500).json({ error: 'Failed to load research files' });
      }
    });

    // Serve research documents
    this.app.get('/api/research/:filename', (req, res) => {
      try {
        const filename = req.params.filename;
        const filePath = path.join(path.dirname(this.tasksPath), 'docs/research', filename);
        
        if (!fs.existsSync(filePath)) {
          return res.status(404).send('Research file not found');
        }

        const content = fs.readFileSync(filePath, 'utf8');
        
        // If it's a markdown file, render it
        if (filename.endsWith('.md')) {
          const html = marked(content);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.send(html);
        } else {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.send(content);
        }
      } catch (error) {
        console.error('Error serving research file:', error);
        res.status(500).send('Error loading research file');
      }
    });

    // Serve PRD documents
    this.app.get('/api/document/:filename', (req, res) => {
      try {
        const filename = req.params.filename;
        const filePath = path.join(path.dirname(this.tasksPath), 'docs', filename);
        
        if (!fs.existsSync(filePath)) {
          return res.status(404).send('Document not found');
        }

        const content = fs.readFileSync(filePath, 'utf8');
        
        // If it's a markdown file, render it
        if (filename.endsWith('.md') || filename.endsWith('.txt')) {
          const html = marked(content);
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.send(html);
        } else {
          res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          res.send(content);
        }
      } catch (error) {
        console.error('Error serving document:', error);
        res.status(500).send('Error loading document');
      }
    });

    // Serve complexity report
    this.app.get('/api/complexity-report', (req, res) => {
      try {
        const reportPath = path.join(path.dirname(this.tasksPath), 'reports/task-complexity-report.json');
        
        if (!fs.existsSync(reportPath)) {
          return res.status(404).json({ error: 'Complexity report not found' });
        }

        const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        res.json(report);
      } catch (error) {
        console.error('Error loading complexity report:', error);
        res.status(500).json({ error: 'Failed to load complexity report' });
      }
    });
  }

  private setupFileWatcher(): void {
    // Watch for changes to tasks.json and state.json
    const watcher = chokidar.watch([this.tasksPath, this.statePath], {
      persistent: true,
      ignoreInitial: true
    });

    watcher.on('change', (filePath) => {
      console.log(`File changed: ${filePath}`);
      // Clear cache to force reload
      this.cachedTasks = null;
      this.cachedState = null;
    });

    console.log(`Watching for changes: ${this.tasksPath}, ${this.statePath}`);
  }

  private loadTasks(): TaggedTasks | null {
    if (this.cachedTasks) {
      return this.cachedTasks;
    }

    try {
      if (!fs.existsSync(this.tasksPath)) {
        console.warn(`Tasks file not found: ${this.tasksPath}`);
        return null;
      }

      const fileContent = fs.readFileSync(this.tasksPath, 'utf8');
      this.cachedTasks = JSON.parse(fileContent) as TaggedTasks;
      return this.cachedTasks;
    } catch (error) {
      console.error('Error loading tasks:', error);
      return null;
    }
  }

  private loadState(): TaskmasterState | null {
    if (this.cachedState) {
      return this.cachedState;
    }

    try {
      if (!fs.existsSync(this.statePath)) {
        console.warn(`State file not found: ${this.statePath}`);
        return null;
      }

      const fileContent = fs.readFileSync(this.statePath, 'utf8');
      this.cachedState = JSON.parse(fileContent) as TaskmasterState;
      return this.cachedState;
    } catch (error) {
      console.error('Error loading state:', error);
      return null;
    }
  }

  private buildTaskHierarchy(tasks: Task[]): HierarchyData {
    // Create a map for quick lookup
    const taskMap = new Map<number, HierarchyNode>();
    
    // Initialize all tasks in the map
    tasks.forEach(task => {
      taskMap.set(task.id, {
        ...task,
        children: [],
        type: 'task'
      });
    });

    // Add subtasks as children
    tasks.forEach(task => {
      if (task.subtasks && task.subtasks.length > 0) {
        const parentNode = taskMap.get(task.id);
        if (parentNode) {
          task.subtasks.forEach(subtask => {
            parentNode.children.push({
              ...subtask,
              type: 'subtask',
              children: []
            });
          });
        }
      }
    });

    // Build dependency relationships
    const hierarchyData: HierarchyData = {
      nodes: Array.from(taskMap.values()),
      links: []
    };

    // Add dependency links
    tasks.forEach(task => {
      if (task.dependencies && task.dependencies.length > 0) {
        task.dependencies.forEach(depId => {
          hierarchyData.links.push({
            source: depId,
            target: task.id,
            type: 'dependency'
          });
        });
      }
    });

    return hierarchyData;
  }

  public start(): void {
    this.app.listen(this.port, () => {
      console.log('Taskmaster Visualization Server started!');
      console.log(`View tasks at: http://localhost:${this.port}`);
      console.log(`API available at: http://localhost:${this.port}/api/tasks`);
      console.log(`Taskmaster directory: ${path.dirname(this.tasksPath)}`);
      console.log(`Tasks file: ${this.tasksPath}`);
      console.log(`Current tag: ${this.loadState()?.currentTag || 'unknown'}`);
      
      // Show available tags
      const tasks = this.loadTasks();
      if (tasks) {
        const tags = Object.keys(tasks);
        console.log(`🏷️  Available tags: ${tags.join(', ')}`);
        
        // Show task counts
        tags.forEach(tag => {
          const taskCount = tasks[tag]?.tasks?.length || 0;
          console.log(`   - ${tag}: ${taskCount} tasks`);
        });
      }
      
      console.log('\n💡 Usage:');
      console.log('   Run from your project directory: node taskmaster-ui/dist/server.js');
      console.log('   Or specify path: node dist/server.js --taskmaster=/path/to/.taskmaster');
    });
  }
}

// Start the server
const server = new TaskVisualizationServer();
server.start(); 