// A real-time voice call with an agent through the media server
// (voice-realtime-be; protocol: docs/browser-protocol.md in that repo).
//
// The browser streams the microphone as 16 kHz 16-bit mono PCM and plays the
// agent's PCM back. Text messages report what each side says; on
// "interruption" all queued audio stops at once. Framework-free so any screen
// can use it: create, then start(mediaUrl) from a click handler.

const INPUT_RATE = 16000;

// Runs off the main thread: turns the microphone into 16 kHz PCM and hands it
// over 40 ms at a time.
const MIC_WORKLET = `
class Mic extends AudioWorkletProcessor {
  constructor() {
    super();
    this.step = ${INPUT_RATE} / sampleRate;
    this.pos = 0; this.sum = 0; this.count = 0; this.len = 0;
    this.out = new Int16Array(${INPUT_RATE / 25});
  }
  process(inputs) {
    const samples = inputs[0][0];
    if (!samples) return true;
    for (let i = 0; i < samples.length; i++) {
      this.sum += samples[i];
      this.count++;
      this.pos += this.step;
      if (this.pos < 1) continue;
      this.pos -= 1;
      const v = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0; this.count = 0;
      this.out[this.len++] = v < 0 ? v * 32768 : v * 32767;
      if (this.len === this.out.length) {
        const chunk = this.out.slice();
        this.port.postMessage(chunk.buffer, [chunk.buffer]);
        this.len = 0;
      }
    }
    return true;
  }
}
registerProcessor("mic", Mic);
`;

export const ENDED_COPY = {
  caller_hangup: 'You hung up.',
  agent_hangup: 'The agent ended the call.',
  transferred: 'The agent handed the call to a person. On a real call your team would pick up here.',
  idle_timeout: 'The call ended after a long silence.',
  error: 'The call ended because of a problem.',
};

export const voiceCallSupported = () =>
  typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.AudioWorkletNode === 'function';

/**
 * handlers: {
 *   onState(state)            connecting | listening | thinking | speaking | ended
 *   onAgentText(delta)        the next piece of what the agent says
 *   onCallerText(text, final) what the caller said (final: false is a live guess)
 *   onInterrupted(cut)        the caller started speaking; cut: the agent was talking
 *   onNote(message)           a problem that doesn't end the call
 *   onEnded(message, bad)     the call is over
 *   onLevel(0..1)             microphone level
 * }
 */
export class VoiceCall {
  constructor(handlers = {}) {
    this.h = handlers;
    this.state = 'idle';
    this.ready = false;
    this.ended = false;
    this.hangingUp = false;
    this.thinking = false;
    this.nextAt = 0;
    this.outputRate = 24000;
    this.playing = new Set();
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.h.onState?.(state);
  }

  /**
   * Lets audio play later. Call it synchronously in the click handler that
   * starts the call (before any await): some browsers only allow audio to
   * start from a click.
   */
  unlock() {
    if (this.audio || typeof AudioContext === 'undefined') return;
    this.audio = new AudioContext({ latencyHint: 'interactive' });
    this.audio.resume().catch(() => {});
  }

  /** Opens the microphone and the call. */
  async start(mediaUrl) {
    this.setState('connecting');
    if (!voiceCallSupported()) {
      return this.finish("This browser can't do voice calls: try a current Chrome, Edge or Firefox.", true);
    }
    try {
      this.unlock();
      await this.audio.resume();
      this.mic = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      await this.audio.audioWorklet.addModule(URL.createObjectURL(new Blob([MIC_WORKLET], { type: 'application/javascript' })));
    } catch (e) {
      const denied = e.name === 'NotAllowedError' || e.name === 'SecurityError';
      return this.finish(
        denied
          ? "Microphone access was blocked. Allow it for this site in the browser's address bar, then try again."
          : e.name === 'NotFoundError'
            ? 'No microphone was found.'
            : `The microphone couldn't be started: ${e.message}`,
        true,
      );
    }
    if (this.ended) return;

    const ws = new WebSocket(mediaUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') return this.onMessage(JSON.parse(ev.data));
      if (this.ended) return;
      this.thinking = false;
      this.play(ev.data);
    };
    ws.onclose = () => {
      if (this.hangingUp) this.finish(ENDED_COPY.caller_hangup);
      else this.finish(this.ready ? 'The connection was lost.' : "Couldn't start the call: try again.", true);
    };

    const source = this.audio.createMediaStreamSource(this.mic);
    const node = new AudioWorkletNode(this.audio, 'mic');
    node.port.onmessage = (ev) => {
      if (this.ended) return;
      if (this.ready && !this.hangingUp && ws.readyState === WebSocket.OPEN) ws.send(ev.data);
      const pcm = new Int16Array(ev.data);
      let sum = 0;
      for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i];
      this.h.onLevel?.(Math.min(1, Math.sqrt(Math.sqrt(sum / pcm.length) / 32768) * 1.8));
    };
    source.connect(node);
    node.connect(this.audio.destination); // silent: keeps the browser running it

    this.timer = setInterval(() => {
      if (this.ready && !this.ended) this.setState(this.isPlaying() ? 'speaking' : this.thinking ? 'thinking' : 'listening');
    }, 100);
  }

  onMessage(m) {
    switch (m.type) {
      case 'ready':
        this.ready = true;
        this.outputRate = m.output_sample_rate;
        this.language = m.language;
        this.sessionId = m.session_id;
        break;
      case 'agent_text':
        this.h.onAgentText?.(m.text);
        break;
      case 'caller_text':
        if (m.final) this.thinking = true;
        this.h.onCallerText?.(m.text, !!m.final);
        break;
      case 'interruption': {
        // It comes each time the caller starts speaking, playing or not.
        const cut = this.isPlaying();
        this.stopPlaying();
        this.thinking = false;
        this.h.onInterrupted?.(cut);
        break;
      }
      case 'error':
        if (m.code === 'speech_error') this.h.onNote?.(m.message);
        else this.finish(m.message, true);
        break;
      case 'call_ended':
        this.finish(ENDED_COPY[m.reason] ?? 'The call ended.', m.reason === 'error');
        break;
      default:
    }
  }

  isPlaying() {
    return !!this.audio && this.audio.state !== 'closed' && this.audio.currentTime < this.nextAt;
  }

  // Plays a chunk right after the one before it.
  play(data) {
    const pcm = new Int16Array(data);
    if (!pcm.length) return;
    const buffer = this.audio.createBuffer(1, pcm.length, this.outputRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < pcm.length; i++) channel[i] = pcm[i] / 32768;
    const src = this.audio.createBufferSource();
    src.buffer = buffer;
    src.connect(this.audio.destination);
    const now = this.audio.currentTime;
    if (this.nextAt < now + 0.02) this.nextAt = now + 0.06; // a little room for the network
    src.start(this.nextAt);
    this.nextAt += buffer.duration;
    this.playing.add(src);
    src.onended = () => this.playing.delete(src);
  }

  stopPlaying() {
    for (const src of this.playing) {
      try {
        src.stop();
      } catch {
        /* already over */
      }
    }
    this.playing.clear();
    this.nextAt = 0;
  }

  hangUp() {
    if (this.ended) return;
    this.stopPlaying();
    this.hangingUp = true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'hangup' }));
      this.hangupTimer = setTimeout(() => this.finish(ENDED_COPY.caller_hangup), 3000);
    } else {
      this.finish(ENDED_COPY.caller_hangup);
    }
  }

  // Ends the call on this side, once. Audio already on its way can finish.
  finish(message, bad = false) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.timer);
    clearTimeout(this.hangupTimer);
    this.mic?.getTracks().forEach((t) => t.stop());
    if (this.ws && this.ws.readyState <= 1) this.ws.close();
    if (this.audio && this.audio.state !== 'closed') {
      const left = Math.max(0, this.nextAt - this.audio.currentTime);
      setTimeout(() => {
        if (this.audio.state !== 'closed') this.audio.close();
      }, left * 1000 + 200);
    }
    this.h.onLevel?.(0);
    this.setState('ended');
    this.h.onEnded?.(message, bad);
  }

  /** Stops everything at once (leaving the screen). */
  dispose() {
    this.stopPlaying();
    this.hangingUp = true;
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify({ type: 'hangup' }));
    this.finish(ENDED_COPY.caller_hangup);
  }
}
