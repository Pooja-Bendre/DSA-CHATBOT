const container = document.querySelector(".container");
const chatsContainer = document.querySelector(".chats-container");
const promptForm = document.querySelector(".prompt-form");
const promptInput = promptForm.querySelector(".prompt-input");
const fileInput = promptForm.querySelector("#file-input");
const fileUploadWrapper = promptForm.querySelector(".file-upload-wrapper");
const filePreview = fileUploadWrapper.querySelector(".file-preview");
const addFileBtn = promptForm.querySelector("#add-file-btn");
const cancelFileBtn = promptForm.querySelector("#cancel-file-btn");
const deleteChatsBtn = document.querySelector("#delete-chats-btn");
const themeToggleBtn = document.querySelector("#theme-toggle-btn");
const sendBtn = document.getElementById("send-btn");
const voiceBtn = document.getElementById("voice-btn");

const API_KEY = 'AIzaSyCqYTM1P4o214efV_4WvwEzo2OlXt87lrk';
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;

let chatHistory = [];
const userData = { message: "", file: {} };
let typingInterval = null;
let abortController = null;

// function to create a message element
const createMsgElement = (content, ...classes) => {
    const div = document.createElement("div");
    div.classList.add("message", ...classes);
    div.innerHTML = content;
    return div;
};

// Always scroll chats to bottom (using scrollIntoView for last message)
const scrollToBottom = () => {
    const lastMsg = chatsContainer.lastElementChild;
    if (lastMsg) lastMsg.scrollIntoView({ behavior: "smooth", block: "end" });
};

// Format Gemini response: bullet points, code blocks, copy button, show more, and image
function formatBotResponse(text) {
    // Convert image markdown ![alt](url) to <img>
    text = text.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (m, alt, url) => {
        return `<img src="${escapeHtml(url)}" alt="${escapeHtml(alt)}" style="max-width:320px;max-height:220px;border-radius:10px;margin:10px 0;display:block;">`;
    });

    // Convert code blocks (```...```) to <pre><code>...</code></pre>
    text = text.replace(/```([\s\S]*?)```/g, function(match, code) {
        return `<pre><code>${escapeHtml(code.trim())}</code></pre>`;
    });

    // Convert inline code (`...`) to <code>...</code>
    text = text.replace(/`([^`]+)`/g, function(match, code) {
        return `<code>${escapeHtml(code)}</code>`;
    });

    // Convert lines starting with "-" or "*" to bullet points
    const lines = text.split('\n');
    let inList = false;
    let html = '';
    for (let line of lines) {
        if (/^\s*[-*]\s+/.test(line)) {
            if (!inList) {
                html += '<ul>';
                inList = true;
            }
            html += `<li>${line.replace(/^\s*[-*]\s+/, '')}</li>`;
        } else {
            if (inList) {
                html += '</ul>';
                inList = false;
            }
            if (line.trim() !== '') html += `<div>${line.trim()}</div>`;
        }
    }
    if (inList) html += '</ul>';

    // Collapse after 8 lines, show all by default, allow expand
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    const allLines = Array.from(tempDiv.childNodes);
    if (allLines.length > 8) {
        const wrapper = document.createElement('div');
        wrapper.className = 'show-more-wrapper';

        // Short part
        const shortDiv = document.createElement('div');
        shortDiv.className = 'show-more-short';
        allLines.slice(0, 8).forEach(node => shortDiv.appendChild(node.cloneNode(true)));

        // Hidden part
        const moreDiv = document.createElement('div');
        moreDiv.className = 'show-more-hidden';
        allLines.slice(8).forEach(node => moreDiv.appendChild(node.cloneNode(true)));
        moreDiv.style.display = "none";

        // Button
        const showBtn = document.createElement('button');
        showBtn.textContent = "Show More";
        showBtn.className = "show-more-btn";
        showBtn.onclick = () => {
            moreDiv.style.display = "";
            showBtn.style.display = "none";
            scrollToBottom();
            addCopyButtons(wrapper); // Ensure copy buttons in revealed content
        };

        wrapper.appendChild(shortDiv);
        wrapper.appendChild(showBtn);
        wrapper.appendChild(moreDiv);

        return wrapper.outerHTML;
    }
    return tempDiv.innerHTML;
}
function escapeHtml(text) {
    return text.replace(/[&<>"']/g, function(m) {
        return ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[m];
    });
}

// Typing effect for bot (show all at once, then add copy/show more)
const typingEffect = (text, textElement, botMsgDiv, onStop) => {
    const formatted = formatBotResponse(text);
    textElement.innerHTML = formatted;
    addCopyButtons(textElement);
    // Attach event for dynamically created Show More button
    textElement.querySelectorAll('.show-more-btn').forEach(btn => {
        btn.onclick = function() {
            const moreDiv = btn.parentElement.querySelector('.show-more-hidden');
            if (moreDiv) moreDiv.style.display = "";
            btn.style.display = "none";
            scrollToBottom();
            addCopyButtons(textElement); // Ensure copy buttons in revealed content
        };
    });
    botMsgDiv.classList.remove("loading");
    if (onStop) onStop();
    scrollToBottom();
};

function addCopyButtons(parent) {
    parent.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.copy-btn')) return;
        const btn = document.createElement('button');
        btn.textContent = 'Copy';
        btn.className = 'copy-btn';
        btn.type = 'button';
        btn.onclick = (e) => {
            e.preventDefault();
            const code = pre.querySelector('code');
            if (code) {
                navigator.clipboard.writeText(code.innerText);
                btn.textContent = 'Copied!';
                setTimeout(() => btn.textContent = 'Copy', 1200);
            }
        };
        pre.style.position = "relative";
        pre.appendChild(btn);
    });
}

const stopTypingEffect = () => {
    if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
    }
};

// Move avatar to top after first message
let avatarMoved = false;

// DSA/programming-only question checker
function isDSAQuestion(text) {
    const dsaKeywords = [
        "array", "linked list", "stack", "queue", "tree", "graph", "algorithm",
        "search", "sort", "recursion", "dynamic programming", "greedy", "hash",
        "heap", "trie", "binary", "bfs", "dfs", "matrix", "string", "data structure",
        "dsa", "leetcode", "gfg", "interviewbit", "problem", "coding", "programming",
        "python", "java", "c++", "javascript", "function", "variable", "class", "object", "recursion", "pointer"
    ];
    const lower = text.toLowerCase();
    return dsaKeywords.some(word => lower.includes(word));
}

// Random rude responses for non-DSA questions
const rudeResponses = [
    "Are you kidding me? This is a DSA-only zone. Ask only DSA/programming questions or get lost!",
    "Seriously? Only DSA and programming questions are allowed here. Don't waste my time.",
    "This is not your personal assistant. Ask DSA or programming stuff only!",
    "Stop! Only DSA/programming questions are entertained. Try again.",
    "Wrong place! Ask something about DSA or programming, not this nonsense."
];

// --- MAIN FORM SUBMIT HANDLER ---
const handleFormSubmit = (e) => {
    e.preventDefault();
    const userMessage = promptInput.value.trim();
    if (!userMessage && !(userData.file && userData.file.data)) return;

    // Show user message (regardless of content for the user's view)
    let userMsgHTML = '<p class="message-text"></p>';
    if (userData.file && userData.file.data) {
        if (userData.file.mime_type.startsWith("image/")) {
            userMsgHTML += `<img src="${userData.file.preview}" class="file-preview" style="max-width:120px;max-height:120px;border-radius:8px;margin-top:8px;display:block;">`;
        } else {
            userMsgHTML += `<span class="material-symbols-rounded file-icon" style="font-size:2rem;vertical-align:middle;">description</span>
            <span style="font-size:0.9rem;">${userData.file.filename}</span>`;
        }
    }
    const userMsgDiv = createMsgElement(userMsgHTML, "user-message");
    userMsgDiv.querySelector(".message-text").textContent = userMessage;
    chatsContainer.appendChild(userMsgDiv);
    scrollToBottom();
    promptInput.value = ""; // clear the input field

    // DSA restriction check
    if (!isDSAQuestion(userMessage)) {
        // Show random rude bot message
        const rudeMsg = rudeResponses[Math.floor(Math.random() * rudeResponses.length)];
        const botMsgHTML = `<img src="chatbot.png" class="avatar"><p class="message-text">${rudeMsg}</p>`;
        const botMsgDiv = createMsgElement(botMsgHTML, "bot-message");
        chatsContainer.appendChild(botMsgDiv);
        scrollToBottom();
        userData.file = {};
        fileUploadWrapper.classList.remove("active", "img-attached", "file-attached");
        filePreview.src = "#";
        filePreview.style.display = "none";
        promptInput.focus();
        return;
    }

    // Move avatar to top after first message
    if (!avatarMoved) {
        const avatar = document.getElementById("header-avatar");
        if (avatar) avatar.classList.add("moved");
        avatarMoved = true;
    }

    // Store message and file for API
    const messageForAPI = userMessage;
    const fileForAPI = { ...userData.file };

    setTimeout(() => {
        const botMsgHTML = `<img src="chatbot.png" class="avatar"><p class="message-text">Just a sec...</p>`;
        const botMsgDiv = createMsgElement(botMsgHTML, "bot-message", "loading");
        const stopBtn = document.createElement("button");
        stopBtn.textContent = "Stop";
        stopBtn.className = "stop-btn";
        stopBtn.onclick = () => {
            if (abortController) abortController.abort();
            stopTypingEffect();
            stopBtn.remove();
            sendBtn.disabled = false;
        };
        botMsgDiv.appendChild(stopBtn);

        chatsContainer.appendChild(botMsgDiv);
        scrollToBottom();
        sendBtn.disabled = true;
        // Pass both text and file to Gemini
        generateResponse(botMsgDiv, stopBtn, messageForAPI, fileForAPI);
    }, 600);

    // Reset file data and UI
    userData.file = {};
    fileUploadWrapper.classList.remove("active", "img-attached", "file-attached");
    filePreview.src = "#";
    filePreview.style.display = "none";
    promptInput.focus();
};

// --- SEND BOTH TEXT AND IMAGE TO GEMINI ---
const generateResponse = async (botMsgDiv, stopBtn, userMessage, userFile) => {
    const textElement = botMsgDiv.querySelector(".message-text");
    const parts = [];

    // Add text part if available
    if (userMessage) {
        parts.push({ text: userMessage });
    }
    // Add file part if available
    if (userFile && userFile.data) {
        parts.push({
            inline_data: {
                mime_type: userFile.mime_type,
                data: userFile.data
            }
        });
    }

    // Push the user's message and file to chat history
    chatHistory.push({
        role: "user",
        parts
    });

    abortController = new AbortController();

    try {
        const response = await fetch(API_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ contents: chatHistory }),
            signal: abortController.signal
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error?.message || "Unknown error");
        }
        
        // Extract the response text from the API response
        let responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
        
        // Push the model's response to chat history
        chatHistory.push({
            role: "model",
            parts: [{ text: responseText }]
        });
        
        // Format and type out the response as HTML
        typingEffect(responseText, textElement, botMsgDiv, () => {
            if (stopBtn) stopBtn.remove();
            sendBtn.disabled = false;
            scrollToBottom();
        });

    } catch (error) {
        textElement.innerHTML = `<div style="color:red;">${error.name === "AbortError" ? "Response stopped." : "Error: " + error.message}</div>`;
        sendBtn.disabled = false;
        scrollToBottom();
    } finally {
        abortController = null;
        if (stopBtn) stopBtn.remove();
        sendBtn.disabled = false;
        scrollToBottom();
    }
};

// Download chat as txt
const downloadBtn = document.getElementById("download-chats-btn");
if (downloadBtn) {
    downloadBtn.addEventListener("click", () => {
        let text = "";
        chatsContainer.querySelectorAll(".message").forEach(msg => {
            const isUser = msg.classList.contains("user-message");
            const who = isUser ? "You" : "DSA Sensei";
            let msgText = msg.querySelector(".message-text")?.textContent || "";
            text += `${who}: ${msgText}\n`;
        });
        const blob = new Blob([text], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "dsa_sensei_chat.txt";
        a.click();
        URL.revokeObjectURL(a.href);
    });
}

// Voice input
let recognition;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    voiceBtn.onclick = () => {
        recognition.start();
        voiceBtn.classList.add("active");
    };
    recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        promptInput.value = transcript;
        voiceBtn.classList.remove("active");
    };
    recognition.onerror = () => voiceBtn.classList.remove("active");
    recognition.onend = () => voiceBtn.classList.remove("active");
} else {
    voiceBtn.disabled = true;
    voiceBtn.title = "Voice input not supported";
}

// File upload logic
fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;

    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();
    reader.onload = (e) => {
        fileInput.value = ""; // Clear the file input
        const base64String = e.target.result.split(",")[1];
        filePreview.src = e.target.result;
        fileUploadWrapper.classList.add("active", isImage ? "img-attached" : "file-attached");
        filePreview.style.display = isImage ? "inline-block" : "none";
        userData.file = {
            filename: file.name,
            data: base64String,
            mime_type: file.type,
            preview: e.target.result // DataURL for images
        };
    };
    reader.readAsDataURL(file);
});

cancelFileBtn.addEventListener("click", () => {
    fileUploadWrapper.classList.remove("active", "img-attached", "file-attached");
    filePreview.src = "#";
    filePreview.style.display = "none";
    userData.file = {};
});

addFileBtn.addEventListener("click", () => fileInput.click());
promptForm.addEventListener("submit", handleFormSubmit);

// Delete chats button
deleteChatsBtn.addEventListener("click", () => {
    chatsContainer.innerHTML = "";
    chatHistory = [];
    avatarMoved = false; // Reset avatar position
    const avatar = document.getElementById("header-avatar");
    if (avatar) avatar.classList.remove("moved");
    scrollToBottom();
});

// Theme toggle functionality
themeToggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("dark-theme");
    if (document.body.classList.contains("dark-theme")) {
        themeToggleBtn.textContent = "light_mode";
    } else {
        themeToggleBtn.textContent = "dark_mode";
    }
});

// --- Scroll Down Button Feature ---
const scrollDownBtn = document.getElementById("scroll-down-btn");

// Helper: Is user at (or near) bottom?
function isAtBottom() {
    return (chatsContainer.scrollTop + chatsContainer.clientHeight) >= (chatsContainer.scrollHeight - 40);
}

// Show/hide scroll down button on scroll
chatsContainer.addEventListener("scroll", () => {
    if (!isAtBottom()) {
        scrollDownBtn.style.display = "flex";
    } else {
        scrollDownBtn.style.display = "none";
    }
});

// Scroll to bottom on button click
scrollDownBtn.addEventListener("click", () => {
    chatsContainer.scrollTo({ top: chatsContainer.scrollHeight, behavior: "smooth" });
    scrollDownBtn.style.display = "none";
});

// Initial scroll to bottom on load
window.addEventListener("DOMContentLoaded", scrollToBottom);