/**
 * Push-based async queue bridging imperative sends to the SDK's
 * AsyncIterable streaming-input mode. push() resolves a pending next();
 * end() terminates the iterable.
 */
export class AsyncQueue<T> implements AsyncIterable<T> {
  private buffer: T[] = []
  private pending: ((result: IteratorResult<T>) => void) | null = null
  private ended = false

  push(item: T): void {
    if (this.ended) {
      return
    }
    if (this.pending) {
      const resolve = this.pending
      this.pending = null
      resolve({ value: item, done: false })
    } else {
      this.buffer.push(item)
    }
  }

  end(): void {
    this.ended = true
    if (this.pending) {
      const resolve = this.pending
      this.pending = null
      resolve({ value: undefined, done: true })
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.buffer.length > 0) {
          return Promise.resolve({ value: this.buffer.shift() as T, done: false })
        }
        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise((resolve) => {
          this.pending = resolve
        })
      }
    }
  }
}
