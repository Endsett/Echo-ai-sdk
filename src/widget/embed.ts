export interface ChatWidgetTheme {
  primaryColor?: string;
  headerBg?: string;
  headerText?: string;
  bubbleBg?: string;
  userBubbleBg?: string;
  fontFamily?: string;
  borderRadius?: string;
  position?: "bottom-right" | "bottom-left";
  width?: string;
  height?: string;
}

export interface ChatWidgetConfig {
  serverEndpoint: string;
  title?: string;
  subtitle?: string;
  greeting?: string;
  placeholder?: string;
  theme?: ChatWidgetTheme;
  enableVoice?: boolean;
}

/**
 * Generates a self-contained, embeddable HTML/CSS/JS chatbot widget.
 * Paste the output into any website — zero dependencies required client-side.
 */
export class ChatWidget {
  static generate(config: ChatWidgetConfig): string {
    const t = config.theme || {};
    const primary = t.primaryColor || "#6366f1";
    const headerBg = t.headerBg || primary;
    const headerText = t.headerText || "#ffffff";
    const bubbleBg = t.bubbleBg || "#f3f4f6";
    const userBubbleBg = t.userBubbleBg || primary;
    const fontFamily = t.fontFamily || "'Inter', 'Segoe UI', sans-serif";
    const borderRadius = t.borderRadius || "16px";
    const position = t.position || "bottom-right";
    const width = t.width || "380px";
    const height = t.height || "520px";
    const title = config.title || "Support Chat";
    const subtitle = config.subtitle || "We typically reply instantly";
    const greeting = config.greeting || "Hello! How can I help you?";
    const placeholder = config.placeholder || "Type a message...";
    const positionCSS = position === "bottom-left" ? "left: 24px;" : "right: 24px;";
    const fabPositionCSS = position === "bottom-left" ? "left: 24px;" : "right: 24px;";
    const voiceButton = config.enableVoice ? `<button id="echoVoiceBtn" title="Voice Input">🎤</button>` : "";
    const voiceJS = config.enableVoice ? `
      const voiceBtn = document.getElementById('echoVoiceBtn');
      let isRecording = false;
      let mediaRecorder;
      let audioChunks = [];
      voiceBtn.addEventListener('click', async () => {
        if (isRecording) { mediaRecorder.stop(); voiceBtn.textContent = '🎤'; isRecording = false; return; }
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          mediaRecorder = new MediaRecorder(stream);
          audioChunks = [];
          mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
          mediaRecorder.onstop = async () => {
            stream.getTracks().forEach(t => t.stop());
            const blob = new Blob(audioChunks, { type: 'audio/webm' });
            const formData = new FormData();
            formData.append('audio', blob, 'voice.webm');
            formData.append('sessionId', sessionId);
            addMsg('🎤 Voice message sent...', true);
            try {
              const res = await fetch(endpoint + '/voice', { method: 'POST', body: formData });
              const data = await res.json();
              addMsg(data.reply, false);
              if (data.audioUrl) new Audio(data.audioUrl).play();
            } catch(e) { addMsg('Voice processing failed.', false); }
          };
          mediaRecorder.start();
          voiceBtn.textContent = '⏹️';
          isRecording = true;
        } catch(e) { addMsg('Mic access denied.', false); }
      });
    ` : "";

    return `<!-- Echo AI Chatbot Widget -->
<div id="echo-chat-fab" style="position:fixed;bottom:24px;${fabPositionCSS}z-index:99998;width:60px;height:60px;background:${primary};border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(0,0,0,0.25);transition:transform 0.2s;">
  <svg width="28" height="28" fill="${headerText}" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
</div>
<div id="echo-chat-window" style="display:none;position:fixed;bottom:96px;${positionCSS}z-index:99999;width:${width};height:${height};border-radius:${borderRadius};overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,0.2);font-family:${fontFamily};flex-direction:column;">
  <div style="background:${headerBg};color:${headerText};padding:16px 20px;">
    <div style="font-size:16px;font-weight:700;">${title}</div>
    <div style="font-size:12px;opacity:0.85;margin-top:2px;">${subtitle}</div>
  </div>
  <div id="echo-chat-msgs" style="flex:1;overflow-y:auto;padding:16px;background:#fff;display:flex;flex-direction:column;gap:8px;"></div>
  <div style="padding:12px;background:#fff;border-top:1px solid #e5e7eb;display:flex;gap:8px;align-items:center;">
    ${voiceButton}
    <input id="echo-chat-input" type="text" placeholder="${placeholder}" style="flex:1;padding:10px 14px;border:1px solid #d1d5db;border-radius:24px;outline:none;font-size:14px;font-family:${fontFamily};" />
    <button id="echo-chat-send" style="background:${primary};color:${headerText};border:none;border-radius:50%;width:38px;height:38px;cursor:pointer;font-size:16px;">➤</button>
  </div>
</div>
<script>
(function(){
  const endpoint = "${config.serverEndpoint}".replace(/\\/$/,'');
  const sessionId = 'echo_' + Math.random().toString(36).substr(2, 9);
  const fab = document.getElementById('echo-chat-fab');
  const win = document.getElementById('echo-chat-window');
  const msgs = document.getElementById('echo-chat-msgs');
  const input = document.getElementById('echo-chat-input');
  const send = document.getElementById('echo-chat-send');
  let open = false;

  win.style.display = 'none';
  win.style.flexDirection = 'column';

  fab.onclick = () => {
    open = !open;
    win.style.display = open ? 'flex' : 'none';
    fab.style.transform = open ? 'scale(0)' : 'scale(1)';
    if (open && msgs.children.length === 0) addMsg(\`${greeting}\`, false);
  };

  function addMsg(text, isUser) {
    const div = document.createElement('div');
    div.style.cssText = 'max-width:80%;padding:10px 14px;border-radius:16px;font-size:14px;line-height:1.4;word-break:break-word;'
      + (isUser ? 'align-self:flex-end;background:${userBubbleBg};color:#fff;' : 'align-self:flex-start;background:${bubbleBg};color:#1f2937;');
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  async function sendMsg() {
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    addMsg(text, true);
    const typing = document.createElement('div');
    typing.style.cssText = 'align-self:flex-start;padding:10px 14px;border-radius:16px;background:${bubbleBg};color:#9ca3af;font-size:14px;';
    typing.textContent = 'Typing...';
    msgs.appendChild(typing);
    msgs.scrollTop = msgs.scrollHeight;
    try {
      const res = await fetch(endpoint + '/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, message: text })
      });
      const data = await res.json();
      typing.remove();
      addMsg(data.reply, false);
    } catch(e) {
      typing.remove();
      addMsg('Connection error. Please try again.', false);
    }
  }

  send.onclick = sendMsg;
  input.onkeydown = e => { if (e.key === 'Enter') sendMsg(); };
  ${voiceJS}
})();
</script>`;
  }
}
