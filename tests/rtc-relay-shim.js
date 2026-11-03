// Test-only WebRTC stand-in: the box browser's policy blocks WebRTC UDP, so the two pages are relayed through Playwright.
(() => {
  const ID = Math.random().toString(36).slice(2);
  class Chan extends EventTarget { constructor(l) { super(); this.label = l; this.readyState = 'connecting'; }
    send(d) { if (this.readyState !== 'open') throw new Error('not open'); window.__relaySend(String(d)); }
    close() { if (this.readyState === 'closed') return; this.readyState = 'closed'; window.__relayClose(); this.dispatchEvent(new Event('close')); } }
  class PC extends EventTarget { constructor() { super(); this.iceGatheringState = 'complete'; this.connectionState = 'new'; this.localDescription = null; this._ch = null; window.__pc = this; }
    createDataChannel(l) { this._ch = new Chan(l); return this._ch; }
    async createOffer() { return { type: 'offer', sdp: 'v=0\r\no=- ' + ID + ' 2 IN IP4 127.0.0.1\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' }; }
    async createAnswer() { return { type: 'answer', sdp: 'v=0\r\no=- ' + ID + ' 3 IN IP4 127.0.0.1\r\nm=application 9 UDP/DTLS/SCTP webrtc-datachannel\r\n' }; }
    async setLocalDescription(d) { this.localDescription = d; }
    async setRemoteDescription(d) { this.remote = d; if (d.type === 'answer') window.__relayLink(); }
    close() { this.connectionState = 'closed'; if (this._ch) this._ch.close(); } }
  window.RTCPeerConnection = PC;
  window.__open = () => { const pc = window.__pc; pc.connectionState = 'connected'; if (!pc._ch) { pc._ch = new Chan('lunc'); const e = new Event('datachannel'); e.channel = pc._ch; pc.dispatchEvent(e); } pc._ch.readyState = 'open'; pc._ch.dispatchEvent(new Event('open')); };
  window.__deliver = d => { const c = window.__pc && window.__pc._ch; if (c && c.readyState === 'open') { const e = new MessageEvent('message', { data: d }); c.dispatchEvent(e); } };
  window.__remoteClosed = () => { const c = window.__pc && window.__pc._ch; if (c && c.readyState === 'open') { c.readyState = 'closed'; c.dispatchEvent(new Event('close')); } };
})();
