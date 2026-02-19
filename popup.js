class GitHubFYP {
    constructor() {
        this.token = null;
        this.currentUser = null;
        this.followingRepos = [];
        this.discoveredRepos = [];
        this.viewHistory = [];
        this.init();
    }

    async init() {
        await this.loadToken();
        this.setupTabs();
        
        if (this.token) {
            await this.loadFollowingRepos();
            await this.loadDiscoveredRepos();
        } else {
            this.showAuthPrompt();
        }
    }

    async loadToken() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['githubToken'], (result) => {
                this.token = result.githubToken;
                resolve();
            });
        });
    }

    showAuthPrompt() {
        const followingContent = document.getElementById('following-list');
        const discoverContent = document.getElementById('discover-list');
        
        const authHTML = `
            <div class="auth-section">
                <h3 style="margin-bottom: 12px; color: #c9d1d9;">GitHub Authentication Required</h3>
                <p style="font-size: 12px; color: #8b949e; margin-bottom: 16px;">
                    To use GitHub FYP, please authenticate with your GitHub account.
                </p>
                <button class="auth-button" onclick="window.open('https://github.com/login', '_blank')">
                    Login to GitHub
                </button>
                <p style="font-size: 11px; color: #8b949e; margin-top: 12px;">
                    After logging in, paste your token below:
                </p>
                <input type="password" id="token-input" placeholder="GitHub Personal Token" 
                    style="width: 90%; padding: 6px; margin: 8px auto; display: block; background: #0d1117; 
                    border: 1px solid #30363d; color: #c9d1d9; border-radius: 6px; font-size: 12px;">
                <button class="auth-button" onclick="saveToken()">Save Token</button>
            </div>
        `;
        
        followingContent.innerHTML = authHTML;
        discoverContent.innerHTML = authHTML;
    }

    setupTabs() {
        document.querySelectorAll('.tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
                document.querySelectorAll('.content').forEach(c => c.classList.remove('active'));
                
                e.target.classList.add('active');
                const tabName = e.target.getAttribute('data-tab');
                document.getElementById(tabName).classList.add('active');
            });
        });
    }

    async loadFollowingRepos() {
        const loadingEl = document.getElementById('following-loading');
        const listEl = document.getElementById('following-list');
        
        try {
            const response = await fetch('https://api.github.com/user/subscriptions', {
                headers: {
                    'Authorization': `token ${this.token}`,
                    'Accept': 'application/vnd.github.v3+json'
                }
            });

            if (!response.ok) throw new Error('Failed to fetch followed repos');

            const repos = await response.json();
            this.followingRepos = repos.sort((a, b) => 
                new Date(b.updated_at) - new Date(a.updated_at)
            ).slice(0, 20);

            loadingEl.style.display = 'none';
            this.renderRepos(this.followingRepos, listEl);
        } catch (error) {
            loadingEl.innerHTML = `<div class="error">${error.message}</div>`;
        }
    }

    async loadDiscoveredRepos() {
        const loadingEl = document.getElementById('discover-loading');
        const listEl = document.getElementById('discover-list');
        
        try {
            const history = await this.getViewHistory();
            const topics = this.extractTopics(history);
            
            const queries = topics.slice(0, 3).map(topic => 
                `topic:${topic} sort:stars stars:>100`
            );

            if (queries.length === 0) {
                queries.push('sort:stars stars:>1000');
            }

            let repos = [];
            for (const query of queries) {
                const response = await fetch(
                    `https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&per_page=10`,
                    {
                        headers: {
                            'Authorization': `token ${this.token}`,
                            'Accept': 'application/vnd.github.v3+json'
                        }
                    }
                );

                if (response.ok) {
                    const data = await response.json();
                    repos = [...repos, ...data.items];
                }
            }

            repos = [...new Map(repos.map(r => [r.id, r])).values()]
                .filter(r => !this.followingRepos.find(fr => fr.id === r.id))
                .sort((a, b) => b.stargazers_count - a.stargazers_count)
                .slice(0, 20);

            loadingEl.style.display = 'none';
            this.renderRepos(repos, listEl);
        } catch (error) {
            loadingEl.innerHTML = `<div class="error">${error.message}</div>`;
        }
    }

    async getViewHistory() {
        return new Promise((resolve) => {
            chrome.storage.local.get(['viewHistory'], (result) => {
                resolve(result.viewHistory || []);
            });
        });
    }

    extractTopics(history) {
        const topicCount = {};
        
        history.forEach(item => {
            if (item.topics && Array.isArray(item.topics)) {
                item.topics.forEach(topic => {
                    topicCount[topic] = (topicCount[topic] || 0) + 1;
                });
            }
        });

        return Object.entries(topicCount)
            .sort((a, b) => b[1] - a[1])
            .map(([topic]) => topic);
    }

    renderRepos(repos, container) {
        container.innerHTML = repos.map(repo => `
            <div class="repo-card" onclick="openRepo('${repo.html_url}')">
                <div class="repo-header">
                    <img src="${repo.owner.avatar_url}" alt="${repo.owner.login}" class="repo-avatar">
                    <div>
                        <div style="font-size: 12px; color: #8b949e;">${repo.owner.login}</div>
                        <a href="${repo.html_url}" target="_blank" class="repo-name">${repo.name}</a>
                    </div>
                </div>
                <div class="repo-description">${repo.description || 'No description'}</div>
                <div class="repo-meta">
                    <div class="repo-meta-item">⭐ ${repo.stargazers_count}</div>
                    <div class="repo-meta-item">🍴 ${repo.forks_count}</div>
                    ${repo.language ? `<div class="repo-meta-item">📝 ${repo.language}</div>` : ''}
                </div>
            </div>
        `).join('');
    }
}

function openRepo(url) {
    chrome.storage.local.get(['viewHistory'], (result) => {
        let history = result.viewHistory || [];
        
        fetch(url.replace('https://github.com', 'https://api.github.com/repos'))
            .then(r => r.json())
            .then(repo => {
                history.push({
                    ...repo,
                    viewedAt: new Date().toISOString()
                });
                
                if (history.length > 100) history.shift();
                chrome.storage.local.set({ viewHistory: history });
            });
    });
    
    window.open(url, '_blank');
}

function saveToken() {
    const token = document.getElementById('token-input').value.trim();
    if (token) {
        chrome.storage.local.set({ githubToken: token }, () => {
            location.reload();
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new GitHubFYP();
});
