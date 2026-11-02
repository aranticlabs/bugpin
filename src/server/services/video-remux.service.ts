import {
  BufferSource,
  BufferTarget,
  Conversion,
  EncodedPacketSink,
  Input,
  Mp4OutputFormat,
  MP4,
  Output,
  WEBM,
  WebMOutputFormat,
} from 'mediabunny';
import { Result } from '../utils/result.js';

export interface RemuxInput {
  data: Buffer | Uint8Array;
  mimeType: string;
}

interface TrackStats {
  type: string;
  packetCount: number;
}

const MAX_RECORDING_PACKETS = 300_000;
const MAX_RECORDING_TRACKS = 2;

class RemuxLimitError extends Error {}

interface Mp4Box {
  type: string;
  contentStart: number;
  end: number;
}

function readMp4Box(view: DataView, start: number, parentEnd: number): Mp4Box | null {
  if (parentEnd - start < 8) return null;

  const size32 = view.getUint32(start);
  const type = String.fromCharCode(
    view.getUint8(start + 4),
    view.getUint8(start + 5),
    view.getUint8(start + 6),
    view.getUint8(start + 7)
  );
  let headerSize = 8;
  let size = size32;

  if (size32 === 1) {
    if (parentEnd - start < 16) return null;
    const extendedSize = view.getBigUint64(start + 8);
    if (extendedSize > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Recording MP4 box structure is invalid');
    }
    headerSize = 16;
    size = Number(extendedSize);
  } else if (size32 === 0) {
    size = parentEnd - start;
  }

  const end = start + size;
  if (size < headerSize) {
    throw new Error('Recording MP4 box structure is invalid');
  }
  if (end > parentEnd) return null;
  return { type, contentStart: start + headerSize, end };
}

function validateMp4PacketCount(data: Buffer | Uint8Array): void {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let packetCount = 0;
  let containerCount = 0;

  const addPackets = (count: number): void => {
    packetCount += count;
    if (packetCount > MAX_RECORDING_PACKETS) {
      throw new RemuxLimitError('Recording exceeds the packet limit');
    }
  };

  const matchesType = (offset: number, type: string): boolean =>
    offset + 4 <= data.byteLength &&
    type.length === 4 &&
    view.getUint8(offset) === type.charCodeAt(0) &&
    view.getUint8(offset + 1) === type.charCodeAt(1) &&
    view.getUint8(offset + 2) === type.charCodeAt(2) &&
    view.getUint8(offset + 3) === type.charCodeAt(3);

  const scanMetadata = (start: number, end: number): void => {
    for (let offset = start; offset + 12 <= end; offset += 1) {
      if (matchesType(offset, 'mfra')) {
        throw new RemuxLimitError('Recording MP4 random access metadata is unsupported');
      }
      if (matchesType(offset, 'tfra')) {
        throw new RemuxLimitError('Recording MP4 random access metadata is unsupported');
      }
      if (
        matchesType(offset, 'saiz') ||
        matchesType(offset, 'schm') ||
        matchesType(offset, 'tenc')
      ) {
        throw new RemuxLimitError('Recording encrypted MP4 metadata is unsupported');
      }

      const extended = offset >= 4 && view.getUint32(offset - 4) === 1;
      if (matchesType(offset, 'trun')) {
        const countOffset = offset + (extended ? 16 : 8);
        if (countOffset + 4 <= end) addPackets(view.getUint32(countOffset));
        offset += 3;
      } else if (matchesType(offset, 'stsz') || matchesType(offset, 'stz2')) {
        const countOffset = offset + (extended ? 20 : 12);
        if (countOffset + 4 <= end) addPackets(view.getUint32(countOffset));
        offset += 3;
      } else if (
        matchesType(offset, 'stts') ||
        matchesType(offset, 'ctts') ||
        matchesType(offset, 'stsc') ||
        matchesType(offset, 'stss') ||
        matchesType(offset, 'stco') ||
        matchesType(offset, 'co64')
      ) {
        const countOffset = offset + (extended ? 16 : 8);
        if (countOffset + 4 <= end && view.getUint32(countOffset) > MAX_RECORDING_PACKETS) {
          throw new RemuxLimitError('Recording metadata table exceeds the entry limit');
        }
        offset += 3;
      }
    }
  };

  if (data.byteLength >= 8) {
    const mfraSize = view.getUint32(data.byteLength - 4);
    const mfraStart = data.byteLength - mfraSize;
    if (mfraSize >= 8 && mfraStart >= 0 && matchesType(mfraStart + 4, 'mfra')) {
      throw new RemuxLimitError('Recording MP4 random access metadata is unsupported');
    }
  }

  let offset = 0;
  while (offset < data.byteLength) {
    const box = readMp4Box(view, offset, data.byteLength);
    if (!box) break;
    if (box.type === 'mfra') {
      throw new RemuxLimitError('Recording MP4 random access metadata is unsupported');
    }
    if (box.type === 'moof') {
      containerCount += 1;
      if (containerCount > MAX_RECORDING_PACKETS) {
        throw new RemuxLimitError('Recording exceeds the container limit');
      }
    }
    if (box.type === 'moov' || box.type === 'moof') {
      scanMetadata(box.contentStart, box.end);
    }
    offset = box.end;
  }
}

interface EbmlElement {
  start: number;
  id: number;
  contentStart: number;
  end: number;
}

function readEbmlVintLength(data: Buffer | Uint8Array, offset: number): number {
  const first = data[offset];
  if (first === undefined || first === 0) return 0;
  let mask = 0x80;
  let length = 1;
  while ((first & mask) === 0) {
    mask >>= 1;
    length += 1;
  }
  return length <= 8 && offset + length <= data.byteLength ? length : 0;
}

function readEbmlElement(
  data: Buffer | Uint8Array,
  offset: number,
  parentEnd: number
): EbmlElement | null {
  const idLength = readEbmlVintLength(data, offset);
  if (!idLength) return null;
  const sizeOffset = offset + idLength;
  const sizeLength = readEbmlVintLength(data, sizeOffset);
  if (!sizeLength) return null;

  let id = 0;
  for (let index = 0; index < idLength; index += 1) {
    id = id * 256 + data[offset + index]!;
  }

  const marker = 1 << (8 - sizeLength);
  const firstSizeByte = data[sizeOffset]!;
  let size = firstSizeByte & (marker - 1);
  for (let index = 1; index < sizeLength; index += 1) {
    size = size * 256 + data[sizeOffset + index]!;
  }
  const unknownSize = firstSizeByte === 0xff || size === 2 ** 56;

  const contentStart = sizeOffset + sizeLength;
  const end = unknownSize ? parentEnd : contentStart + size;
  if (end > parentEnd) return null;
  return { start: offset, id, contentStart, end };
}

function validateWebmPacketCount(data: Buffer | Uint8Array): void {
  const SEGMENT_ID = 0x18538067;
  const SEEK_HEAD_ID = 0x114d9b74;
  const CLUSTER_ID = 0x1f43b675;
  const CUES_ID = 0x1c53bb6b;
  const SIMPLE_BLOCK_ID = 0xa3;
  const BLOCK_GROUP_ID = 0xa0;
  const BLOCK_ID = 0xa1;
  const BLOCK_ADDITIONS_ID = 0x75a1;
  const ALLOWED_CLUSTER_IDS = new Set([0xe7, 0xa7, 0xab, 0x5854, 0xec, 0xbf]);
  const ALLOWED_BLOCK_GROUP_IDS = new Set([0x9b, 0xfa, 0xfb, 0xa4, 0x75a2, 0xa2, 0xfd]);
  const LEVEL_ONE_IDS = new Set([
    0x114d9b74,
    0x1549a966,
    0x1654ae6b,
    CUES_ID,
    0x1941a469,
    0x1043a770,
    0x1254c367,
    CLUSTER_ID,
  ]);
  const clusterRanges: Array<{ start: number; end: number }> = [];
  const seekHeadStarts: number[] = [];
  let packetCount = 0;
  let clusterCount = 0;
  let segmentCount = 0;

  const countCluster = (): void => {
    clusterCount += 1;
    if (clusterCount > MAX_RECORDING_PACKETS) {
      throw new RemuxLimitError('Recording exceeds the container limit');
    }
  };

  const countBlock = (element: EbmlElement): void => {
    const trackLength = readEbmlVintLength(data, element.contentStart);
    const flagsOffset = element.contentStart + trackLength + 2;
    if (!trackLength || flagsOffset >= element.end) return;
    const lacing = data[flagsOffset]! & 0x06;
    const frameCount = lacing === 0 ? 1 : (data[flagsOffset + 1] ?? 0) + 1;
    packetCount += frameCount;
    if (packetCount > MAX_RECORDING_PACKETS) {
      throw new RemuxLimitError('Recording exceeds the packet limit');
    }
  };

  const validateBlockGroup = (start: number, end: number): void => {
    let offset = start;
    while (offset < end) {
      const element = readEbmlElement(data, offset, end);
      if (!element) break;
      if (element.id === BLOCK_ID) {
        countBlock(element);
      } else if (element.id === BLOCK_ADDITIONS_ID) {
        throw new RemuxLimitError('Recording WebM block additions are unsupported');
      } else if (!ALLOWED_BLOCK_GROUP_IDS.has(element.id)) {
        throw new Error('Recording WebM block group structure is invalid');
      }
      offset = element.end;
    }
  };

  const validateCluster = (cluster: EbmlElement): number => {
    let offset = cluster.contentStart;
    while (offset < cluster.end) {
      const element = readEbmlElement(data, offset, cluster.end);
      if (!element) return offset;
      if (LEVEL_ONE_IDS.has(element.id)) return element.start;
      if (element.id === SIMPLE_BLOCK_ID) {
        countBlock(element);
      } else if (element.id === BLOCK_GROUP_ID) {
        validateBlockGroup(element.contentStart, element.end);
      } else if (!ALLOWED_CLUSTER_IDS.has(element.id)) {
        throw new Error('Recording WebM cluster structure is invalid');
      }
      offset = element.end;
    }
    return offset;
  };

  const validateSegment = (start: number, end: number): void => {
    let offset = start;
    while (offset < end) {
      const element = readEbmlElement(data, offset, end);
      if (!element) break;
      if (element.id === CUES_ID) {
        throw new RemuxLimitError('Recording WebM cues are unsupported');
      }
      if (element.id === SEEK_HEAD_ID) {
        seekHeadStarts.push(element.start);
      }
      if (element.id === CLUSTER_ID) {
        countCluster();
        const clusterEnd = validateCluster(element);
        clusterRanges.push({ start: element.start, end: clusterEnd });
        offset = clusterEnd;
        continue;
      }
      offset = element.end;
    }
  };

  let offset = 0;
  while (offset < data.byteLength) {
    const element = readEbmlElement(data, offset, data.byteLength);
    if (!element) break;
    if (element.id === CUES_ID) {
      throw new RemuxLimitError('Recording WebM cues are unsupported');
    }
    if (element.id === SEGMENT_ID) {
      segmentCount += 1;
      if (segmentCount > 1) {
        throw new RemuxLimitError('Recording contains multiple WebM segments');
      }
      validateSegment(element.contentStart, element.end);
    } else if (element.id === CLUSTER_ID) {
      countCluster();
      const clusterEnd = validateCluster(element);
      clusterRanges.push({ start: element.start, end: clusterEnd });
      offset = clusterEnd;
      continue;
    }
    offset = element.end;
  }

  const bytes = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  const rejectUnvalidatedId = (
    id: Uint8Array,
    validStarts: readonly number[],
    message: string
  ): void => {
    let position = bytes.indexOf(id);
    let validIndex = 0;
    while (position >= 0) {
      while (validIndex < validStarts.length && validStarts[validIndex]! < position) validIndex += 1;
      if (validStarts[validIndex] !== position) throw new RemuxLimitError(message);
      position = bytes.indexOf(id, position + 1);
    }
  };

  rejectUnvalidatedId(
    new Uint8Array([0x1f, 0x43, 0xb6, 0x75]),
    clusterRanges.map((range) => range.start),
    'Recording contains an unvalidated WebM cluster'
  );
  rejectUnvalidatedId(
    new Uint8Array([0x11, 0x4d, 0x9b, 0x74]),
    seekHeadStarts,
    'Recording contains an unvalidated WebM seek head'
  );
  rejectUnvalidatedId(
    new Uint8Array([0x1c, 0x53, 0xbb, 0x6b]),
    [],
    'Recording WebM cues are unsupported'
  );
}

async function getTrackStats(input: Input, maxPacketBytes: number): Promise<TrackStats[]> {
  const tracks = await input.getTracks();
  if (tracks.length > MAX_RECORDING_TRACKS) {
    throw new RemuxLimitError('Recording exceeds the track limit');
  }
  const stats: TrackStats[] = [];
  let totalPacketCount = 0;
  let totalPacketBytes = 0;

  for (const track of tracks) {
    let packetCount = 0;
    const sink = new EncodedPacketSink(track);
    for await (const packet of sink.packets()) {
      packetCount += 1;
      totalPacketCount += 1;
      totalPacketBytes += packet.byteLength;
      if (totalPacketCount > MAX_RECORDING_PACKETS) {
        throw new RemuxLimitError('Recording exceeds the packet limit');
      }
      if (totalPacketBytes > maxPacketBytes) {
        throw new RemuxLimitError('Recording packet data exceeds the container size');
      }
    }
    stats.push({ type: track.type, packetCount });
  }

  return stats;
}

export async function remuxRecording(input: RemuxInput): Promise<Result<Uint8Array>> {
  if (input.mimeType !== 'video/mp4' && input.mimeType !== 'video/webm') {
    return Result.fail('Recording format cannot be remuxed', 'UNSUPPORTED_RECORDING_FORMAT');
  }

  let source: Input | undefined;
  let output: Output | undefined;

  try {
    if (input.mimeType === 'video/mp4') {
      validateMp4PacketCount(input.data);
    } else {
      validateWebmPacketCount(input.data);
    }
    const format =
      input.mimeType === 'video/mp4'
        ? new Mp4OutputFormat({ fastStart: 'in-memory' })
        : new WebMOutputFormat();
    const sourceFormat =
      input.data.byteLength >= 8 &&
      input.data[4] === 0x66 &&
      input.data[5] === 0x74 &&
      input.data[6] === 0x79 &&
      input.data[7] === 0x70
        ? MP4
        : WEBM;
    source = new Input({ source: new BufferSource(input.data), formats: [sourceFormat] });
    const target = new BufferTarget();
    output = new Output({ format, target });
    const sourceTracks = await getTrackStats(source, input.data.byteLength);

    const conversion = await Conversion.init({
      input: source,
      output,
      copy: { mode: 'forced', boundaryTolerance: Infinity, shiftTolerance: Infinity },
      showWarnings: false,
    });

    if (!conversion.isValid || conversion.discardedTracks.length > 0) {
      const reasons = conversion.discardedTracks.map((track) => track.reason).join('; ');
      return Result.fail(
        reasons
          ? `Recording contains tracks that cannot be remuxed: ${reasons}`
          : 'Recording contains tracks that cannot be remuxed',
        'REMUX_TRACKS_DROPPED'
      );
    }

    await conversion.execute();
    if (!target.buffer) {
      return Result.fail('Recording remux produced no output', 'REMUX_FAILED');
    }

    const remuxed = new Uint8Array(target.buffer);
    const outputFormat = input.mimeType === 'video/mp4' ? MP4 : WEBM;
    const remuxedInput = new Input({ source: new BufferSource(remuxed), formats: [outputFormat] });
    try {
      const remuxedTracks = await getTrackStats(remuxedInput, remuxed.byteLength);
      const tracksMatch =
        sourceTracks.length === remuxedTracks.length &&
        sourceTracks.every(
          (track, index) =>
            track.type === remuxedTracks[index]?.type &&
            track.packetCount === remuxedTracks[index]?.packetCount
        );
      if (!tracksMatch) {
        return Result.fail('Recording changed tracks during remux', 'REMUX_TRACK_MISMATCH');
      }
    } finally {
      remuxedInput.dispose();
    }

    return Result.ok(remuxed);
  } catch (error) {
    if (error instanceof RemuxLimitError) {
      return Result.fail(error.message, 'REMUX_SOURCE_EXPANDS');
    }
    return Result.fail(
      error instanceof Error ? error.message : 'Recording remux failed',
      'REMUX_FAILED'
    );
  } finally {
    if (output && output.state !== 'finalized') {
      await output.cancel().catch(() => undefined);
    }
    source?.dispose();
  }
}
