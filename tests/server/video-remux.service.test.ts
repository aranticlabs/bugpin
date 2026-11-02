import { describe, expect, it, spyOn } from 'bun:test';
import { join } from 'node:path';
import {
  ALL_FORMATS,
  BufferSource,
  Input,
} from '../../src/server/node_modules/mediabunny/dist/modules/src/index.js';
import { remuxRecording } from '../../src/server/services/video-remux.service';

const fixturesDir = join(import.meta.dir, '../fixtures/video-remux');

interface TrackSummary {
  type: string;
  packetCount: number;
  duration: number;
  firstTimestamp: number;
}

async function inspectTracks(data: Uint8Array): Promise<TrackSummary[]> {
  const input = new Input({ source: new BufferSource(data), formats: ALL_FORMATS });
  try {
    const tracks = await input.getTracks();
    return await Promise.all(
      tracks.map(async (track) => ({
        type: track.type,
        packetCount: (await track.computePacketStats()).packetCount,
        duration: await track.computeDuration(),
        firstTimestamp: await track.getFirstTimestamp(),
      }))
    );
  } finally {
    input.dispose();
  }
}

function getMovieHeaderDuration(data: Uint8Array): bigint {
  const buffer = Buffer.from(data);
  const typeOffset = buffer.indexOf('mvhd');
  if (typeOffset < 0) throw new Error('MP4 has no movie header');
  return buffer[typeOffset + 4] === 1
    ? buffer.readBigUInt64BE(typeOffset + 28)
    : BigInt(buffer.readUInt32BE(typeOffset + 20));
}

async function buildWebmWithBlocks(block: Uint8Array, count: number): Promise<Buffer> {
  const fixture = Buffer.from(
    await Bun.file(join(fixturesDir, 'firefox-with-audio.webm')).arrayBuffer()
  );
  const clusterOffset = fixture.indexOf(Buffer.from([0x1f, 0x43, 0xb6, 0x75]));
  const clusterContentStart = clusterOffset + 12;
  const data = Buffer.alloc(clusterContentStart + block.byteLength * count);
  fixture.copy(data, 0, 0, clusterContentStart);
  for (let index = 0; index < count; index += 1) {
    data.set(block, clusterContentStart + index * block.byteLength);
  }
  return data;
}

const browserRecordings = [
  {
    filename: 'chrome-with-audio.mp4',
    mimeType: 'video/mp4',
    tracks: [
      { type: 'video', packetCount: 23 },
      { type: 'audio', packetCount: 39 },
    ],
  },
  {
    filename: 'chrome-without-audio.mp4',
    mimeType: 'video/mp4',
    tracks: [{ type: 'video', packetCount: 23 }],
  },
  {
    filename: 'chrome-cut-off.mp4',
    mimeType: 'video/mp4',
    tracks: [
      { type: 'video', packetCount: 17 },
      { type: 'audio', packetCount: 29 },
    ],
  },
  {
    filename: 'firefox-with-audio.webm',
    mimeType: 'video/webm',
    tracks: [
      { type: 'video', packetCount: 21 },
      { type: 'audio', packetCount: 46 },
    ],
  },
  {
    filename: 'webkit-with-audio.mp4',
    mimeType: 'video/mp4',
    tracks: [
      { type: 'audio', packetCount: 96 },
      { type: 'video', packetCount: 46 },
    ],
  },
] as const;

describe('remuxRecording', () => {
  for (const fixture of browserRecordings) {
    it(`preserves every track and packet in ${fixture.filename}`, async () => {
      const data = await Bun.file(join(fixturesDir, fixture.filename)).bytes();
      const sourceTracks = await inspectTracks(data);
      expect(sourceTracks.map(({ type, packetCount }) => ({ type, packetCount }))).toEqual(
        fixture.tracks
      );

      const result = await remuxRecording({ data, mimeType: fixture.mimeType });
      expect(result.success).toBe(true);
      if (!result.success) return;

      const outputTracks = await inspectTracks(result.value);
      expect(outputTracks.map(({ type, packetCount }) => ({ type, packetCount }))).toEqual(
        fixture.tracks
      );
      expect(outputTracks.every((track) => track.duration > 0)).toBe(true);

      if (fixture.mimeType === 'video/mp4') {
        const output = Buffer.from(result.value);
        expect(getMovieHeaderDuration(data)).toBe(0n);
        expect(getMovieHeaderDuration(result.value)).toBeGreaterThan(0n);
        expect(output.indexOf('moov')).toBeLessThan(output.indexOf('mdat'));
      } else {
        const sourceAudio = sourceTracks.find((track) => track.type === 'audio');
        const outputAudio = outputTracks.find((track) => track.type === 'audio');
        expect(sourceAudio?.firstTimestamp).toBe(-0.001);
        expect(outputAudio?.firstTimestamp).toBeGreaterThanOrEqual(0);
        expect(Array.from(result.value.subarray(0, 4))).toEqual([0x1a, 0x45, 0xdf, 0xa3]);
      }
    });
  }

  it('rejects remux output with a different track count', async () => {
    const getTracks = Input.prototype.getTracks;
    let calls = 0;
    const getTracksSpy = spyOn(Input.prototype, 'getTracks').mockImplementation(async function (
      this: Input
    ) {
      const tracks = await getTracks.call(this);
      calls += 1;
      return calls === 3 ? tracks.slice(1) : tracks;
    });

    try {
      const data = await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).bytes();
      const result = await remuxRecording({ data, mimeType: 'video/mp4' });
      expect(result).toEqual({
        success: false,
        error: 'Recording changed tracks during remux',
        code: 'REMUX_TRACK_MISMATCH',
      });
    } finally {
      getTracksSpy.mockRestore();
    }
  });

  for (const [filename, mimeType] of [
    ['chrome-with-audio.mp4', 'video/mp4'],
    ['firefox-with-audio.webm', 'video/webm'],
  ] as const) {
    it(`rejects more than two tracks in ${filename}`, async () => {
      const getTracks = Input.prototype.getTracks;
      const getTracksSpy = spyOn(Input.prototype, 'getTracks').mockImplementation(async function (
        this: Input
      ) {
        const tracks = await getTracks.call(this);
        return [...tracks, tracks[0]!];
      });

      try {
        const data = await Bun.file(join(fixturesDir, filename)).bytes();
        const result = await remuxRecording({ data, mimeType });
        expect(result).toEqual({
          success: false,
          error: 'Recording exceeds the track limit',
          code: 'REMUX_SOURCE_EXPANDS',
        });
      } finally {
        getTracksSpy.mockRestore();
      }
    });
  }

  it('rejects tracks that the requested output container cannot copy', async () => {
    const data = await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).bytes();
    const result = await remuxRecording({ data, mimeType: 'video/webm' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.code).toBe('REMUX_TRACKS_DROPPED');
  });

  it('rejects overlapping packet tables that expand beyond the uploaded file', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).arrayBuffer()
    );
    const videoTrackRun = data.indexOf('trun');
    const audioTrackRun = data.indexOf('trun', videoTrackRun + 4);
    expect(videoTrackRun).toBeGreaterThan(0);
    expect(audioTrackRun).toBeGreaterThan(videoTrackRun);
    data.writeUInt32BE(1, videoTrackRun + 8);
    data.writeUInt32BE(1, audioTrackRun + 8);
    data.writeInt32BE(data.readInt32BE(videoTrackRun + 12), audioTrackRun + 12);
    data.writeUInt32BE(12_000, videoTrackRun + 24);
    data.writeUInt32BE(12_000, audioTrackRun + 20);

    const result = await remuxRecording({ data, mimeType: 'video/mp4' });
    expect(result).toEqual({
      success: false,
      error: 'Recording packet data exceeds the container size',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  it('rejects declared packet totals across different fragmented tracks', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).arrayBuffer()
    );
    const videoTrackRun = data.indexOf('trun');
    const audioTrackRun = data.indexOf('trun', videoTrackRun + 4);
    data.writeUInt32BE(150_001, videoTrackRun + 8);
    data.writeUInt32BE(150_001, audioTrackRun + 8);

    const result = await remuxRecording({ data, mimeType: 'video/mp4' });
    expect(result).toEqual({
      success: false,
      error: 'Recording exceeds the packet limit',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  it('rejects oversized non-fragmented MP4 sample tables', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).arrayBuffer()
    );
    const sampleSizeBox = data.indexOf('stsz');
    data.writeUInt32BE(1, sampleSizeBox + 8);
    data.writeUInt32BE(300_001, sampleSizeBox + 12);

    const result = await remuxRecording({ data, mimeType: 'video/mp4' });
    expect(result).toEqual({
      success: false,
      error: 'Recording exceeds the packet limit',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  for (const boxType of ['stts', 'ctts', 'stsc', 'stss', 'stco', 'co64']) {
    it(`rejects oversized MP4 metadata tables in ${boxType}`, async () => {
      const data = Buffer.from(
        await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).arrayBuffer()
      );
      const sampleSizeBox = data.indexOf('stsz');
      data.write(boxType, sampleSizeBox);
      data.writeUInt32BE(300_001, sampleSizeBox + 8);

      const result = await remuxRecording({ data, mimeType: 'video/mp4' });
      expect(result).toEqual({
        success: false,
        error: 'Recording metadata table exceeds the entry limit',
        code: 'REMUX_SOURCE_EXPANDS',
      });
    });
  }

  it('rejects too many empty MP4 fragments', async () => {
    const fragmentCount = 300_001;
    const data = Buffer.alloc(8 + fragmentCount * 8);
    data.writeUInt32BE(8, 0);
    data.write('ftyp', 4);
    for (let index = 0; index < fragmentCount; index += 1) {
      const offset = 8 + index * 8;
      data.writeUInt32BE(8, offset);
      data.write('moof', offset + 4);
    }

    const result = await remuxRecording({ data, mimeType: 'video/mp4' });
    expect(result).toEqual({
      success: false,
      error: 'Recording exceeds the container limit',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  it('finds packet tables hidden in nested MP4 metadata', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).arrayBuffer()
    );
    const movieFragment = data.indexOf('moof');
    const trackFragment = data.indexOf('traf', movieFragment);
    const trackRun = data.indexOf('trun', trackFragment);
    data.write('moov', movieFragment);
    data.write('edts', trackFragment);
    data.writeUInt32BE(300_001, trackRun + 8);

    const result = await remuxRecording({ data, mimeType: 'video/mp4' });
    expect(result).toEqual({
      success: false,
      error: 'Recording exceeds the packet limit',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  it('rejects MP4 random access metadata', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).arrayBuffer()
    );
    data.write('mfra', data.indexOf('moof'));

    const result = await remuxRecording({ data, mimeType: 'video/mp4' });
    expect(result).toEqual({
      success: false,
      error: 'Recording MP4 random access metadata is unsupported',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  it('rejects MP4 track fragment random access metadata', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).arrayBuffer()
    );
    data.write('tfra', data.indexOf('stsz'));

    const result = await remuxRecording({ data, mimeType: 'video/mp4' });
    expect(result).toEqual({
      success: false,
      error: 'Recording MP4 random access metadata is unsupported',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  for (const boxType of ['saiz', 'schm', 'tenc']) {
    it(`rejects encrypted MP4 metadata in ${boxType}`, async () => {
      const data = Buffer.from(
        await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).arrayBuffer()
      );
      data.write(boxType, data.indexOf('stsz'));

      const result = await remuxRecording({ data, mimeType: 'video/mp4' });
      expect(result).toEqual({
        success: false,
        error: 'Recording encrypted MP4 metadata is unsupported',
        code: 'REMUX_SOURCE_EXPANDS',
      });
    });
  }

  it('remuxes readable MP4 packets before an incomplete root box tail', async () => {
    const complete = await Bun.file(join(fixturesDir, 'chrome-with-audio.mp4')).bytes();
    const truncated = complete.subarray(0, complete.byteLength - 6_000);
    const result = await remuxRecording({ data: truncated, mimeType: 'video/mp4' });
    expect(result.success).toBe(true);
  });

  it('rejects WebM clusters with too many plain blocks', async () => {
    const data = await buildWebmWithBlocks(new Uint8Array([0xa3, 0x84, 0x81, 0, 0, 0]), 300_001);
    const result = await remuxRecording({ data, mimeType: 'video/webm' });
    expect(result).toEqual({
      success: false,
      error: 'Recording exceeds the packet limit',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  it('rejects WebM clusters with too many laced frames', async () => {
    const data = await buildWebmWithBlocks(
      new Uint8Array([0xa3, 0x85, 0x81, 0, 0, 0x02, 0xff]),
      1_172
    );
    const result = await remuxRecording({ data, mimeType: 'video/webm' });
    expect(result).toEqual({
      success: false,
      error: 'Recording exceeds the packet limit',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  it('rejects too many empty WebM clusters', async () => {
    const clusterCount = 300_001;
    const data = Buffer.alloc(clusterCount * 5);
    for (let index = 0; index < clusterCount; index += 1) {
      data.set(new Uint8Array([0x1f, 0x43, 0xb6, 0x75, 0x80]), index * 5);
    }

    const result = await remuxRecording({ data, mimeType: 'video/webm' });
    expect(result).toEqual({
      success: false,
      error: 'Recording exceeds the container limit',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  it('accepts a root WebM cluster after a known-size segment', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'firefox-with-audio.webm')).arrayBuffer()
    );
    const segmentId = Buffer.from([0x18, 0x53, 0x80, 0x67]);
    const clusterId = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
    const segmentOffset = data.indexOf(segmentId);
    const clusterOffset = data.indexOf(clusterId);
    const segmentSize = clusterOffset - (segmentOffset + 12);
    const encodedSize = Buffer.alloc(8);
    encodedSize[0] = 1;
    encodedSize.writeUIntBE(segmentSize, 2, 6);
    encodedSize.copy(data, segmentOffset + 4);

    const result = await remuxRecording({ data, mimeType: 'video/webm' });
    expect(result.success).toBe(true);
  });

  it('accepts multiple unknown-size WebM clusters', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'firefox-with-audio.webm')).arrayBuffer()
    );
    const clusterId = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
    const clusterOffset = data.indexOf(clusterId);
    const secondCluster = Buffer.concat([
      data.subarray(clusterOffset, clusterOffset + 12),
      Buffer.from([0xe7, 0x82, 0x03, 0xe8]),
      data.subarray(clusterOffset + 15),
    ]);

    const result = await remuxRecording({
      data: Buffer.concat([data, secondCluster]),
      mimeType: 'video/webm',
    });
    expect(result.success).toBe(true);
  });

  it('rejects multiple WebM segments', async () => {
    const emptySegment = Buffer.from([0x18, 0x53, 0x80, 0x67, 0x80]);
    const result = await remuxRecording({
      data: Buffer.concat([emptySegment, emptySegment]),
      mimeType: 'video/webm',
    });
    expect(result).toEqual({
      success: false,
      error: 'Recording contains multiple WebM segments',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  for (const [id, error] of [
    [new Uint8Array([0x1f, 0x43, 0xb6, 0x75]), 'Recording contains an unvalidated WebM cluster'],
    [new Uint8Array([0x11, 0x4d, 0x9b, 0x74]), 'Recording contains an unvalidated WebM seek head'],
  ] as const) {
    it(`rejects ${error.toLowerCase()} in a block payload`, async () => {
      const data = await buildWebmWithBlocks(
        new Uint8Array([0xa3, 0x88, 0x81, 0, 0, 0, ...id]),
        1
      );

      const result = await remuxRecording({ data, mimeType: 'video/webm' });
      expect(result).toEqual({
        success: false,
        error,
        code: 'REMUX_SOURCE_EXPANDS',
      });
    });
  }

  it('rejects WebM clusters hidden after unparseable segment data', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'firefox-with-audio.webm')).arrayBuffer()
    );
    const clusterId = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
    const clusterOffset = data.indexOf(clusterId);
    const hidden = Buffer.concat([
      data.subarray(0, clusterOffset),
      Buffer.from([0]),
      data.subarray(clusterOffset),
    ]);

    const result = await remuxRecording({ data: hidden, mimeType: 'video/webm' });
    expect(result).toEqual({
      success: false,
      error: 'Recording contains an unvalidated WebM cluster',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  for (const invalidSize of [
    new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00]),
    new Uint8Array([0x1f, 0xff, 0xff, 0xff]),
  ]) {
    it(`rejects a WebM cluster hidden after oversized block size ${Buffer.from(invalidSize).toString('hex')}`, async () => {
      const fixture = Buffer.from(
        await Bun.file(join(fixturesDir, 'firefox-with-audio.webm')).arrayBuffer()
      );
      const clusterId = Buffer.from([0x1f, 0x43, 0xb6, 0x75]);
      const clusterOffset = fixture.indexOf(clusterId);
      const clusterContentStart = clusterOffset + 12;
      const hidden = Buffer.concat([
        fixture.subarray(0, clusterContentStart),
        Buffer.from([0xa3]),
        invalidSize,
        clusterId,
        Buffer.from([0x80]),
      ]);

      const result = await remuxRecording({ data: hidden, mimeType: 'video/webm' });
      expect(result).toEqual({
        success: false,
        error: 'Recording contains an unvalidated WebM cluster',
        code: 'REMUX_SOURCE_EXPANDS',
      });
    });
  }

  it('rejects WebM cues', async () => {
    const data = Buffer.from(
      await Bun.file(join(fixturesDir, 'firefox-with-audio.webm')).arrayBuffer()
    );
    const seekHead = data.indexOf(Buffer.from([0x11, 0x4d, 0x9b, 0x74]));
    data.set(new Uint8Array([0x1c, 0x53, 0xbb, 0x6b]), seekHead);

    const result = await remuxRecording({ data, mimeType: 'video/webm' });
    expect(result).toEqual({
      success: false,
      error: 'Recording WebM cues are unsupported',
      code: 'REMUX_SOURCE_EXPANDS',
    });
  });

  it('rejects unreadable recordings and unsupported formats', async () => {
    const invalid = await remuxRecording({
      data: new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70]),
      mimeType: 'video/mp4',
    });
    expect(invalid.success).toBe(false);

    const unsupported = await remuxRecording({
      data: new Uint8Array(),
      mimeType: 'video/quicktime',
    });
    expect(unsupported).toEqual({
      success: false,
      error: 'Recording format cannot be remuxed',
      code: 'UNSUPPORTED_RECORDING_FORMAT',
    });
  });
});
