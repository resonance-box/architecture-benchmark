import { ISong, createSong } from '@architecture-benchmark/song-ts'
import { SoundFont2SynthNode } from 'sf2-synth-audio-worklet'
import {
  DEFAULT_LOOK_AHEAD_TIME,
  millisecondsToTicks,
  ticksToSeconds,
} from '../shared'
import { Player, PlayerImpl } from './player'
import { disassembleNote } from './utils'

export interface EngineConfig {
  lookAheadTime?: number
}

export interface Engine {
  play: () => void
  stop: () => void
  getCurrentTicks: () => number
  getCurrentSeconds: () => number
  getBpm: () => number
  setBpm: (bpm: number) => void
  getPpq: () => number
  setPpq: (ppq: number) => void
  getSong: () => ISong
  setSynthesizerNode: (node: SoundFont2SynthNode) => void
}

class EngineImpl implements Engine {
  private readonly lookAheadTime: number
  private scheduledTicks: number
  private readonly player: Player
  private readonly song: ISong
  private synthesizerNode?: SoundFont2SynthNode

  constructor(song: ISong, config?: EngineConfig) {
    this.lookAheadTime = config?.lookAheadTime ?? DEFAULT_LOOK_AHEAD_TIME
    this.scheduledTicks = 0
    this.player = new PlayerImpl()
    this.song = song
    this.synthesizerNode = undefined

    this.player.onUpdate = ({ ticks }) => {
      const startTicks = this.scheduledTicks

      const endTicks =
        ticks +
        millisecondsToTicks(
          this.lookAheadTime,
          this.player.bpm,
          this.player.ppq,
        )

      this.song
        .getEvents({
          ticksRange: {
            start: startTicks,
            end: endTicks,
            withinDuration: false,
          },
        })
        .forEach((event) => {
          const [noteOnEvent, noteOffEvent] = disassembleNote(event)

          if (this.synthesizerNode !== undefined) {
            const noteOnDelayTicks = noteOnEvent.ticks - startTicks
            const noteOnDelayTime = Math.max(
              0,
              ticksToSeconds(
                noteOnDelayTicks,
                this.player.bpm,
                this.player.ppq,
              ),
            )

            this.synthesizerNode.noteOn(
              0,
              noteOnEvent.noteNumber,
              noteOnEvent.velocity,
              noteOnDelayTime,
            )

            const noteOffDelayTicks = noteOffEvent.ticks - startTicks
            const noteOffDelayTime = Math.max(
              0,
              ticksToSeconds(
                noteOffDelayTicks,
                this.player.bpm,
                this.player.ppq,
              ),
            )

            this.synthesizerNode.noteOff(
              0,
              noteOffEvent.noteNumber,
              noteOffDelayTime,
            )
          }
        })

      this.scheduledTicks = endTicks
    }
  }

  get playing(): boolean {
    return this.player.playing
  }

  play(): void {
    this.player.play()
  }

  stop(): void {
    this.scheduledTicks = 0
    this.player.stop()
  }

  getCurrentTicks() {
    return this.player.ticks
  }

  getCurrentSeconds() {
    return this.player.seconds
  }

  getBpm() {
    return this.player.bpm
  }

  setBpm(bpm: number) {
    this.player.bpm = bpm
  }

  getPpq() {
    return this.player.ppq
  }

  setPpq(ppq: number) {
    this.player.ppq = ppq
  }

  getSong() {
    return this.song
  }

  setSynthesizerNode(node: SoundFont2SynthNode): void {
    this.synthesizerNode = node
  }
}

export function createEngine(config?: EngineConfig): Engine {
  const song = createSong()
  return new EngineImpl(song, config)
}