chrome.runtime.onInstalled.addListener(() => {
    console.log('GitHub FYP extension installed');
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'LOG_VIEW') {
        chrome.storage.local.get(['viewHistory'], (result) => {
            let history = result.viewHistory || [];
            history.push({
                url: request.url,
                title: request.title,
                topics: request.topics,
                viewedAt: new Date().toISOString()
            });
            
            if (history.length > 200) history.shift();
            chrome.storage.local.set({ viewHistory: history });
            sendResponse({ success: true });
        });
        return true;
    }
});