export interface DataPoint {
  readonly streamId: string;
  readonly timestamp: number;
  readonly fields: Record<string, number | string | boolean>;
}

export interface StreamPlugin {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category: 'environment' | 'information' | 'financial' | 'social';
  connect(signal: AbortSignal): AsyncIterable<DataPoint>;
}
