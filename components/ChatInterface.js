import { BaseComponent } from './BaseComponent.js';

export class ChatInterface extends BaseComponent {
  render() {
    const logs = this.props.logs || [];
    const isLoading = this.props.isLoading;

    this.innerHTML = `
      <div class="chat-sidebar h-full shrink-0">
        <div class="chat-header">
          <h3 class="font-bold text-lg">Gemini Assistant</h3>
          <p class="text-xs" style="color: var(--text-secondary)">Control the studio with natural language.</p>
        </div>
        
        <div id="chat-logs" class="flex-1 overflow-y-auto p-4 space-y-4" style="display: flex; flex-direction: column; gap: 1rem">
          ${logs.map(log => `
            <div class="flex ${log.sender === 'user' ? 'justify-end' : 'justify-start'}">
              <div class="message-bubble ${
                log.sender === 'user' 
                  ? 'msg-user' 
                  : log.sender === 'system'
                  ? 'msg-system'
                  : 'msg-ai'
              }">
                ${log.text}
              </div>
            </div>
          `).join('')}
          ${isLoading ? `
            <div class="flex justify-start">
              <div class="message-bubble msg-system animate-pulse">
                Thinking...
              </div>
            </div>
          ` : ''}
        </div>

        <form id="chat-form" class="chat-input-area">
          <input
            id="chat-input"
            type="text"
            placeholder="e.g. 'Record Verse 1 on Track 2'"
            class="chat-input"
            autocomplete="off"
          />
        </form>
      </div>
    `;

    const scrollContainer = this.querySelector('#chat-logs');
    if (scrollContainer) scrollContainer.scrollTop = scrollContainer.scrollHeight;

    this.bind('#chat-form', 'submit', (e) => {
      e.preventDefault();
      const input = this.querySelector('#chat-input');
      const val = input.value.trim();
      if (!val || isLoading) return;
      
      if (this.props.onSendMessage) this.props.onSendMessage(val);
      input.value = '';
    });
  }
}

customElements.define('chat-interface', ChatInterface);