export class ExecutionLockManager {
  constructor() {
    this.locks = new Map();
  }

  async withDocumentLock(docId, task) {
    const previous = this.locks.get(docId) ?? Promise.resolve();
    let release;
    const current = new Promise((resolve) => {
      release = resolve;
    });

    this.locks.set(docId, current);
    await previous.catch(() => {});

    try {
      return await task();
    } finally {
      release();
      if (this.locks.get(docId) === current) {
        this.locks.delete(docId);
      }
    }
  }
}
