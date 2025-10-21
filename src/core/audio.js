// --> Audio System: Centralized audio management for game sounds
export class AudioManager {
  constructor() {
    this.context = null;
    this.sounds = new Map();
    this.masterVolume = 0.7;
    this.sfxVolume = 0.8;
    this.musicVolume = 0.6;
    this.initialized = false;
    this.engineSource = null;
    this.engineGain = null;
    this.currentEngineSpeed = 0;
    this.activeNodes = new Set(); // Track active audio nodes for cleanup
    this.bufferPool = new Map(); // Audio buffer pool for performance
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // Create audio context (requires user interaction)
      this.context = new (window.AudioContext || window.webkitAudioContext)();

      // Create master gain node
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = this.masterVolume;
      this.masterGain.connect(this.context.destination);

      // Create separate gain nodes for different audio types
      this.sfxGain = this.context.createGain();
      this.sfxGain.gain.value = this.sfxVolume;
      this.sfxGain.connect(this.masterGain);

      this.musicGain = this.context.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);

      // Initialize engine sound
      await this.initializeEngineSound();

      this.initialized = true;
      console.log("[Audio] Audio system initialized");
    } catch (error) {
      console.warn("[Audio] Failed to initialize audio system:", error);
    }
  }

  async initializeEngineSound() {
    if (!this.context) return;

    // Create engine sound using oscillators for a scooter-like sound
    this.engineGain = this.context.createGain();
    this.engineGain.gain.value = 0;
    this.engineGain.connect(this.sfxGain);

    // Low frequency rumble
    this.engineOsc1 = this.context.createOscillator();
    this.engineOsc1.type = "sawtooth";
    this.engineOsc1.frequency.value = 40;

    // Mid frequency buzz
    this.engineOsc2 = this.context.createOscillator();
    this.engineOsc2.type = "square";
    this.engineOsc2.frequency.value = 80;

    // High frequency whine
    this.engineOsc3 = this.context.createOscillator();
    this.engineOsc3.type = "sine";
    this.engineOsc3.frequency.value = 200;

    // Connect oscillators with different gains
    const gain1 = this.context.createGain();
    gain1.gain.value = 0.6;
    this.engineOsc1.connect(gain1);
    gain1.connect(this.engineGain);

    const gain2 = this.context.createGain();
    gain2.gain.value = 0.3;
    this.engineOsc2.connect(gain2);
    gain2.connect(this.engineGain);

    const gain3 = this.context.createGain();
    gain3.gain.value = 0.1;
    this.engineOsc3.connect(gain3);
    gain3.connect(this.engineGain);

    // Start oscillators
    this.engineOsc1.start();
    this.engineOsc2.start();
    this.engineOsc3.start();
  }

  updateEngineSound(speed, throttle = 0) {
    if (!this.engineGain || !this.context) return;

    const normalizedSpeed = Math.min(speed / 20, 1); // Normalize to 0-1
    const engineVolume = Math.max(0.1, normalizedSpeed * 0.4 + throttle * 0.3);

    // Smooth volume changes
    this.engineGain.gain.linearRampToValueAtTime(
      engineVolume,
      this.context.currentTime + 0.1
    );

    // Adjust frequencies based on speed
    if (this.engineOsc1) {
      this.engineOsc1.frequency.linearRampToValueAtTime(
        40 + normalizedSpeed * 30,
        this.context.currentTime + 0.1
      );
    }
    if (this.engineOsc2) {
      this.engineOsc2.frequency.linearRampToValueAtTime(
        80 + normalizedSpeed * 60,
        this.context.currentTime + 0.1
      );
    }
    if (this.engineOsc3) {
      this.engineOsc3.frequency.linearRampToValueAtTime(
        200 + normalizedSpeed * 400,
        this.context.currentTime + 0.1
      );
    }
  }

  // Generate or retrieve collision sound buffer from pool
  getCollisionBuffer(type, duration) {
    const key = `collision_${type}_${Math.round(duration * 10)}`;

    if (!this.bufferPool.has(key)) {
      const bufferSize = this.context.sampleRate * duration;
      const buffer = this.context.createBuffer(
        1,
        bufferSize,
        this.context.sampleRate
      );
      const data = buffer.getChannelData(0);

      // Generate different collision sounds based on type
      for (let i = 0; i < bufferSize; i++) {
        if (type === "metal") {
          // Metallic clang
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        } else if (type === "human") {
          // Softer thud
          data[i] =
            (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.5)) * 0.7;
        } else {
          // Default crash
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.4));
        }
      }

      this.bufferPool.set(key, buffer);
    }

    return this.bufferPool.get(key);
  }

  // Generate collision sound based on impact intensity
  playCollisionSound(intensity = 1, type = "default") {
    if (!this.context || !this.initialized) return;

    const duration = 0.2 + intensity * 0.3;
    const volume = Math.min(0.8, 0.3 + intensity * 0.5);

    // Use pooled buffer
    const buffer = this.getCollisionBuffer(type, duration);
    const source = this.context.createBufferSource();
    source.buffer = buffer;

    const gain = this.context.createGain();
    gain.gain.value = volume;

    // Apply filter based on collision type
    const filter = this.context.createBiquadFilter();
    if (type === "metal") {
      filter.type = "highpass";
      filter.frequency.value = 800;
    } else if (type === "human") {
      filter.type = "lowpass";
      filter.frequency.value = 400;
    } else {
      filter.type = "bandpass";
      filter.frequency.value = 600;
    }

    // Track nodes for cleanup
    this.activeNodes.add(source);
    this.activeNodes.add(gain);
    this.activeNodes.add(filter);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    // Auto-cleanup when sound ends
    source.onended = () => {
      this.cleanupAudioNodes([source, gain, filter]);
    };

    source.start();
    source.stop(this.context.currentTime + duration);
  }

  // Play scoring sound with pitch based on points
  playScoreSound(points) {
    if (!this.context || !this.initialized) return;

    const frequency = 400 + (points / 100) * 200; // Higher pitch for more points
    const duration = 0.3;

    const osc = this.context.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(frequency, this.context.currentTime);
    osc.frequency.exponentialRampToValueAtTime(
      frequency * 1.5,
      this.context.currentTime + 0.1
    );
    osc.frequency.exponentialRampToValueAtTime(
      frequency * 0.8,
      this.context.currentTime + duration
    );

    const gain = this.context.createGain();
    gain.gain.setValueAtTime(0.4, this.context.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      0.01,
      this.context.currentTime + duration
    );

    // Track nodes for cleanup
    this.activeNodes.add(osc);
    this.activeNodes.add(gain);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    // Auto-cleanup when sound ends
    osc.onended = () => {
      this.cleanupAudioNodes([osc, gain]);
    };

    osc.start();
    osc.stop(this.context.currentTime + duration);
  }

  // Play combo sound for consecutive hits
  playComboSound(comboCount) {
    if (!this.context || !this.initialized) return;

    const baseFreq = 600;
    const duration = 0.4;
    const nodes = [];

    for (let i = 0; i < Math.min(comboCount, 5); i++) {
      const delay = i * 0.08;
      const freq = baseFreq + i * 100;

      const osc = this.context.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;

      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, this.context.currentTime + delay);
      gain.gain.linearRampToValueAtTime(
        0.3,
        this.context.currentTime + delay + 0.05
      );
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        this.context.currentTime + delay + 0.2
      );

      // Track nodes for cleanup
      nodes.push(osc, gain);
      this.activeNodes.add(osc);
      this.activeNodes.add(gain);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      // Auto-cleanup when last oscillator ends
      if (i === Math.min(comboCount, 5) - 1) {
        osc.onended = () => {
          this.cleanupAudioNodes(nodes);
        };
      }

      osc.start(this.context.currentTime + delay);
      osc.stop(this.context.currentTime + delay + 0.2);
    }
  }

  setMasterVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
    if (this.masterGain) {
      this.masterGain.gain.value = this.masterVolume;
    }
  }

  setSFXVolume(volume) {
    this.sfxVolume = Math.max(0, Math.min(1, volume));
    if (this.sfxGain) {
      this.sfxGain.gain.value = this.sfxVolume;
    }
  }

  // Resume audio context (required after user interaction)
  resume() {
    if (this.context && this.context.state === "suspended") {
      this.context.resume();
    }
  }

  // Clean up audio nodes to prevent memory leaks
  cleanupAudioNodes(nodes) {
    nodes.forEach((node) => {
      try {
        if (node && typeof node.disconnect === "function") {
          node.disconnect();
        }
        this.activeNodes.delete(node);
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    // Remove all nodes from activeNodes in batch
    nodes.forEach((node) => this.activeNodes.delete(node));
  }

  // Clean up all active audio nodes
  cleanupAllNodes() {
    this.activeNodes.forEach((node) => {
      try {
        if (node && typeof node.disconnect === "function") {
          node.disconnect();
        }
        if (node && typeof node.stop === "function") {
          node.stop();
        }
      } catch (error) {
        // Ignore cleanup errors
      }
    });
    this.activeNodes.clear();
  }

  dispose() {
    // Stop and disconnect engine oscillators
    if (this.engineOsc1) {
      try {
        this.engineOsc1.stop();
        this.engineOsc1.disconnect();
      } catch (_) { }
    }
    if (this.engineOsc2) {
      try {
        this.engineOsc2.stop();
        this.engineOsc2.disconnect();
      } catch (_) { }
    }

    // Clean up all active nodes
    this.cleanupAllNodes();

    // Clear buffer pool
    this.bufferPool.clear();

    // Clear sounds map
    this.sounds.clear();

    // Close audio context
    if (this.context) {
      try {
        this.context.close();
      } catch (error) {
        console.warn("[Audio] Error closing audio context:", error);
      }
    }

    this.initialized = false;
  }
}

// Global audio manager instance
export const audioManager = new AudioManager();
