import EchoEffect from './effects/echo-effect.js';
import RobotEffect from './effects/robot-effect.js';
import VolumeEffect from './effects/volume-effect.js';
import FlangerEffect from './effects/flanger-effect.js';
import ReverbEffect from './effects/reverb-effect.js';
import FadeEffect from './effects/fade-effect.js';
import MuteEffect from './effects/mute-effect.js';
import SimpleReverb from '../simple-reverb.js';

const effectTypes = {
    ROBOT: 'robot',
    REVERSE: 'reverse',
    LOUDER: 'higher',
    SOFTER: 'lower',
    FASTER: 'faster',
    SLOWER: 'slower',
    ECHO: 'echo',
    ALIEN: 'alien',
    REVERB: 'reverb',
    MAGIC: 'magic',
    FADEIN: 'fade in',
    FADEOUT: 'fade out',
    MUTE: 'mute'
};

class AudioEffects {
    static get effectTypes () {
        return effectTypes;
    }
    constructor (buffer, name, trimStart, trimEnd, impulseResponses) {
        this.trimStartSeconds = (trimStart * buffer.length) / buffer.sampleRate;
        this.trimEndSeconds = (trimEnd * buffer.length) / buffer.sampleRate;
        this.adjustedTrimStartSeconds = this.trimStartSeconds;
        this.adjustedTrimEndSeconds = this.trimEndSeconds;

        // Some effects will modify the playback rate and/or number of samples.
        // Need to precompute those values to create the offline audio context.
        const pitchRatio = Math.pow(2, 4 / 12); // A major third
        let sampleCount = buffer.length;
        const affectedSampleCount = Math.floor((this.trimEndSeconds - this.trimStartSeconds) *
            buffer.sampleRate);
        const unaffectedSampleCount = sampleCount - affectedSampleCount;

        this.playbackRate = 1;
        switch (name) {
        case effectTypes.ECHO:
            sampleCount = Math.max(sampleCount, Math.floor((this.trimEndSeconds + 0.75) * buffer.sampleRate));
            break;
        case effectTypes.FASTER:
            this.playbackRate = pitchRatio;
            sampleCount = unaffectedSampleCount + Math.floor(affectedSampleCount / this.playbackRate);
            this.adjustedTrimEndSeconds = this.trimStartSeconds +
                ((affectedSampleCount / this.playbackRate) / buffer.sampleRate);
            break;
        case effectTypes.SLOWER:
            this.playbackRate = 1 / pitchRatio;
            sampleCount = unaffectedSampleCount + Math.floor(affectedSampleCount / this.playbackRate);
            this.adjustedTrimEndSeconds = this.trimStartSeconds +
                ((affectedSampleCount / this.playbackRate) / buffer.sampleRate);
            break;
        case effectTypes.REVERB:
        case effectTypes.MAGIC:
            sampleCount = Math.max(sampleCount, Math.floor((this.trimEndSeconds + 1) * buffer.sampleRate));
            break;
        }

        this.adjustedTrimStart = this.adjustedTrimStartSeconds / (sampleCount / buffer.sampleRate);
        this.adjustedTrimEnd = this.adjustedTrimEndSeconds / (sampleCount / buffer.sampleRate);

        if (window.OfflineAudioContext) {
            const sampleScale = 44100 / buffer.sampleRate;
            this.audioContext = new window.OfflineAudioContext(1, sampleScale * sampleCount, 44100);
        } else {
            // Need to use webkitOfflineAudioContext, which doesn't support all sample rates.
            // Resample by adjusting sample count to make room and set offline context to desired sample rate.
            const sampleScale = 44100 / buffer.sampleRate;
            this.audioContext = new window.webkitOfflineAudioContext(1, sampleScale * sampleCount, 44100);
        }

        // For the reverse effect we need to manually reverse the data into a new audio buffer
        // to prevent overwriting the original, so that the undo stack works correctly.
        // Doing buffer.reverse() would mutate the original data.
        if (name === effectTypes.REVERSE) {
            const originalBufferData = buffer.getChannelData(0);
            const newBuffer = this.audioContext.createBuffer(1, buffer.length, buffer.sampleRate);
            const newBufferData = newBuffer.getChannelData(0);
            const bufferLength = buffer.length;

            const startSamples = Math.floor(this.trimStartSeconds * buffer.sampleRate);
            const endSamples = Math.floor(this.trimEndSeconds * buffer.sampleRate);
            let counter = 0;
            for (let i = 0; i < bufferLength; i++) {
                if (i > startSamples && i < endSamples) {
                    newBufferData[i] = originalBufferData[endSamples - counter - 1];
                    counter++;
                } else {
                    newBufferData[i] = originalBufferData[i];
                }
            }
            this.buffer = newBuffer;
        } else {
            // All other effects use the original buffer because it is not modified.
            this.buffer = buffer;
        }

        this.source = this.audioContext.createBufferSource();
        this.source.buffer = this.buffer;
        this.name = name;

        this.impulseResponses = impulseResponses;
    }
    process (done) {
        // Some effects need to use more nodes and must expose an input and output
        let input;
        let output;
        switch (this.name) {
        case effectTypes.FASTER:
        case effectTypes.SLOWER:
            this.source.playbackRate.setValueAtTime(this.playbackRate, this.adjustedTrimStartSeconds);
            this.source.playbackRate.setValueAtTime(1.0, this.adjustedTrimEndSeconds);
            break;
        case effectTypes.LOUDER:
            ({input, output} = new VolumeEffect(this.audioContext, 1.25,
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.SOFTER:
            ({input, output} = new VolumeEffect(this.audioContext, 0.75,
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.ECHO:
            ({input, output} = new EchoEffect(this.audioContext, 0.25,
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.ROBOT:
            ({input, output} = new RobotEffect(this.audioContext,
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.ALIEN:
            ({input, output} = new FlangerEffect(this.audioContext,
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.MAGIC:
            ({input, output} = new ReverbEffect(this.audioContext,
                this.impulseResponses[effectTypes.MAGIC],
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.REVERB:
            ({input, output} = new ReverbEffect(this.audioContext,
                this.impulseResponses[effectTypes.REVERB],
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.MEOW:
            ({input, output} = new ReverbEffect(this.audioContext,
                this.impulseResponses[effectTypes.MEOW],
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.FADEIN:
            ({input, output} = new FadeEffect(this.audioContext, true,
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.FADEOUT:
            ({input, output} = new FadeEffect(this.audioContext, false,
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        case effectTypes.MUTE:
            ({input, output} = new MuteEffect(this.audioContext,
                this.adjustedTrimStartSeconds, this.adjustedTrimEndSeconds));
            break;
        }

        if (input && output) {
            this.source.connect(input);
            output.connect(this.audioContext.destination);
        } else {
            // No effects nodes are needed, wire directly to the output
            this.source.connect(this.audioContext.destination);
        }

        this.source.start();

        this.audioContext.startRendering();
        this.audioContext.oncomplete = ({renderedBuffer}) => {
            done(renderedBuffer, this.adjustedTrimStart, this.adjustedTrimEnd);
        };

    }
}

export default AudioEffects;
