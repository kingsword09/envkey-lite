// EnvKey Lite Web Application
class EnvKeyApp {
    constructor() {
        this.apiBase = '/api';
        this.token = localStorage.getItem('token');
        this.user = null;
        this.currentPage = 'dashboard';
        
        this.init();
    }

    async init() {
        // Check authentication status
        if (this.token) {
            try {
                await this.loadUserInfo();
                this.showApp();
                // Set up event listeners for authenticated app
                this.setupEventListeners();
                // Load initial data
                await this.loadDashboardData();
            } catch (error) {
                console.error('Failed to load user info:', error);
                localStorage.removeItem('token');
                this.token = null;
                this.showLogin();
            }
        } else {
            this.showLogin();
        }
    }

    setupEventListeners() {
        // Navigation
        document.addEventListener('click', (e) => {
            if (e.target.matches('.nav-link')) {
                e.preventDefault();
                const href = e.target.getAttribute('href');
                if (href && href !== '#') {
                    this.navigate(href);
                }
            }
        });

        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.logout();
            });
        }
    }

    async loadUserInfo() {
        const response = await this.apiCall('/auth/me', 'GET');
        if (response.ok) {
            this.user = await response.json();
            this.updateUserDisplay();
        } else {
            throw new Error('Failed to load user info');
        }
    }

    updateUserDisplay() {
        const userNameEl = document.getElementById('userName');
        if (userNameEl && this.user) {
            userNameEl.textContent = this.user.name || this.user.email;
        }
    }

    async loadDashboardData() {
        try {
            this.showLoading(true);
            
            // Load projects count
            const projectsResponse = await this.apiCall('/projects', 'GET');
            if (projectsResponse.ok) {
                const projects = await projectsResponse.json();
                document.getElementById('projectCount').textContent = projects.length;
                
                // Count environments and variables
                let envCount = 0;
                let varCount = 0;
                
                for (const project of projects) {
                    const envsResponse = await this.apiCall(`/projects/${project.id}/environments`, 'GET');
                    if (envsResponse.ok) {
                        const environments = await envsResponse.json();
                        envCount += environments.length;
                        
                        for (const env of environments) {
                            const varsResponse = await this.apiCall(`/environments/${env.id}/variables`, 'GET');
                            if (varsResponse.ok) {
                                const variables = await varsResponse.json();
                                varCount += variables.length;
                            }
                        }
                    }
                }
                
                document.getElementById('envCount').textContent = envCount;
                document.getElementById('varCount').textContent = varCount;
            }
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            this.showToast('Failed to load dashboard data', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    navigate(path) {
        // Update active nav link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === path) {
                link.classList.add('active');
            }
        });

        // Route to appropriate page
        switch (path) {
            case '/':
                this.showDashboard();
                break;
            case '/projects':
                this.showProjects();
                break;
            case '/profile':
                this.showProfile();
                break;
            default:
                this.showDashboard();
        }
    }

    showDashboard() {
        this.currentPage = 'dashboard';
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="welcome-section">
                <h2>Welcome to EnvKey Lite</h2>
                <p>Manage your environment variables securely and efficiently.</p>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <h3 id="projectCount">0</h3>
                        <p>Projects</p>
                    </div>
                    <div class="stat-card">
                        <h3 id="envCount">0</h3>
                        <p>Environments</p>
                    </div>
                    <div class="stat-card">
                        <h3 id="varCount">0</h3>
                        <p>Variables</p>
                    </div>
                </div>
            </div>
        `;
        this.loadDashboardData();
    }

    showProjects() {
        this.currentPage = 'projects';
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="projects-section">
                <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <h2>Projects</h2>
                    <button class="btn btn-primary" onclick="app.showCreateProject()">
                        Create Project
                    </button>
                </div>
                <div id="projectsList" class="projects-list">
                    <p>Loading projects...</p>
                </div>
            </div>
        `;
        this.loadProjects();
    }

    showProfile() {
        this.currentPage = 'profile';
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="profile-section">
                <h2>Profile Settings</h2>
                
                <!-- User Information Card -->
                <div class="card mb-4">
                    <div class="card-header">
                        <h3 class="card-title">User Information</h3>
                    </div>
                    <div class="card-body">
                        <form id="profileForm">
                            <div class="form-group">
                                <label class="form-label">Name</label>
                                <input type="text" id="profileName" class="form-input" value="${this.user?.name || ''}">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Email</label>
                                <input type="email" id="profileEmail" class="form-input" value="${this.user?.email || ''}" readonly>
                                <small class="text-secondary">Email cannot be changed</small>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Role</label>
                                <input type="text" class="form-input" value="${this.user?.role || ''}" readonly>
                            </div>
                            <button type="submit" class="btn btn-primary">Update Profile</button>
                        </form>
                    </div>
                </div>

                <!-- API Keys Card -->
                <div class="card mb-4">
                    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="card-title">API Keys</h3>
                        <button class="btn btn-primary btn-sm" onclick="app.showCreateApiKey()">Create API Key</button>
                    </div>
                    <div class="card-body">
                        <div id="apiKeysList">
                            <p>Loading API keys...</p>
                        </div>
                    </div>
                </div>

                <!-- Change Password Card -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Change Password</h3>
                    </div>
                    <div class="card-body">
                        <form id="passwordForm">
                            <div class="form-group">
                                <label class="form-label">Current Password</label>
                                <input type="password" id="currentPassword" class="form-input" required>
                            </div>
                            <div class="form-group">
                                <label class="form-label">New Password</label>
                                <input type="password" id="newPassword" class="form-input" required minlength="8">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Confirm New Password</label>
                                <input type="password" id="confirmNewPassword" class="form-input" required>
                            </div>
                            <button type="submit" class="btn btn-primary">Change Password</button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // Set up form handlers
        this.setupProfileHandlers();
        this.loadApiKeys();
    }

    showLogin() {
        // Hide initial loading and app, show login
        const initialLoading = document.getElementById('initialLoading');
        const app = document.getElementById('app');
        
        if (initialLoading) {
            initialLoading.classList.add('hidden');
        }
        if (app) {
            app.classList.add('hidden');
        }

        document.body.innerHTML = `
            <div class="login-container">
                <div class="login-card">
                    <div class="login-header">
                        <h1>EnvKey Lite</h1>
                        <p>Sign in to your account</p>
                    </div>
                    <form id="loginForm" class="login-form">
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" id="email" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Password</label>
                            <input type="password" id="password" class="form-input" required>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">
                            Sign In
                        </button>
                    </form>
                    <div class="login-footer">
                        <p>Don't have an account? <a href="#" id="showRegister">Register</a></p>
                    </div>
                </div>
            </div>
        `;

        // Add login-specific styles
        const style = document.createElement('style');
        style.textContent = `
            .login-container {
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                background-color: var(--background-color);
                padding: 1rem;
            }
            .login-card {
                background-color: var(--surface-color);
                padding: 2rem;
                border-radius: var(--border-radius);
                box-shadow: var(--shadow-lg);
                width: 100%;
                max-width: 400px;
            }
            .login-header {
                text-align: center;
                margin-bottom: 2rem;
            }
            .login-header h1 {
                color: var(--primary-color);
                margin-bottom: 0.5rem;
            }
            .login-form {
                margin-bottom: 1.5rem;
            }
            .login-footer {
                text-align: center;
            }
            .login-footer a {
                color: var(--primary-color);
                text-decoration: none;
            }
        `;
        document.head.appendChild(style);

        // Set up login form handler
        document.getElementById('loginForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Set up register link
        document.getElementById('showRegister').addEventListener('click', (e) => {
            e.preventDefault();
            this.showRegister();
        });
    }

    showRegister() {
        document.body.innerHTML = `
            <div class="login-container">
                <div class="login-card">
                    <div class="login-header">
                        <h1>EnvKey Lite</h1>
                        <p>Create your account</p>
                    </div>
                    <form id="registerForm" class="login-form">
                        <div class="form-group">
                            <label class="form-label">Name</label>
                            <input type="text" id="name" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Email</label>
                            <input type="email" id="email" class="form-input" required>
                        </div>
                        <div class="form-group">
                            <label class="form-label">Password</label>
                            <input type="password" id="password" class="form-input" required minlength="8">
                        </div>
                        <div class="form-group">
                            <label class="form-label">Confirm Password</label>
                            <input type="password" id="confirmPassword" class="form-input" required>
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;">
                            Create Account
                        </button>
                    </form>
                    <div class="login-footer">
                        <p>Already have an account? <a href="#" id="showLogin">Sign In</a></p>
                    </div>
                </div>
            </div>
        `;

        // Set up register form handler
        document.getElementById('registerForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleRegister();
        });

        // Set up login link
        document.getElementById('showLogin').addEventListener('click', (e) => {
            e.preventDefault();
            this.showLogin();
        });
    }

    async handleLogin() {
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;

        try {
            this.showLoading(true);
            
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, password }),
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                localStorage.setItem('token', this.token);
                
                // Reload the page to show the main app
                window.location.reload();
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Login failed', 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            this.showToast('Login failed. Please try again.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handleRegister() {
        const name = document.getElementById('name').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;

        // Validate passwords match
        if (password !== confirmPassword) {
            this.showToast('Passwords do not match', 'error');
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ name, email, password }),
            });

            if (response.ok) {
                const data = await response.json();
                this.token = data.token;
                localStorage.setItem('token', this.token);
                
                this.showToast('Account created successfully!', 'success');
                
                // Reload the page to show the main app
                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Registration failed', 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            this.showToast('Registration failed. Please try again.', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showApp() {
        // Hide initial loading and show the main app
        const initialLoading = document.getElementById('initialLoading');
        const app = document.getElementById('app');
        
        if (initialLoading) {
            initialLoading.classList.add('hidden');
        }
        if (app) {
            app.classList.remove('hidden');
        }
    }

    logout() {
        localStorage.removeItem('token');
        this.token = null;
        this.user = null;
        window.location.reload();
    }

    async apiCall(endpoint, method = 'GET', data = null) {
        const url = `${this.apiBase}${endpoint}`;
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
        };

        if (this.token) {
            options.headers['Authorization'] = `Bearer ${this.token}`;
        }

        if (data) {
            options.body = JSON.stringify(data);
        }

        return fetch(url, options);
    }

    showLoading(show) {
        const overlay = document.getElementById('loadingOverlay');
        if (overlay) {
            overlay.classList.toggle('hidden', !show);
        }
    }

    setupProfileHandlers() {
        // Profile update form
        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleProfileUpdate();
            });
        }

        // Password change form
        const passwordForm = document.getElementById('passwordForm');
        if (passwordForm) {
            passwordForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handlePasswordChange();
            });
        }
    }

    async handleProfileUpdate() {
        const name = document.getElementById('profileName').value;

        try {
            this.showLoading(true);
            
            const response = await this.apiCall('/auth/profile', 'PUT', { name });

            if (response.ok) {
                const updatedUser = await response.json();
                this.user = updatedUser;
                this.updateUserDisplay();
                this.showToast('Profile updated successfully!', 'success');
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to update profile', 'error');
            }
        } catch (error) {
            console.error('Profile update error:', error);
            this.showToast('Failed to update profile', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async handlePasswordChange() {
        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmNewPassword) {
            this.showToast('New passwords do not match', 'error');
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await this.apiCall('/auth/change-password', 'POST', {
                currentPassword,
                newPassword
            });

            if (response.ok) {
                this.showToast('Password changed successfully!', 'success');
                // Clear form
                document.getElementById('passwordForm').reset();
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to change password', 'error');
            }
        } catch (error) {
            console.error('Password change error:', error);
            this.showToast('Failed to change password', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadApiKeys() {
        try {
            const response = await this.apiCall('/auth/api-keys', 'GET');
            
            if (response.ok) {
                const apiKeys = await response.json();
                this.displayApiKeys(apiKeys);
            } else {
                document.getElementById('apiKeysList').innerHTML = '<p>Failed to load API keys</p>';
            }
        } catch (error) {
            console.error('Failed to load API keys:', error);
            document.getElementById('apiKeysList').innerHTML = '<p>Failed to load API keys</p>';
        }
    }

    displayApiKeys(apiKeys) {
        const container = document.getElementById('apiKeysList');
        
        if (apiKeys.length === 0) {
            container.innerHTML = '<p>No API keys found. Create one to get started.</p>';
            return;
        }

        const table = `
            <table class="table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Created</th>
                        <th>Last Used</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${apiKeys.map(key => `
                        <tr>
                            <td>${key.name}</td>
                            <td>${new Date(key.createdAt).toLocaleDateString()}</td>
                            <td>${key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : 'Never'}</td>
                            <td>
                                <button class="btn btn-danger btn-sm" onclick="app.deleteApiKey('${key.id}', '${key.name}')">
                                    Delete
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        `;
        
        container.innerHTML = table;
    }

    showCreateApiKey() {
        const name = prompt('Enter a name for your API key:');
        if (name && name.trim()) {
            this.createApiKey(name.trim());
        }
    }

    async createApiKey(name) {
        try {
            this.showLoading(true);
            
            const response = await this.apiCall('/auth/api-keys', 'POST', { name });

            if (response.ok) {
                const apiKey = await response.json();
                this.showToast('API key created successfully!', 'success');
                
                // Show the API key to the user (only shown once)
                alert(`Your new API key:\n\n${apiKey.key}\n\nPlease save this key securely. You won't be able to see it again.`);
                
                // Reload the API keys list
                this.loadApiKeys();
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to create API key', 'error');
            }
        } catch (error) {
            console.error('API key creation error:', error);
            this.showToast('Failed to create API key', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async deleteApiKey(keyId, keyName) {
        if (!confirm(`Are you sure you want to delete the API key "${keyName}"?`)) {
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await this.apiCall(`/auth/api-keys/${keyId}`, 'DELETE');

            if (response.ok) {
                this.showToast('API key deleted successfully!', 'success');
                this.loadApiKeys();
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to delete API key', 'error');
            }
        } catch (error) {
            console.error('API key deletion error:', error);
            this.showToast('Failed to delete API key', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async loadProjects() {
        try {
            const response = await this.apiCall('/projects', 'GET');
            
            if (response.ok) {
                const projects = await response.json();
                this.displayProjects(projects);
            } else {
                document.getElementById('projectsList').innerHTML = '<p>Failed to load projects</p>';
            }
        } catch (error) {
            console.error('Failed to load projects:', error);
            document.getElementById('projectsList').innerHTML = '<p>Failed to load projects</p>';
        }
    }

    displayProjects(projects) {
        const container = document.getElementById('projectsList');
        
        if (projects.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <h3>No projects yet</h3>
                    <p>Create your first project to get started with environment variable management.</p>
                    <button class="btn btn-primary" onclick="app.showCreateProject()">
                        Create Your First Project
                    </button>
                </div>
            `;
            return;
        }

        const projectsGrid = `
            <div class="projects-grid">
                ${projects.map(project => `
                    <div class="project-card card">
                        <div class="card-header">
                            <h3 class="card-title">${project.name}</h3>
                            <div class="project-actions">
                                <button class="btn btn-secondary btn-sm" onclick="app.showProjectDetails('${project.id}')">
                                    View
                                </button>
                                <button class="btn btn-secondary btn-sm" onclick="app.showEditProject('${project.id}')">
                                    Edit
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="app.deleteProject('${project.id}', '${project.name}')">
                                    Delete
                                </button>
                            </div>
                        </div>
                        <div class="card-body">
                            <p class="project-description">${project.description || 'No description'}</p>
                            <div class="project-meta">
                                <small class="text-secondary">
                                    Created: ${new Date(project.createdAt).toLocaleDateString()}
                                </small>
                            </div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        
        container.innerHTML = projectsGrid;
    }

    showCreateProject() {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="create-project-section">
                <div class="section-header" style="margin-bottom: 2rem;">
                    <h2>Create New Project</h2>
                    <button class="btn btn-secondary" onclick="app.showProjects()">
                        Back to Projects
                    </button>
                </div>
                
                <div class="card">
                    <div class="card-body">
                        <form id="createProjectForm">
                            <div class="form-group">
                                <label class="form-label">Project Name *</label>
                                <input type="text" id="projectName" class="form-input" required 
                                       placeholder="Enter project name">
                            </div>
                            <div class="form-group">
                                <label class="form-label">Description</label>
                                <textarea id="projectDescription" class="form-input" rows="3" 
                                          placeholder="Enter project description (optional)"></textarea>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">Create Project</button>
                                <button type="button" class="btn btn-secondary" onclick="app.showProjects()">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // Set up form handler
        document.getElementById('createProjectForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleCreateProject();
        });
    }

    async handleCreateProject() {
        const name = document.getElementById('projectName').value.trim();
        const description = document.getElementById('projectDescription').value.trim();

        if (!name) {
            this.showToast('Project name is required', 'error');
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await this.apiCall('/projects', 'POST', {
                name,
                description: description || undefined
            });

            if (response.ok) {
                const project = await response.json();
                this.showToast('Project created successfully!', 'success');
                this.showProjectDetails(project.id);
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to create project', 'error');
            }
        } catch (error) {
            console.error('Project creation error:', error);
            this.showToast('Failed to create project', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async showProjectDetails(projectId) {
        try {
            this.showLoading(true);
            
            // Load project details and environments
            const [projectResponse, environmentsResponse] = await Promise.all([
                this.apiCall(`/projects/${projectId}`, 'GET'),
                this.apiCall(`/projects/${projectId}/environments`, 'GET')
            ]);

            if (projectResponse.ok && environmentsResponse.ok) {
                const project = await projectResponse.json();
                const environments = await environmentsResponse.json();
                this.displayProjectDetails(project, environments);
            } else {
                this.showToast('Failed to load project details', 'error');
                this.showProjects();
            }
        } catch (error) {
            console.error('Failed to load project details:', error);
            this.showToast('Failed to load project details', 'error');
            this.showProjects();
        } finally {
            this.showLoading(false);
        }
    }

    displayProjectDetails(project, environments) {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="project-details-section">
                <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h2>${project.name}</h2>
                        <p class="text-secondary">${project.description || 'No description'}</p>
                    </div>
                    <div>
                        <button class="btn btn-secondary" onclick="app.showEditProject('${project.id}')">
                            Edit Project
                        </button>
                        <button class="btn btn-secondary" onclick="app.showProjects()">
                            Back to Projects
                        </button>
                    </div>
                </div>

                <!-- Environments Section -->
                <div class="card mb-4">
                    <div class="card-header" style="display: flex; justify-content: space-between; align-items: center;">
                        <h3 class="card-title">Environments</h3>
                        <button class="btn btn-primary btn-sm" onclick="app.showCreateEnvironment('${project.id}')">
                            Create Environment
                        </button>
                    </div>
                    <div class="card-body">
                        <div id="environmentsList">
                            ${this.renderEnvironmentsList(environments, project.id)}
                        </div>
                    </div>
                </div>

                <!-- Project Settings -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Project Information</h3>
                    </div>
                    <div class="card-body">
                        <div class="project-info-grid">
                            <div class="info-item">
                                <label>Project ID</label>
                                <code>${project.id}</code>
                            </div>
                            <div class="info-item">
                                <label>Created</label>
                                <span>${new Date(project.createdAt).toLocaleString()}</span>
                            </div>
                            <div class="info-item">
                                <label>Last Updated</label>
                                <span>${new Date(project.updatedAt).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    renderEnvironmentsList(environments, projectId) {
        if (environments.length === 0) {
            return `
                <div class="empty-state">
                    <p>No environments created yet.</p>
                    <button class="btn btn-primary btn-sm" onclick="app.showCreateEnvironment('${projectId}')">
                        Create First Environment
                    </button>
                </div>
            `;
        }

        return `
            <div class="environments-grid">
                ${environments.map(env => `
                    <div class="environment-card">
                        <div class="env-header">
                            <h4>${env.name}</h4>
                            <div class="env-actions">
                                <button class="btn btn-primary btn-sm" onclick="app.showEnvironmentVariables('${env.id}')">
                                    Manage Variables
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="app.deleteEnvironment('${env.id}', '${env.name}')">
                                    Delete
                                </button>
                            </div>
                        </div>
                        <div class="env-meta">
                            <small class="text-secondary">
                                Created: ${new Date(env.createdAt).toLocaleDateString()}
                            </small>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    showCreateEnvironment(projectId) {
        const name = prompt('Enter environment name (e.g., development, staging, production):');
        if (name && name.trim()) {
            this.createEnvironment(projectId, name.trim());
        }
    }

    async createEnvironment(projectId, name) {
        try {
            this.showLoading(true);
            
            const response = await this.apiCall(`/projects/${projectId}/environments`, 'POST', { name });

            if (response.ok) {
                this.showToast('Environment created successfully!', 'success');
                this.showProjectDetails(projectId);
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to create environment', 'error');
            }
        } catch (error) {
            console.error('Environment creation error:', error);
            this.showToast('Failed to create environment', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async deleteEnvironment(envId, envName) {
        if (!confirm(`Are you sure you want to delete the environment "${envName}"? This will also delete all environment variables.`)) {
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await this.apiCall(`/environments/${envId}`, 'DELETE');

            if (response.ok) {
                this.showToast('Environment deleted successfully!', 'success');
                // Refresh current project view
                window.location.reload();
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to delete environment', 'error');
            }
        } catch (error) {
            console.error('Environment deletion error:', error);
            this.showToast('Failed to delete environment', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async showEnvironmentVariables(envId) {
        try {
            this.showLoading(true);
            
            // Load environment details and variables
            const [envResponse, variablesResponse] = await Promise.all([
                this.apiCall(`/environments/${envId}`, 'GET'),
                this.apiCall(`/environments/${envId}/variables`, 'GET')
            ]);

            if (envResponse.ok && variablesResponse.ok) {
                const environment = await envResponse.json();
                const variables = await variablesResponse.json();
                this.displayEnvironmentVariables(environment, variables);
            } else {
                this.showToast('Failed to load environment variables', 'error');
            }
        } catch (error) {
            console.error('Failed to load environment variables:', error);
            this.showToast('Failed to load environment variables', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async deleteProject(projectId, projectName) {
        if (!confirm(`Are you sure you want to delete the project "${projectName}"? This will delete all environments and variables.`)) {
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await this.apiCall(`/projects/${projectId}`, 'DELETE');

            if (response.ok) {
                this.showToast('Project deleted successfully!', 'success');
                this.showProjects();
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to delete project', 'error');
            }
        } catch (error) {
            console.error('Project deletion error:', error);
            this.showToast('Failed to delete project', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showEditProject(projectId) {
        // For now, just show project details
        this.showProjectDetails(projectId);
        this.showToast('Project editing will be enhanced soon', 'warning');
    }

    displayEnvironmentVariables(environment, variables) {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="env-variables-section">
                <div class="section-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem;">
                    <div>
                        <h2>${environment.name} Environment</h2>
                        <p class="text-secondary">Manage environment variables</p>
                    </div>
                    <div>
                        <button class="btn btn-secondary" onclick="app.showProjects()">
                            Back to Projects
                        </button>
                    </div>
                </div>

                <!-- Variable Management Tools -->
                <div class="card mb-4">
                    <div class="card-header">
                        <h3 class="card-title">Variable Management</h3>
                    </div>
                    <div class="card-body">
                        <div class="variable-tools">
                            <button class="btn btn-primary" onclick="app.showAddVariable('${environment.id}')">
                                Add Variable
                            </button>
                            <button class="btn btn-secondary" onclick="app.showBulkImport('${environment.id}')">
                                Bulk Import
                            </button>
                            <button class="btn btn-secondary" onclick="app.exportVariables('${environment.id}')">
                                Export Variables
                            </button>
                            <div class="search-box">
                                <input type="text" id="variableSearch" class="form-input" 
                                       placeholder="Search variables..." 
                                       onkeyup="app.filterVariables()">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Variables List -->
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Environment Variables (${variables.length})</h3>
                    </div>
                    <div class="card-body">
                        <div id="variablesList">
                            ${this.renderVariablesList(variables, environment.id)}
                        </div>
                    </div>
                </div>
            </div>
        `;

        // Store current environment and variables for filtering
        this.currentEnvironment = environment;
        this.currentVariables = variables;
    }

    renderVariablesList(variables, envId) {
        if (variables.length === 0) {
            return `
                <div class="empty-state">
                    <h3>No variables yet</h3>
                    <p>Add your first environment variable to get started.</p>
                    <button class="btn btn-primary" onclick="app.showAddVariable('${envId}')">
                        Add First Variable
                    </button>
                </div>
            `;
        }

        return `
            <div class="variables-table-container">
                <table class="table variables-table">
                    <thead>
                        <tr>
                            <th>Key</th>
                            <th>Value</th>
                            <th>Type</th>
                            <th>Description</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${variables.map(variable => `
                            <tr data-key="${variable.key.toLowerCase()}">
                                <td>
                                    <code class="variable-key">${variable.key}</code>
                                    ${variable.sensitive ? '<span class="sensitive-badge">Sensitive</span>' : ''}
                                </td>
                                <td>
                                    <div class="variable-value">
                                        ${variable.sensitive ? 
                                            `<span class="masked-value">••••••••</span>
                                             <button class="btn-link" onclick="app.toggleVariableValue('${variable.id}')">
                                                Show
                                             </button>` :
                                            `<code>${this.truncateValue(variable.value)}</code>`
                                        }
                                    </div>
                                </td>
                                <td>
                                    <span class="variable-type ${variable.encrypted ? 'encrypted' : 'plain'}">
                                        ${variable.encrypted ? 'Encrypted' : 'Plain'}
                                    </span>
                                </td>
                                <td>
                                    <span class="variable-description">
                                        ${variable.description || '-'}
                                    </span>
                                </td>
                                <td>
                                    <div class="variable-actions">
                                        <button class="btn btn-secondary btn-sm" 
                                                onclick="app.editVariable('${variable.id}')">
                                            Edit
                                        </button>
                                        <button class="btn btn-danger btn-sm" 
                                                onclick="app.deleteVariable('${variable.id}', '${variable.key}')">
                                            Delete
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    truncateValue(value, maxLength = 50) {
        if (value.length <= maxLength) return value;
        return value.substring(0, maxLength) + '...';
    }

    filterVariables() {
        const searchTerm = document.getElementById('variableSearch').value.toLowerCase();
        const rows = document.querySelectorAll('.variables-table tbody tr');
        
        rows.forEach(row => {
            const key = row.getAttribute('data-key');
            if (key.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    showAddVariable(envId) {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="add-variable-section">
                <div class="section-header" style="margin-bottom: 2rem;">
                    <h2>Add Environment Variable</h2>
                    <button class="btn btn-secondary" onclick="app.showEnvironmentVariables('${envId}')">
                        Back to Variables
                    </button>
                </div>
                
                <div class="card">
                    <div class="card-body">
                        <form id="addVariableForm">
                            <div class="form-group">
                                <label class="form-label">Variable Key *</label>
                                <input type="text" id="variableKey" class="form-input" required 
                                       placeholder="e.g., DATABASE_URL, API_KEY"
                                       pattern="[A-Z_][A-Z0-9_]*"
                                       title="Use uppercase letters, numbers, and underscores only">
                                <small class="text-secondary">Use uppercase letters, numbers, and underscores</small>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Variable Value *</label>
                                <textarea id="variableValue" class="form-input" rows="3" required 
                                          placeholder="Enter the variable value"></textarea>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Description</label>
                                <input type="text" id="variableDescription" class="form-input" 
                                       placeholder="Optional description">
                            </div>
                            <div class="form-group">
                                <label class="form-label">
                                    <input type="checkbox" id="variableSensitive"> 
                                    Mark as sensitive (will be encrypted)
                                </label>
                                <small class="text-secondary">Sensitive variables are encrypted and masked in the UI</small>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">Add Variable</button>
                                <button type="button" class="btn btn-secondary" 
                                        onclick="app.showEnvironmentVariables('${envId}')">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // Set up form handler
        document.getElementById('addVariableForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleAddVariable(envId);
        });
    }

    async handleAddVariable(envId) {
        const key = document.getElementById('variableKey').value.trim().toUpperCase();
        const value = document.getElementById('variableValue').value;
        const description = document.getElementById('variableDescription').value.trim();
        const sensitive = document.getElementById('variableSensitive').checked;

        if (!key || !value) {
            this.showToast('Key and value are required', 'error');
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await this.apiCall(`/environments/${envId}/variables`, 'POST', {
                key,
                value,
                description: description || undefined,
                sensitive
            });

            if (response.ok) {
                this.showToast('Variable added successfully!', 'success');
                this.showEnvironmentVariables(envId);
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to add variable', 'error');
            }
        } catch (error) {
            console.error('Variable creation error:', error);
            this.showToast('Failed to add variable', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async deleteVariable(variableId, variableKey) {
        if (!confirm(`Are you sure you want to delete the variable "${variableKey}"?`)) {
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await this.apiCall(`/variables/${variableId}`, 'DELETE');

            if (response.ok) {
                this.showToast('Variable deleted successfully!', 'success');
                // Refresh the current environment variables view
                if (this.currentEnvironment) {
                    this.showEnvironmentVariables(this.currentEnvironment.id);
                }
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to delete variable', 'error');
            }
        } catch (error) {
            console.error('Variable deletion error:', error);
            this.showToast('Failed to delete variable', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    editVariable(variableId) {
        // For now, show a simple message
        this.showToast('Variable editing will be enhanced soon', 'warning');
    }

    async toggleVariableValue(variableId) {
        // This would show/hide sensitive values
        this.showToast('Value visibility toggle will be implemented', 'warning');
    }

    showBulkImport(envId) {
        const content = document.getElementById('content');
        content.innerHTML = `
            <div class="bulk-import-section">
                <div class="section-header" style="margin-bottom: 2rem;">
                    <h2>Bulk Import Variables</h2>
                    <button class="btn btn-secondary" onclick="app.showEnvironmentVariables('${envId}')">
                        Back to Variables
                    </button>
                </div>
                
                <div class="card">
                    <div class="card-header">
                        <h3 class="card-title">Import Format</h3>
                    </div>
                    <div class="card-body">
                        <p>Enter variables in KEY=VALUE format, one per line:</p>
                        <form id="bulkImportForm">
                            <div class="form-group">
                                <textarea id="bulkVariables" class="form-input" rows="10" 
                                          placeholder="DATABASE_URL=postgresql://localhost:5432/mydb
API_KEY=your-api-key-here
DEBUG=true
PORT=3000"></textarea>
                            </div>
                            <div class="form-group">
                                <label class="form-label">
                                    <input type="checkbox" id="bulkSensitive"> 
                                    Mark all as sensitive
                                </label>
                            </div>
                            <div class="form-actions">
                                <button type="submit" class="btn btn-primary">Import Variables</button>
                                <button type="button" class="btn btn-secondary" 
                                        onclick="app.showEnvironmentVariables('${envId}')">
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>
        `;

        // Set up form handler
        document.getElementById('bulkImportForm').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleBulkImport(envId);
        });
    }

    async handleBulkImport(envId) {
        const bulkText = document.getElementById('bulkVariables').value.trim();
        const sensitive = document.getElementById('bulkSensitive').checked;

        if (!bulkText) {
            this.showToast('Please enter variables to import', 'error');
            return;
        }

        // Parse the bulk text
        const lines = bulkText.split('\n').filter(line => line.trim());
        const variables = [];

        for (const line of lines) {
            const [key, ...valueParts] = line.split('=');
            if (key && valueParts.length > 0) {
                variables.push({
                    key: key.trim().toUpperCase(),
                    value: valueParts.join('=').trim(),
                    sensitive
                });
            }
        }

        if (variables.length === 0) {
            this.showToast('No valid variables found', 'error');
            return;
        }

        try {
            this.showLoading(true);
            
            const response = await this.apiCall(`/environments/${envId}/variables/bulk`, 'POST', {
                variables
            });

            if (response.ok) {
                const result = await response.json();
                this.showToast(`Successfully imported ${result.imported} variables!`, 'success');
                this.showEnvironmentVariables(envId);
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to import variables', 'error');
            }
        } catch (error) {
            console.error('Bulk import error:', error);
            this.showToast('Failed to import variables', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    async exportVariables(envId) {
        try {
            this.showLoading(true);
            
            const response = await this.apiCall(`/environments/${envId}/variables/export`, 'GET');

            if (response.ok) {
                const exportData = await response.text();
                
                // Create and download file
                const blob = new Blob([exportData], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${this.currentEnvironment?.name || 'environment'}-variables.env`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                window.URL.revokeObjectURL(url);
                
                this.showToast('Variables exported successfully!', 'success');
            } else {
                const error = await response.json();
                this.showToast(error.error?.message || 'Failed to export variables', 'error');
            }
        } catch (error) {
            console.error('Export error:', error);
            this.showToast('Failed to export variables', 'error');
        } finally {
            this.showLoading(false);
        }
    }

    showToast(message, type = 'success') {
        const container = document.getElementById('toastContainer');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        // Remove toast after 5 seconds
        setTimeout(() => {
            toast.remove();
        }, 5000);
    }
}

// Initialize the application
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new EnvKeyApp();
});