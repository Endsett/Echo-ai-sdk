/**
 * Enhanced streaming interfaces and utilities for Echo AI SDK
 * Provides backpressure handling, error recovery, and streaming middleware support
 */

export interface StreamChunk {
  type: "content" | "tool_call" | "error" | "metadata";
  content?: string;
  toolCall?: {
    id: string;
    name: string;
    arguments: string;
  };
  error?: {
    message: string;
    code?: string;
    retryable?: boolean;
  };
  metadata?: {
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
    model?: string;
    provider?: string;
    finish_reason?: string;
  };
}

export interface StreamOptions {
  /** Maximum buffer size before applying backpressure (default: 100 chunks) */
  maxBufferSize?: number;
  /** Timeout in milliseconds for each chunk (default: 30000) */
  chunkTimeout?: number;
  /** Enable automatic retry on retryable errors (default: true) */
  autoRetry?: boolean;
  /** Maximum retry attempts per chunk (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in milliseconds (default: 1000) */
  retryDelay?: number;
}

export interface StreamController {
  /** Pause the stream (applies backpressure) */
  pause(): void;
  /** Resume the stream */
  resume(): void;
  /** Cancel the stream with optional reason */
  cancel(reason?: string): void;
  /** Check if stream is paused */
  isPaused(): boolean;
  /** Check if stream is cancelled */
  isCancelled(): boolean;
}

/**
 * Enhanced async generator with backpressure and error handling
 */
export class EnhancedAsyncStream<T = StreamChunk> implements AsyncGenerator<T, void, unknown> {
  private buffer: T[] = [];
  private controller: ReadableStreamDefaultController<T> | null = null;
  private readable: ReadableStream<T>;
  private reader: ReadableStreamDefaultReader<T> | null = null;
  private options: Required<StreamOptions>;
  private cancelled = false;
  private paused = false;

  constructor(
    private generator: () => AsyncGenerator<T, void, unknown>,
    options: StreamOptions = {}
  ) {
    this.options = {
      maxBufferSize: options.maxBufferSize ?? 100,
      chunkTimeout: options.chunkTimeout ?? 30000,
      autoRetry: options.autoRetry ?? true,
      maxRetries: options.maxRetries ?? 3,
      retryDelay: options.retryDelay ?? 1000,
    };

    this.readable = new ReadableStream<T>({
      start: (controller) => {
        this.controller = controller;
        this.startGenerating();
      },
      cancel: (reason) => {
        this.cancelled = true;
        this.controller?.close();
      }
    });
  }

  private startGenerating(): Promise<void> {
    return new Promise((resolve, reject) => {
      (async () => {
        try {
          const gen = this.generator();
          
          while (!this.cancelled) {
            if (this.paused) {
              await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                  if (!this.paused || this.cancelled) {
                    clearInterval(checkInterval);
                    resolve(undefined);
                  }
                }, 10);
              });
            }

            if (this.cancelled) break;

            // Apply backpressure if buffer is full
            if (this.buffer.length >= this.options.maxBufferSize) {
              await new Promise(resolve => {
                const checkInterval = setInterval(() => {
                  if (this.buffer.length < this.options.maxBufferSize || this.cancelled) {
                    clearInterval(checkInterval);
                    resolve(undefined);
                  }
                }, 10);
              });
            }

            if (this.cancelled) break;

            try {
              const { done, value } = await Promise.race([
                gen.next(),
                new Promise<never>((_, reject) => 
                  setTimeout(() => reject(new Error("Chunk timeout")), this.options.chunkTimeout)
                )
              ]);

              if (done) {
                void this.controller?.close();
                break;
              }

              this.buffer.push(value);
              void this.controller?.enqueue(value);
            } catch (error: any) {
              if (this.options.autoRetry && this.isRetryableError(error)) {
                // Retry logic would be implemented by the specific provider
                console.warn("Stream chunk failed, retry may be attempted:", error.message);
              } else {
                this.controller?.error(error);
                break;
              }
            }
          }
          resolve();
        } catch (error) {
          this.controller?.error(error);
          reject(error);
        }
      })();
    });
  }

  private isRetryableError(error: any): boolean {
    // Define retryable error conditions
    return error.code === 'rate_limit_exceeded' || 
           error.code === 'temporary_unavailable' ||
           error.message?.includes('timeout');
  }

  async next(): Promise<IteratorResult<T, void>> {
    if (!this.reader) {
      this.reader = this.readable.getReader();
    }
    const result = await this.reader.read();
    return result.done 
      ? { done: true, value: undefined as any }
      : { done: false, value: result.value as T };
  }

  async return(value?: void): Promise<IteratorResult<T, void>> {
    if (!this.reader) {
      this.reader = this.readable.getReader();
    }
    // ReadableStreamDefaultReader doesn't have return method
    // We'll close the stream instead
    this.controller?.close();
    return { done: true, value: undefined as any };
  }

  async throw(error?: any): Promise<IteratorResult<T, void>> {
    if (!this.reader) {
      this.reader = this.readable.getReader();
    }
    // ReadableStreamDefaultReader doesn't have throw method
    // We'll error the stream instead
    this.controller?.error(error);
    return { done: true, value: undefined as any };
  }

  [Symbol.asyncIterator](): AsyncGenerator<T, void, unknown> {
    return this;
  }

  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
  }

  cancel(reason?: string): void {
    this.cancelled = true;

    this.reader?.cancel(reason);
    this.controller?.close();
  }

  isPaused(): boolean {
    return this.paused;
  }

  isCancelled(): boolean {
    return this.cancelled;
  }
}

/**
 * Transform stream for applying middleware to chunks
 */
export class StreamTransformer {
  private readable: ReadableStream<StreamChunk>;
  private writable: WritableStream<StreamChunk>;

  constructor(
    private transformFn: (chunk: StreamChunk) => Promise<StreamChunk> | StreamChunk
  ) {
    let controller: ReadableStreamDefaultController<StreamChunk>;
    
    this.readable = new ReadableStream({
      start(c) {
        controller = c;
      }
    });

    this.writable = new WritableStream({
      async write(chunk) {
        try {
          const transformed = await transformFn(chunk);
          controller.enqueue(transformed);
        } catch (error) {
          controller.error(error);
        }
      },
      close() {
        controller.close();
      }
    });
  }

  getReadable() {
    return this.readable;
  }

  getWritable() {
    return this.writable;
  }
}

/**
 * Utility to convert a stream to Server-Sent Events format
 */
export async function* streamToSSE(stream: AsyncGenerator<StreamChunk>): AsyncGenerator<string, void, unknown> {
  for await (const chunk of stream) {
    switch (chunk.type) {
      case "content":
        yield `event: content\ndata: ${JSON.stringify({ content: chunk.content })}\n\n`;
        break;
      case "tool_call":
        yield `event: tool_call\ndata: ${JSON.stringify(chunk.toolCall)}\n\n`;
        break;
      case "error":
        yield `event: error\ndata: ${JSON.stringify({ error: chunk.error })}\n\n`;
        break;
      case "metadata":
        yield `event: metadata\ndata: ${JSON.stringify(chunk.metadata)}\n\n`;
        break;
    }
  }
}

/**
 * Create a stream controller for managing stream lifecycle
 */
export function createStreamController(): StreamController {
  let paused = false;
  let cancelled = false;

  return {
    pause: () => { paused = true; },
    resume: () => { paused = false; },
    cancel: (reason?: string) => { cancelled = true; },
    isPaused: () => paused,
    isCancelled: () => cancelled,
  };
}

/**
 * Merge multiple streams into a single interleaved stream
 */
export async function* mergeStreams<T>(streams: AsyncGenerator<T>[]): AsyncGenerator<T, void, unknown> {
  const promises = streams.map(stream => 
    (async function*() {
      for await (const item of stream) {
        yield { stream, item };
      }
    })()
  );

  const merged = mergeGenerators(promises);
  
  for await (const { item } of merged) {
    yield item;
  }
}

/**
 * Helper to merge multiple async generators
 */
async function* mergeGenerators<T>(generators: AsyncGenerator<T>[]): AsyncGenerator<T, void, unknown> {
  const promises = new Set<Promise<IteratorResult<T>>>();
  
  // Start all generators
  for (const gen of generators) {
    const promise = gen.next();
    promises.add(promise);
  }

  while (promises.size > 0) {
    const { done, value } = await Promise.race(promises);
    
    // Find which promise resolved
    for (const promise of promises) {
      if (promise === Promise.race([promise])) {
        promises.delete(promise);
        
        if (!done) {
          yield value;
          // Add next item from this generator
          const gen = generators.find(g => g.next() === promise);
          if (gen) {
            promises.add(gen.next());
          }
        }
        break;
      }
    }
  }
}
